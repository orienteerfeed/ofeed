import type { Prisma } from '../../generated/prisma/client.js';

export type RadioScope = 'event' | 'system';
export const sessionWhere = (eventId: string, scope: RadioScope = 'event') => ({
  eventId_scope: { eventId, scope },
});
export const sessionActive = (
  session: { state: string; until: Date } | null | undefined,
  now = new Date(),
) => !!session && ['starting', 'running'].includes(session.state) && session.until > now;

export async function lockRadioInventory(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT id FROM PlatformRadioLock WHERE id = 1 FOR UPDATE`;
}

export async function assertRadioFence(
  tx: Prisma.TransactionClient,
  eventId: string,
  deviceId: string,
  fence: { owner: string; generation: number; scope?: RadioScope },
  now = new Date(),
) {
  const scope = fence.scope ?? 'event';
  await tx.$queryRaw`SELECT id FROM Event WHERE id = ${eventId} FOR UPDATE`;
  await tx.$queryRaw`SELECT eventId FROM YarocSession WHERE eventId = ${eventId} AND scope = ${scope} FOR UPDATE`;
  const session = await tx.yarocSession.findUniqueOrThrow({ where: sessionWhere(eventId, scope) });
  if (
    !sessionActive(session, now) ||
    session.owner !== fence.owner ||
    session.generation !== fence.generation ||
    !session.leaseUntil ||
    session.leaseUntil <= now
  )
    throw new Error('YAROC lease lost');
  const device = await tx.liveDevice.findUniqueOrThrow({ where: { id: deviceId } });
  if (
    device.eventId !== eventId ||
    device.revokedAt ||
    !!device.systemDeviceId !== (scope === 'system')
  )
    throw new Error('YAROC device revoked');
  if (device.systemDeviceId) {
    const unit = await tx.systemRadioDevice.findUniqueOrThrow({
      where: { id: device.systemDeviceId },
      include: { currentAssignment: true },
    });
    if (
      unit.archivedAt ||
      unit.currentAssignment?.eventId !== eventId ||
      unit.currentAssignment.liveDeviceId !== deviceId ||
      unit.currentAssignment.endedAt
    )
      throw new Error('System radio assignment changed');
  }
  return session;
}
