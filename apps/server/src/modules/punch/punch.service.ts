import type { AppPrismaClient } from '../../db/prisma-client.js';
import type { Punch, PunchReceipt, ResultStatus } from '../../generated/prisma/client.js';
import { resolveEffectiveStartMode } from '@repo/shared';
import { AuthzError, requireEventOwnerOrAdmin, type AuthzAuthContext } from '../../utils/authz.js';
import { requiresStartSlot } from '../class/class.capacity.js';
import { detectCompetitorChanges } from '../competitor/competitor-change.helpers.js';
import { createCompetitorProtocolEntries } from '../competitor/competitor-change.service.js';
import {
  deleteMatchingStartSlotVacancy,
  restoreStartSlotVacancy,
} from '../start-slot-vacancy/start-slot-vacancy.service.js';
import { elapsedSeconds, matchPunch } from './punch-matching.js';
import { punchBatchSchema, type PunchBatch, type PunchResult } from './punch.schema.js';
import {
  eventPunchTransaction,
  publishPunchChanges,
  type PunchTx,
  type PunchChanges,
} from './punch-write.js';

type Observation = Punch & { receipts: PunchReceipt[] };

export class PunchConflictError extends Error {}

function preferredReceipt(punch: Observation): PunchReceipt {
  return punch.receipts.find((receipt) => receipt.source === 'READOUT') ?? punch.receipts[0];
}

function earliest(punches: Observation[], code: number, start?: Date | null) {
  const candidates = punches.filter(
    (punch) => punch.controlCode === code && (!start || punch.punchTime >= start),
  );
  candidates.sort(
    (a, b) =>
      Number(preferredReceipt(b).source === 'READOUT') -
        Number(preferredReceipt(a).source === 'READOUT') ||
      a.punchTime.getTime() - b.punchTime.getTime(),
  );
  return candidates[0];
}

async function projectCompetitor(
  tx: PunchTx,
  eventId: string,
  competitorId: number,
  changes: PunchChanges,
): Promise<void> {
  const competitor = await tx.competitor.findUniqueOrThrow({
    where: { id: competitorId },
    include: { class: { include: { event: { select: { defaultStartMode: true } } } } },
  });
  const punches = await tx.punch.findMany({
    where: { competitorId, superseded: false },
    include: { receipts: { orderBy: { id: 'asc' } } },
  });
  if (punches.length === 0) return;
  const startPunch = earliest(punches, 0);
  const startTime = startPunch?.punchTime ?? competitor.startTime;
  const finishPunch = earliest(punches, -1, startTime);
  const finishTime = finishPunch?.punchTime ?? competitor.finishTime;
  const time = finishTime ? elapsedSeconds(finishTime, startTime) : competitor.time;
  let status: ResultStatus = competitor.status;
  if (finishPunch && finishPunch.appliedSource !== preferredReceipt(finishPunch).source) {
    if (preferredReceipt(finishPunch).source === 'READOUT') status = 'OK';
    else if (['Inactive', 'Active', 'Finished'].includes(status)) status = 'Finished';
  }
  const data = { startTime, finishTime, time, status };
  const fieldChanges = detectCompetitorChanges(competitor, data);
  let changed = fieldChanges.length > 0;
  for (const punch of punches) {
    const receipt = preferredReceipt(punch);
    if (punch.controlCode > 0) {
      const splitTime = elapsedSeconds(punch.punchTime, startTime);
      const split = punch.splitId
        ? await tx.split.findUnique({ where: { id: punch.splitId } })
        : null;
      if (!split) {
        // A legacy snapshot can already contain this observation without ledger metadata.
        const represented =
          splitTime === null
            ? null
            : await tx.split.findFirst({
                where: {
                  competitorId,
                  controlCode: punch.controlCode,
                  time: splitTime,
                  punch: null,
                },
                orderBy: { id: 'asc' },
              });
        const created =
          represented ??
          (await tx.split.create({
            data: { competitorId, controlCode: punch.controlCode, time: splitTime },
          }));
        await tx.punch.update({ where: { id: punch.id }, data: { splitId: created.id } });
        changed = true;
      } else if (split.time !== splitTime) {
        await tx.split.update({ where: { id: split.id }, data: { time: splitTime } });
        changed = true;
      }
    }
    if (punch.appliedSource !== receipt.source) {
      await tx.punch.update({ where: { id: punch.id }, data: { appliedSource: receipt.source } });
      if (punch.appliedSource === null) {
        await createCompetitorProtocolEntries(tx, {
          eventId,
          competitorId,
          authorId: receipt.authorId,
          origin: receipt.source === 'SRR' ? 'IT' : 'FINISH',
          changes: [
            {
              type: 'punch_store',
              previousValue: null,
              newValue: JSON.stringify({
                punchId: punch.id,
                card: punch.card,
                controlCode: punch.controlCode,
                punchTime: punch.punchTime.toISOString(),
                source: receipt.source,
              }),
            },
          ],
        });
      }
      changed = true;
    }
  }
  if (!changed) return;
  const effectiveStartMode = resolveEffectiveStartMode(
    competitor.class.startMode,
    competitor.class.event.defaultStartMode,
  );
  if (
    competitor.startTime?.getTime() !== startTime?.getTime() &&
    requiresStartSlot(effectiveStartMode)
  ) {
    await deleteMatchingStartSlotVacancy(tx, { classId: competitor.classId, startTime });
  }
  await tx.competitor.update({
    where: { id: competitorId },
    data: { ...data, updatedAt: new Date() },
  });
  if (
    competitor.startTime?.getTime() !== startTime?.getTime() &&
    competitor.startTime &&
    requiresStartSlot(effectiveStartMode)
  ) {
    await restoreStartSlotVacancy(tx, {
      classId: competitor.classId,
      startTime: competitor.startTime,
      bibNumber: competitor.bibNumber,
    });
  }
  // Attribute each field to the observation responsible for it.
  for (const change of fieldChanges) {
    const observation =
      change.type === 'start_time_change' ? startPunch : (finishPunch ?? startPunch);
    const receipt = preferredReceipt(observation ?? punches[0]);
    await createCompetitorProtocolEntries(tx, {
      eventId,
      competitorId,
      authorId: receipt.authorId,
      origin: receipt.source === 'SRR' ? 'IT' : 'FINISH',
      changes: [change],
    });
  }
  changes.set(competitorId, competitor.classId);
}

/** Called under the event lock, including after assignment/timing/import writes. */
export async function reconcileEventPunches(
  tx: PunchTx,
  eventId: string,
  changes: PunchChanges = new Map(),
  scope?: { cards: Array<number | null | undefined>; competitorIds?: number[] },
): Promise<PunchChanges> {
  const cards = scope
    ? [...new Set(scope.cards.filter((card): card is number => card != null))]
    : undefined;
  const competitorIds = scope?.competitorIds ?? [];
  // A start can make another pending punch match. Continue until no assignment changes.
  for (;;) {
    const pending = await tx.punch.findMany({
      where: {
        eventId,
        competitorId: null,
        superseded: false,
        ...(cards ? { card: { in: cards } } : {}),
      },
      orderBy: [{ punchTime: 'asc' }, { id: 'asc' }],
    });
    let assignments = 0;
    for (const punch of pending) {
      const candidates = await tx.competitor.findMany({
        where: { card: punch.card, class: { eventId } },
        select: { id: true, startTime: true, finishTime: true },
      });
      const competitorId = matchPunch(punch.punchTime, candidates);
      if (competitorId !== null) {
        await tx.punch.update({ where: { id: punch.id }, data: { competitorId } });
        assignments++;
      }
    }
    const active = await tx.punch.findMany({
      where: {
        eventId,
        competitorId: { not: null },
        superseded: false,
        ...(cards
          ? { OR: [{ card: { in: cards } }, { competitorId: { in: competitorIds } }] }
          : {}),
      },
      distinct: ['competitorId'],
      select: { competitorId: true },
    });
    for (const { competitorId } of active) {
      if (competitorId !== null) await projectCompetitor(tx, eventId, competitorId, changes);
    }
    if (assignments === 0 || assignments === pending.length) break;
  }
  return changes;
}

export async function ingestPunches(
  client: AppPrismaClient,
  auth: AuthzAuthContext | undefined,
  eventId: string,
  input: PunchBatch,
): Promise<PunchResult[]> {
  if (!auth?.isAuthenticated || auth.type !== 'jwt') throw new AuthzError('User JWT required', 401);
  const { userId } = await requireEventOwnerOrAdmin(client, auth, eventId);
  const batch = punchBatchSchema.parse(input);
  const { results, changes } = await eventPunchTransaction(client, eventId, async (tx) => {
    const results: Array<{ clientPunchId: string; punchId: number; duplicate: boolean }> = [];
    let newReceipts = false;
    for (const item of batch.punches) {
      const identity = { eventId, deviceId: batch.deviceId, clientPunchId: item.clientPunchId };
      const punchTime = new Date(item.punchTime);
      const receivedAt = new Date(item.receivedAt);
      const existing = await tx.punchReceipt.findUnique({
        where: { eventId_deviceId_clientPunchId: identity },
        include: { punch: true },
      });
      if (existing) {
        if (
          existing.source !== batch.source ||
          existing.stationSerial !== (item.stationSerial ?? null) ||
          existing.receivedAt.getTime() !== receivedAt.getTime() ||
          existing.punch.card !== item.card ||
          existing.punch.controlCode !== item.controlCode ||
          existing.punch.punchTime.getTime() !== punchTime.getTime()
        ) {
          throw new PunchConflictError('clientPunchId was already used for a different payload');
        }
        results.push({
          clientPunchId: item.clientPunchId,
          punchId: existing.punchId,
          duplicate: true,
        });
        continue;
      }
      const physical = { eventId, card: item.card, controlCode: item.controlCode, punchTime };
      let punch = await tx.punch.findUnique({
        where: { eventId_card_controlCode_punchTime: physical },
      });
      const duplicate = punch !== null;
      punch ??= await tx.punch.create({ data: physical });
      await tx.punchReceipt.create({
        data: {
          ...identity,
          source: batch.source,
          punchId: punch.id,
          stationSerial: item.stationSerial,
          receivedAt,
          authorId: userId,
        },
      });
      newReceipts = true;
      results.push({ clientPunchId: item.clientPunchId, punchId: punch.id, duplicate });
    }
    const changes = newReceipts
      ? await reconcileEventPunches(tx, eventId, new Map(), {
          cards: batch.punches.map((punch) => punch.card),
        })
      : new Map<number, number>();
    const assigned = await tx.punch.findMany({
      where: { id: { in: results.map((item) => item.punchId) } },
      select: { id: true, competitorId: true },
    });
    const byId = new Map(assigned.map((punch) => [punch.id, punch.competitorId]));
    return {
      changes,
      results: results.map((item): PunchResult => {
        const competitorId = byId.get(item.punchId);
        return {
          clientPunchId: item.clientPunchId,
          status: item.duplicate ? 'DUPLICATE' : competitorId ? 'STORED' : 'UNKNOWN_CARD',
          ...(competitorId ? { competitorId } : {}),
        };
      }),
    };
  });
  await publishPunchChanges(eventId, changes);
  return results;
}
