import { loadYaroc } from './yaroc.native.js';
export { loadYaroc, type NativeClient } from './yaroc.native.js';
export { yarocTimezoneOffset as timezoneOffset } from '@repo/shared';
import { restartMonitoring } from '../live-status/live-status.monitoring.js';
import { brokerProfiles } from './yaroc.config.js';
import { randomUUID } from 'node:crypto';
import {
  yarocSettingsSchema,
  registerLiveDeviceSchema,
  yarocWindowProblem,
  yarocTimezoneOffset as timezoneOffset,
} from '@repo/shared';
import type { AppPrismaClient } from '../../db/prisma-client.js';
import { notifyLiveStatus } from '../live-status/live-status.bus.js';

export const workerId = randomUUID();
export async function saveYarocSettings(db: AppPrismaClient, eventId: string, input: unknown) {
  const settings = yarocSettingsSchema.parse(input);
  if (!Object.hasOwn(brokerProfiles(), settings.brokerProfile))
    throw new Error('Unknown MQTT broker profile');
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM Event WHERE id = ${eventId} FOR UPDATE`;
    const active = await tx.yarocSession.findUnique({ where: { eventId } });
    if (active && active.until > new Date() && ['starting', 'running'].includes(active.state))
      throw new Error('Stop reception before changing its configuration');
    await tx.event.update({ where: { id: eventId }, data: { yarocSettings: settings } });
  });
  await notifyLiveStatus(eventId);
}
export async function startYarocSession(
  db: AppPrismaClient,
  eventId: string,
  authorId: number,
  input: unknown,
) {
  const settings = yarocSettingsSchema.parse(input);
  if (!Object.hasOwn(brokerProfiles(), settings.brokerProfile))
    throw new Error('Unknown MQTT broker profile');
  await loadYaroc();
  const now = new Date(),
    until = new Date(+now + settings.hours * 3600_000);
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM Event WHERE id = ${eventId} FOR UPDATE`;
    // Recheck the event and fleet under the same lock as concurrent start requests.
    const event = await tx.event.findUniqueOrThrow({ where: { id: eventId } });
    const problem = yarocWindowProblem(event.timezone, now, settings.hours);
    if (problem)
      throw new Error(
        problem === 'INVALID_TIMEZONE'
          ? 'Invalid event timezone'
          : 'Split reception into sessions at the daylight-saving transition',
      );
    const devices = await tx.liveDevice.findMany({
      where: { eventId, revokedAt: null, sourceType: { in: ['yaroc', 'meshtastic'] } },
    });
    if (!devices.length) throw new Error('Register at least one YAROC or Meshtastic device');
    for (const device of devices) registerLiveDeviceSchema.parse(device);
    const sessionSettings = { ...settings, timezoneOffset: timezoneOffset(event.timezone, now) };

    const active = await tx.yarocSession.findUnique({ where: { eventId } });
    if (active && active.until > now && active.state !== 'stopped' && active.state !== 'error')
      throw new Error('Reception is already active');
    await tx.yarocSession.upsert({
      where: { eventId },
      create: { eventId, authorId, until, settings: sessionSettings, state: 'starting' },
      update: {
        authorId,
        until,
        settings: sessionSettings,
        state: 'starting',
        error: null,
        owner: null,
        leaseUntil: null,
        generation: { increment: 1 },
      },
    });
    await restartMonitoring(tx, eventId, now, until);
  });
  await notifyLiveStatus(eventId);
}
export async function stopYarocSession(db: AppPrismaClient, eventId: string) {
  await db.yarocSession.updateMany({
    where: { eventId },
    data: {
      state: 'stopped',
      until: new Date(),
      generation: { increment: 1 },
      owner: null,
      leaseUntil: null,
    },
  });
  await notifyLiveStatus(eventId);
}
