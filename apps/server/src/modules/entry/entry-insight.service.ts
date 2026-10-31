import type { EventEntryTimeline } from '@repo/shared';

import type { AppPrismaClient } from '../../db/prisma-client.js';
import { AuthzError, requireEventOwnerOrAdmin, type AuthzAuthContext } from '../../utils/authz.js';
import { formatLocalDate } from '../../utils/time.js';

/**
 * Competitors entered per day and class, in the event timezone. Counts NEW_ENTRY
 * items of orders that are not cancelled or rejected; change requests are not
 * entries. Returns counts only, no personal data.
 */
export async function getEventEntryTimeline(
  prisma: AppPrismaClient,
  auth: AuthzAuthContext,
  eventId: string,
): Promise<EventEntryTimeline> {
  if (!auth?.isAuthenticated || auth.type !== 'jwt') {
    throw new AuthzError('User JWT required', 401);
  }
  await requireEventOwnerOrAdmin(prisma, auth, eventId);
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { timezone: true, date: true, entriesOpenAt: true, entriesCloseAt: true },
  });
  const items = await prisma.entryItem.findMany({
    where: {
      actionKey: 'NEW_ENTRY',
      entry: { eventId, status: { notIn: ['CANCELLED', 'REJECTED'] } },
    },
    select: { createdAt: true, classId: true, class: { select: { name: true } } },
  });

  const timezone = formatLocalDate(event.date, event.timezone) ? event.timezone : 'UTC';
  const localDate = (instant: Date) => formatLocalDate(instant, timezone) as string;
  const days = new Map<string, EventEntryTimeline['days'][number]>();
  for (const item of items) {
    const date = localDate(item.createdAt);
    const key = `${date}|${item.classId}`;
    const day = days.get(key) ?? {
      date,
      classId: item.classId,
      className: item.class.name,
      entries: 0,
      lateEntries: 0,
    };
    day.entries++;
    if (event.entriesCloseAt && item.createdAt > event.entriesCloseAt) day.lateEntries++;
    days.set(key, day);
  }

  return {
    timezone,
    entriesOpenOn: event.entriesOpenAt ? localDate(event.entriesOpenAt) : null,
    entriesCloseOn: event.entriesCloseAt ? localDate(event.entriesCloseAt) : null,
    eventOn: localDate(event.date),
    days: [...days.values()].sort(
      (a, b) => a.date.localeCompare(b.date) || a.className.localeCompare(b.className),
    ),
  };
}
