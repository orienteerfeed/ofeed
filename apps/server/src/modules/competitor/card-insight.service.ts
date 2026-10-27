import type { CardInsightCompetitor, EventCardInsight } from '@repo/shared';

import type { AppPrismaClient } from '../../db/prisma-client.js';
import { AuthzError, requireEventOwnerOrAdmin, type AuthzAuthContext } from '../../utils/authz.js';

export async function getEventCardInsight(
  prisma: AppPrismaClient,
  auth: AuthzAuthContext,
  eventId: string,
): Promise<EventCardInsight> {
  if (!auth?.isAuthenticated || auth.type !== 'jwt') {
    throw new AuthzError('User JWT required', 401);
  }
  await requireEventOwnerOrAdmin(prisma, auth, eventId);
  const competitors = await prisma.competitor.findMany({
    where: { class: { eventId } },
    select: {
      id: true,
      firstname: true,
      lastname: true,
      registration: true,
      bibNumber: true,
      classId: true,
      class: { select: { name: true } },
      organisation: { select: { name: true } },
      card: true,
    },
    orderBy: [{ class: { name: 'asc' } }, { lastname: 'asc' }, { firstname: 'asc' }, { id: 'asc' }],
  });
  const missingCards: CardInsightCompetitor[] = [];
  const groups = new Map<number, CardInsightCompetitor[]>();
  for (const { class: category, organisation, ...competitor } of competitors) {
    const row = {
      ...competitor,
      className: category.name,
      organisation: organisation?.name ?? null,
    };
    if (row.card === null || row.card === 0) {
      missingCards.push(row);
    } else if (row.card > 0) {
      const group = groups.get(row.card) ?? [];
      group.push(row);
      groups.set(row.card, group);
    }
  }
  return {
    missingCards,
    duplicateCards: [...groups]
      .filter(([, members]) => members.length > 1)
      .sort(([a], [b]) => a - b)
      .map(([card, members]) => ({ card, competitors: members })),
  };
}
