import {
  systemRadioDeviceSchema,
  systemRadioCollectionSchema,
  yarocSettingsSchema,
  yarocWindowProblem,
  yarocTimezoneOffset,
} from '@repo/shared';
import type { AppPrismaClient } from '../../db/prisma-client.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { brokerProfiles } from '../yaroc/yaroc.config.js';
import { loadYaroc } from '../yaroc/yaroc.native.js';
import { lockRadioInventory, sessionActive, sessionWhere } from '../yaroc/yaroc.session.js';
import { notifyLiveStatus } from '../live-status/live-status.bus.js';
import { ensureMonitoring } from '../live-status/live-status.monitoring.js';

export const inventoryInclude = {
  currentAssignment: {
    include: {
      event: {
        select: {
          id: true,
          name: true,
          date: true,
          yarocSession: {
            where: { scope: 'system' },
            select: { state: true, until: true, error: true },
          },
        },
      },
      liveDevice: { select: { lastSeenAt: true } },
    },
  },
} as const;
export async function systemRadioInventory(db: AppPrismaClient, search = '') {
  return db.systemRadioDevice.findMany({
    where: search
      ? { OR: [{ name: { contains: search } }, { macAddress: { contains: search.toLowerCase() } }] }
      : {},
    include: inventoryInclude,
    orderBy: { name: 'asc' },
  });
}
async function lockEvent(tx: Prisma.TransactionClient, eventId: string) {
  await tx.$queryRaw`SELECT id FROM Event WHERE id = ${eventId} FOR UPDATE`;
}
async function requireStopped(tx: Prisma.TransactionClient, eventId: string) {
  if (sessionActive(await tx.yarocSession.findUnique({ where: sessionWhere(eventId, 'system') })))
    throw new Error('Stop system reception for this event first');
}
async function checkIdentity(
  tx: Prisma.TransactionClient,
  macAddress: string,
  name: string,
  id?: string,
) {
  if (
    await tx.systemRadioDevice.findFirst({
      where: { OR: [{ macAddress }, { name }], ...(id ? { id: { not: id } } : {}) },
    })
  )
    throw new Error('This device name or ID is already in the system inventory');
  const conflict = await tx.liveDevice.findFirst({
    where: { macAddress, systemDeviceId: null, revokedAt: null },
    select: { name: true, eventId: true },
  });
  if (conflict)
    throw new Error(`Device already registered manually: ${conflict.name} (${conflict.eventId})`);
}
export async function saveSystemRadio(
  db: AppPrismaClient,
  actorId: number,
  input: unknown,
  id?: string,
) {
  const parsed = systemRadioDeviceSchema.parse(input);
  if (!Object.hasOwn(brokerProfiles(), parsed.brokerProfile))
    throw new Error('Unknown MQTT broker profile');
  const data = {
    ...parsed,
    macAddress: parsed.macAddress!,
    meshtasticChannel: parsed.meshtasticChannel ?? null,
    updatedById: actorId,
  };
  const unit = await db.$transaction(async (tx) => {
    await lockRadioInventory(tx);
    const existing = id
      ? await tx.systemRadioDevice.findUniqueOrThrow({
          where: { id },
          include: { currentAssignment: true },
        })
      : null;
    if (existing?.currentAssignment) {
      await lockEvent(tx, existing.currentAssignment.eventId);
      await requireStopped(tx, existing.currentAssignment.eventId);
    }
    await checkIdentity(tx, data.macAddress, data.name, id);
    const saved = id
      ? await tx.systemRadioDevice.update({ where: { id }, data })
      : await tx.systemRadioDevice.create({ data: { ...data, createdById: actorId } });
    if (existing?.currentAssignment) {
      await tx.liveDevice.update({
        where: { id: existing.currentAssignment.liveDeviceId },
        data: {
          name: data.name,
          sourceType: data.sourceType,
          macAddress: data.macAddress,
          intervalSeconds: data.intervalSeconds,
        },
      });
    }
    return saved;
  });
  const assignment = await db.systemRadioDevice.findUniqueOrThrow({
    where: { id: unit.id },
    include: inventoryInclude,
  });
  if (assignment.currentAssignment) await notifyLiveStatus(assignment.currentAssignment.eventId);
  return assignment;
}
export async function archiveSystemRadio(
  db: AppPrismaClient,
  id: string,
  archived: boolean,
  actorId: number,
) {
  return db.$transaction(async (tx) => {
    await lockRadioInventory(tx);
    const unit = await tx.systemRadioDevice.findUniqueOrThrow({ where: { id } });
    if (unit.currentAssignmentId) throw new Error('Unassign this device before archiving');
    return tx.systemRadioDevice.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null, updatedById: actorId },
      include: inventoryInclude,
    });
  });
}
export async function assignSystemRadio(
  db: AppPrismaClient,
  id: string,
  eventId: string | null,
  actorId: number,
) {
  const events = await db.$transaction(async (tx) => {
    await lockRadioInventory(tx);
    const unit = await tx.systemRadioDevice.findUniqueOrThrow({
      where: { id },
      include: { currentAssignment: true },
    });
    const old = unit.currentAssignment;
    if (old?.eventId === eventId || (!old && !eventId)) return [];
    if (unit.archivedAt) throw new Error('Restore the device before assigning it');
    const affected = [
      ...new Set([old?.eventId, eventId].filter((value): value is string => !!value)),
    ].sort();
    for (const key of affected) {
      await lockEvent(tx, key);
      await requireStopped(tx, key);
    }
    if (eventId) await tx.event.findUniqueOrThrow({ where: { id: eventId }, select: { id: true } });
    if (old) {
      await tx.systemRadioDevice.update({
        where: { id },
        data: { currentAssignmentId: null, updatedById: actorId },
      });
      await tx.systemRadioAssignment.update({
        where: { id: old.id },
        data: { endedAt: new Date(), endedById: actorId },
      });
      await tx.liveDevice.update({
        where: { id: old.liveDeviceId },
        data: { revokedAt: new Date(), tokenHash: null },
      });
      await tx.liveDeviceOutage.updateMany({
        where: { deviceId: old.liveDeviceId, endedAt: null },
        data: { endedAt: new Date() },
      });
    }
    if (eventId) {
      const collision = await tx.liveDevice.findFirst({
        where: {
          eventId,
          systemDeviceId: { not: id },
          OR: [{ name: unit.name }, { macAddress: unit.macAddress }],
        },
      });
      // Nullable systemDeviceId needs an explicit manual branch in SQL.
      const manual = await tx.liveDevice.findFirst({
        where: {
          eventId,
          systemDeviceId: null,
          OR: [{ name: unit.name }, { macAddress: unit.macAddress }],
        },
      });
      if (collision || manual) throw new Error('An event device already uses this name or ID');
      const device = await tx.liveDevice.upsert({
        where: { eventId_systemDeviceId: { eventId, systemDeviceId: id } },
        create: {
          eventId,
          systemDeviceId: id,
          name: unit.name,
          sourceType: unit.sourceType,
          macAddress: unit.macAddress,
          intervalSeconds: unit.intervalSeconds,
          metrics: {},
        },
        update: {
          name: unit.name,
          sourceType: unit.sourceType,
          macAddress: unit.macAddress,
          intervalSeconds: unit.intervalSeconds,
          revokedAt: null,
          tokenHash: null,
          lastSeenAt: null,
          measuredAt: null,
          metrics: {},
          version: { increment: 1 },
        },
      });
      const assignment = await tx.systemRadioAssignment.create({
        data: { systemDeviceId: id, eventId, liveDeviceId: device.id, assignedById: actorId },
      });
      await tx.systemRadioDevice.update({
        where: { id },
        data: { currentAssignmentId: assignment.id, updatedById: actorId },
      });
    }
    return affected;
  });
  for (const event of events) await notifyLiveStatus(event);
  return db.systemRadioDevice.findUniqueOrThrow({ where: { id }, include: inventoryInclude });
}
export async function systemCollection(db: AppPrismaClient, eventId: string) {
  const event = await db.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { yarocSettings: true, timezone: true },
  });
  const session = await db.yarocSession.findUnique({ where: sessionWhere(eventId, 'system') });
  const fallback = yarocSettingsSchema.parse(
    event.yarocSettings ?? { checkCode: 3, startCode: 1, finishCode: 2 },
  );
  return {
    eventId,
    timezone: event.timezone,
    settings: systemRadioCollectionSchema.parse(session?.settings ?? fallback),
    state: sessionActive(session)
      ? session!.state
      : session?.state === 'error'
        ? 'error'
        : 'stopped',
    until: session?.until.toISOString() ?? null,
    error: session?.error ?? null,
  };
}
export async function configureSystemCollection(
  db: AppPrismaClient,
  eventId: string,
  actorId: number,
  input: unknown,
  start: boolean,
) {
  const settings = systemRadioCollectionSchema.parse(input);
  if (start) await loadYaroc();
  await db.$transaction(async (tx) => {
    await lockRadioInventory(tx);
    await lockEvent(tx, eventId);
    await requireStopped(tx, eventId);
    const event = await tx.event.findUniqueOrThrow({
      where: { id: eventId },
      select: { timezone: true },
    });
    const now = new Date();
    const units = await tx.systemRadioDevice.findMany({
      where: { archivedAt: null, currentAssignment: { eventId, endedAt: null } },
    });
    if (start) {
      if (!units.length) throw new Error('Assign at least one system device to this event');
      if (yarocWindowProblem(event.timezone, now, settings.hours))
        throw new Error('Invalid timezone or reception spans a daylight-saving transition');
      for (const unit of units)
        if (!Object.hasOwn(brokerProfiles(), unit.brokerProfile))
          throw new Error('Unknown MQTT broker profile');
    }
    const until = start ? new Date(+now + settings.hours * 3600_000) : now;
    const data = {
      authorId: actorId,
      settings: { ...settings, timezoneOffset: yarocTimezoneOffset(event.timezone, now) },
      until,
      startedAt: now,
      state: start ? 'starting' : 'stopped',
      owner: null,
      leaseUntil: null,
      error: null,
    };
    await tx.yarocSession.upsert({
      where: sessionWhere(eventId, 'system'),
      create: { eventId, scope: 'system', ...data },
      update: { ...data, generation: { increment: 1 } },
    });
    if (start) await ensureMonitoring(tx, eventId, now, until);
  });
  await notifyLiveStatus(eventId);
  return systemCollection(db, eventId);
}
export async function stopSystemCollection(db: AppPrismaClient, eventId: string) {
  await db.$transaction(async (tx) => {
    await lockEvent(tx, eventId);
    await tx.yarocSession.updateMany({
      where: { eventId, scope: 'system' },
      data: {
        state: 'stopped',
        until: new Date(),
        owner: null,
        leaseUntil: null,
        generation: { increment: 1 },
      },
    });
    await tx.liveDeviceOutage.updateMany({
      where: { endedAt: null, device: { eventId, systemDeviceId: { not: null } } },
      data: { endedAt: new Date() },
    });
  });
  await notifyLiveStatus(eventId);
  return systemCollection(db, eventId);
}

export async function expireSystemCollections(db: AppPrismaClient, now: Date) {
  const expired = await db.yarocSession.findMany({
    where: { scope: 'system', until: { lte: now }, state: { in: ['starting', 'running'] } },
  });
  for (const session of expired) {
    await db.$transaction(async (tx) => {
      await lockEvent(tx, session.eventId);
      const current = await tx.yarocSession.findUnique({
        where: sessionWhere(session.eventId, 'system'),
      });
      if (
        !current ||
        current.generation !== session.generation ||
        current.until > now ||
        !['starting', 'running'].includes(current.state)
      )
        return;
      await tx.yarocSession.update({
        where: sessionWhere(session.eventId, 'system'),
        data: { state: 'stopped', owner: null, leaseUntil: null, generation: { increment: 1 } },
      });
      await tx.liveDeviceOutage.updateMany({
        where: {
          endedAt: null,
          device: { eventId: session.eventId, systemDeviceId: { not: null } },
        },
        data: { endedAt: current.until },
      });
    });
    await notifyLiveStatus(session.eventId);
  }
}
