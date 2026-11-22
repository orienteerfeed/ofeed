import { randomUUID } from 'node:crypto';
import type { AppPrismaClient } from '../../db/prisma-client.js';
import type { LiveMetrics } from '@repo/shared';
import { logger } from '../../lib/logging.js';
import { registerExternalDevice, legacySourceId } from './live-status.external.js';
import { ingestHeartbeat } from './live-status.service.js';

/** Call only after the existing MOP password check succeeded. Never changes XML responses. */
export async function noteMeosUpload(
  db: AppPrismaClient,
  eventId: string,
  bindingId: number,
  state: NonNullable<LiveMetrics['uploadState']>,
  bytes: number,
  startedAt: number,
) {
  try {
    const device = await registerExternalDevice(
      db,
      { isAuthenticated: true, type: 'eventBasic', eventId },
      eventId,
      {
        sourceType: 'meos',
        sourceId: legacySourceId(eventId, `meos:${bindingId}`),
        name: `MeOS MOP ${bindingId}`,
      },
    );
    const monitoring = await db.liveMonitoring.findUnique({ where: { eventId } });
    if (!monitoring || monitoring.until <= new Date()) return;
    const metrics: LiveMetrics = {
      uploadState: state,
      uploadBytes: bytes,
      ...(state === 'processing'
        ? {}
        : {
            uploadCompletedAt: new Date().toISOString(),
            uploadDurationMs: Math.max(0, Date.now() - startedAt),
          }),
      errorCode: state === 'failed' ? 'MOP_IMPORT_FAILED' : '',
      errorMessage: state === 'failed' ? 'MeOS MOP import failed' : '',
    };
    await ingestHeartbeat(db, device.id, {
      version: 1,
      messageId: randomUUID(),
      measuredAt: new Date().toISOString(),
      metrics,
    });
  } catch (error) {
    logger.warn('MeOS MOP: auxiliary telemetry unavailable', {
      eventId,
      bindingId,
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    });
  }
}
