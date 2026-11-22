import { randomUUID } from 'node:crypto';
import type { Prisma, ResultStatus } from '../../generated/prisma/client.js';
import { favoriteAudience } from './favorites.audience.js';

const watchedSelect = {
  id: true,
  firstname: true,
  lastname: true,
  status: true,
  startTime: true,
  finishTime: true,
  time: true,
  splits: { select: { controlCode: true, time: true }, orderBy: { id: 'asc' as const } },
  punches: {
    where: { superseded: false, appliedSource: { not: null } },
    select: { controlCode: true, appliedSource: true },
  },
  class: {
    select: {
      eventId: true,
      resultListMode: true,
      event: { select: { name: true, published: true } },
      course: {
        select: {
          courseControls: {
            where: { control: { radio: true } },
            select: { control: { select: { code: true } } },
          },
        },
      },
    },
  },
} satisfies Prisma.CompetitorSelect;

export type WatchedCompetitor = Prisma.CompetitorGetPayload<{ select: typeof watchedSelect }> & {
  favorites: Array<{ userId: number; athleteFollowId?: string | null }>;
};
export type CompetitorMilestone = {
  kind:
    | 'COMPETITOR_STARTED'
    | 'COMPETITOR_RADIO'
    | 'COMPETITOR_FINISHED'
    | 'COMPETITOR_READOUT'
    | 'COMPETITOR_RESULT_CHANGED';
  controlCode?: number;
  splitTime?: number | null;
};

const closed = (status: ResultStatus) =>
  !['Inactive', 'Active', 'DidNotStart', 'DidNotEnter', 'Cancelled'].includes(status);
const hasFinished = (row: WatchedCompetitor) =>
  row.status === 'Finished' ||
  (closed(row.status) && (row.finishTime !== null || row.time !== null));
const hasStarted = (row: WatchedCompetitor) =>
  row.punches.some((p) => p.controlCode === 0) || row.status === 'Active' || hasFinished(row);
const hasReadout = (row: WatchedCompetitor) =>
  row.punches.some((p) => p.controlCode === -1 && p.appliedSource === 'READOUT');
const dateValue = (value: Date | null) => value?.getTime() ?? null;

function publicRadioSplits(row: WatchedCompetitor) {
  if (row.class.resultListMode === 'UnorderedNoTimes') return new Map<number, number[]>();
  const codes = new Set(
    row.class.course?.courseControls
      .map((point) => Number(point.control?.code))
      .filter(Number.isInteger) ?? [],
  );
  const groups = new Map<number, number[]>();
  for (const split of row.splits) {
    if (split.time === null || !codes.has(split.controlCode)) continue;
    const times = groups.get(split.controlCode) ?? [];
    times.push(split.time);
    groups.set(split.controlCode, times);
  }
  for (const times of groups.values()) times.sort((a, b) => a - b);
  return groups;
}

/** Compare committed-result candidates; never infer chip readout from OK alone. */
export function detectFavoriteMilestones(
  before: WatchedCompetitor,
  after: WatchedCompetitor,
): CompetitorMilestone[] {
  const changes: CompetitorMilestone[] = [];
  if (!hasStarted(before) && hasStarted(after)) changes.push({ kind: 'COMPETITOR_STARTED' });
  const oldRadios = publicRadioSplits(before);
  const newRadios = publicRadioSplits(after);
  for (const code of new Set([...oldRadios.keys(), ...newRadios.keys()])) {
    const oldTimes = oldRadios.get(code) ?? [];
    const newTimes = newRadios.get(code) ?? [];
    if (JSON.stringify(oldTimes) === JSON.stringify(newTimes)) continue;
    const index = newTimes.findIndex((time, i) => time !== oldTimes[i]);
    changes.push({
      kind: 'COMPETITOR_RADIO',
      controlCode: code,
      splitTime: index >= 0 ? newTimes[index] : null,
    });
  }
  if (!hasFinished(before) && hasFinished(after)) changes.push({ kind: 'COMPETITOR_FINISHED' });
  if (!hasReadout(before) && hasReadout(after)) changes.push({ kind: 'COMPETITOR_READOUT' });
  const resultChanged =
    before.status !== after.status ||
    dateValue(before.startTime) !== dateValue(after.startTime) ||
    (after.class.resultListMode !== 'UnorderedNoTimes' &&
      (before.time !== after.time || dateValue(before.finishTime) !== dateValue(after.finishTime)));
  if (resultChanged && !changes.some((change) => change.kind !== 'COMPETITOR_RADIO'))
    changes.push({ kind: 'COMPETITOR_RESULT_CHANGED' });
  return changes;
}

export async function captureFavoriteCompetitors(
  tx: Prisma.TransactionClient,
  eventId: string,
): Promise<WatchedCompetitor[]> {
  const audience = await favoriteAudience(tx, eventId);
  if (!audience.length) return [];
  const rows = await tx.competitor.findMany({
    where: {
      class: { eventId },
      id: { in: [...new Set(audience.map((row) => row.competitorId))] },
    },
    select: watchedSelect,
  });
  return rows.map((row) => ({
    ...row,
    favorites: audience
      .filter((member) => member.competitorId === row.id)
      .map((member) => ({ userId: member.userId, athleteFollowId: member.athleteFollowId })),
  }));
}

/** Runs before commit under the event lock; account row locks serialize erasure. */
export async function enqueueFavoriteChanges(
  tx: Prisma.TransactionClient,
  eventId: string,
  before: WatchedCompetitor[],
) {
  if (!before.length) return;
  const after = await captureFavoriteCompetitors(tx, eventId);
  const previous = new Map(before.map((row) => [row.id, row]));
  const deliveries: Prisma.UserNotificationCreateManyInput[] = [];
  for (const row of after) {
    const old = previous.get(row.id);
    if (!old || !row.class.event.published) continue;
    const originalFollowers = new Set(old.favorites.map((favorite) => favorite.userId));
    const recipients = row.favorites.filter((favorite) => originalFollowers.has(favorite.userId));
    if (!recipients.length) continue;
    for (const change of detectFavoriteMilestones(old, row)) {
      const sourceKey = `favorite:${randomUUID()}`;
      for (const { userId, athleteFollowId } of recipients)
        deliveries.push({
          userId,
          athleteFollowId: athleteFollowId ?? null,
          eventId,
          competitorId: row.id,
          kind: change.kind,
          sourceKey,
          eventName: row.class.event.name,
          competitorName: `${row.lastname} ${row.firstname}`.trim(),
          status: row.status,
          raceTime: row.class.resultListMode === 'UnorderedNoTimes' ? null : row.time,
          controlCode: change.controlCode ?? null,
          splitTime: change.splitTime ?? null,
        });
    }
  }
  for (const userId of [...new Set(deliveries.map((row) => row.userId))].sort((a, b) => a - b)) {
    const users = await tx.$queryRaw<
      Array<{ id: number }>
    >`SELECT id FROM User WHERE id = ${userId} AND deletedAt IS NULL FOR UPDATE`;
    if (!users.length) continue;
    const current = await favoriteAudience(tx, eventId, { userId });
    const activeCompetitors = new Set(current.map((row) => row.competitorId));
    const data = deliveries.filter(
      (row) =>
        row.userId === userId &&
        row.competitorId != null &&
        activeCompetitors.has(row.competitorId),
    );
    if (!data.length) continue;
    await tx.userNotification.createMany({
      data,
      skipDuplicates: true,
    });
  }
}
