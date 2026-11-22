import { createHash, randomUUID } from 'node:crypto';
import { externalLiveDeviceSchema, type LiveMetrics } from '@repo/shared';
import type { AppPrismaClient } from '../../db/prisma-client.js';
import { AuthzError, type AuthzAuthContext } from '../../utils/authz.js';
import { ingestHeartbeat } from './live-status.service.js';
import { notifyLiveStatus } from './live-status.bus.js';

export function requireEventPassword(auth: AuthzAuthContext | undefined, eventId: string) {
  if (!auth?.isAuthenticated || auth.type !== 'eventBasic')
    throw new AuthzError('Event password required', 401);
  if (auth.eventId !== eventId)
    throw new AuthzError('Event password does not match this event', 403);
}
export async function registerExternalDevice(
  db: AppPrismaClient,
  auth: AuthzAuthContext | undefined,
  eventId: string,
  input: unknown,
) {
  requireEventPassword(auth, eventId);
  const identity = externalLiveDeviceSchema.parse(input);
  const device = await db.liveDevice
    .upsert({
      where: {
        eventId_sourceType_sourceId: {
          eventId,
          sourceType: identity.sourceType,
          sourceId: identity.sourceId,
        },
      },
      create: {
        eventId,
        sourceId: identity.sourceId,
        sourceType: identity.sourceType,
        name: `${(identity.name ?? identity.sourceType).slice(0, 60)} (${identity.sourceId})`,
        intervalSeconds: ['quickevent', 'ochecklist'].includes(identity.sourceType) ? 10 : 60,
        metrics: {},
      },
      update: {},
    })
    .catch(async (cause: unknown) => {
      // Concurrent first requests can race Prisma's read/create upsert on MariaDB.
      // Recover only the exact identity; never absorb an unrelated name collision.
      if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'P2002') {
        const existing = await db.liveDevice.findUnique({
          where: {
            eventId_sourceType_sourceId: {
              eventId,
              sourceType: identity.sourceType,
              sourceId: identity.sourceId,
            },
          },
        });
        if (existing) return existing;
      }
      throw cause;
    });
  if (device.revokedAt) throw new AuthzError('Device revoked', 403);
  await notifyLiveStatus(eventId);
  return device;
}

/** Legacy exporters without an instance UUID are grouped per app and event. */
export function legacySourceId(eventId: string, sourceType: string) {
  const hex = createHash('sha256').update(`legacy:${eventId}:${sourceType}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export function uploadSourceType(
  value?: string | null,
): 'quickevent' | 'ochecklist' | 'meos' | 'uploader' | null {
  if (/^quickevent(?:\b|\s|\/)/i.test(value?.trim() ?? '')) return 'quickevent';
  if (/^ochecklist(?:\b|\s|\/)/i.test(value?.trim() ?? '')) return 'ochecklist';
  if (/^meos(?:\b|\s|\/)/i.test(value?.trim() ?? '')) return 'meos';
  if (value?.trim().toLowerCase() === 'uploader') return 'uploader';
  return null;
}
export async function registerUploadSource(
  db: AppPrismaClient,
  auth: AuthzAuthContext | undefined,
  eventId: string,
  creator: string | null | undefined,
  sourceTypeHeader?: string,
  sourceIdHeader?: string,
  metrics: LiveMetrics = {},
) {
  // Browser/JWT uploads remain manual imports; event-password producers are discovered.
  if (!auth?.isAuthenticated || auth.type !== 'eventBasic' || auth.eventId !== eventId) return;
  const sourceType = uploadSourceType(sourceTypeHeader) ?? uploadSourceType(creator) ?? 'uploader';
  const device = await registerExternalDevice(db, auth, eventId, {
    sourceType,
    sourceId:
      sourceIdHeader ??
      legacySourceId(
        eventId,
        sourceType === 'uploader' ? `uploader:${creator?.trim() ?? 'IOF XML'}` : sourceType,
      ),
    name: sourceType === 'uploader' ? creator?.trim().slice(0, 60) || 'IOF XML' : undefined,
  });
  const monitoring = await db.liveMonitoring.findUnique({ where: { eventId } });
  if (monitoring && monitoring.until > new Date())
    await ingestHeartbeat(db, device.id, {
      version: 1,
      messageId: randomUUID(),
      measuredAt: new Date().toISOString(),
      metrics,
    });
}
