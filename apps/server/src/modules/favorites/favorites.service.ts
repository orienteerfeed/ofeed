import {
  eventFavoritesInputSchema,
  eventFavoriteSelectionSchema,
  setCompetitorFavoriteInputSchema,
} from '@repo/shared';
import type { AppPrismaClient } from '../../db/prisma-client.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { GraphQLAuthContext } from '../../graphql/context.types.js';
import { AuthzError } from '../../utils/authz.js';
import { ValidationError } from '../../exceptions/index.js';
import { pubsub } from '../../lib/pubsub.js';
import { requireInboxUser, notificationTopic } from '../notifications/notifications.service.js';
import { eventPunchTransaction } from '../punch/punch-write.js';
import { favoriteAudience } from './favorites.audience.js';
import {
  cancelRegistrationFollow,
  followRegistration,
  followSource,
  saveAthleteFollow,
} from './athlete-follows.service.js';

export const MAX_EVENT_FAVORITES = 100;

async function requireFavoriteEvent(
  db: AppPrismaClient | Prisma.TransactionClient,
  eventId: string,
  userId: number,
) {
  const event = await db.event.findFirst({
    where: { id: eventId, OR: [{ published: true }, { authorId: userId }] },
    select: { id: true },
  });
  if (!event) throw new AuthzError('Event unavailable', 404);
}

export async function favoriteCompetitorIds(
  db: AppPrismaClient,
  auth: GraphQLAuthContext,
  input: unknown,
) {
  const userId = await requireInboxUser(db, auth);
  const parsed = eventFavoritesInputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError('Invalid favorite event');
  await requireFavoriteEvent(db, parsed.data.eventId, userId);
  const rows = await favoriteAudience(db, parsed.data.eventId, { userId, includePaused: true });
  return [...new Set(rows.map((row) => row.competitorId))].sort((a, b) => a - b);
}

export async function setCompetitorFavorite(
  db: AppPrismaClient,
  auth: GraphQLAuthContext,
  input: unknown,
) {
  const userId = await requireInboxUser(db, auth);
  const parsed = setCompetitorFavoriteInputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError('Invalid competitor favorite');
  const { eventId, competitorId, favorite } = parsed.data;
  await eventPunchTransaction(db, eventId, async (tx) => {
    await requireFavoriteEvent(tx, eventId, userId);
    const recipient = await tx.$queryRaw<
      Array<{ deletedAt: Date | null }>
    >`SELECT deletedAt FROM User WHERE id = ${userId} FOR UPDATE`;
    if (!recipient.length || recipient[0].deletedAt) throw new AuthzError('User unavailable', 401);
    const competitor = await tx.competitor.findFirst({
      where: { id: competitorId, class: { eventId } },
      select: {
        id: true,
        registration: true,
        firstname: true,
        lastname: true,
        class: { select: { event: { select: { externalSource: true } } } },
      },
    });
    if (!competitor) throw new AuthzError('Competitor unavailable', 404);
    const registration = followRegistration(competitor.registration);
    if (!favorite) {
      if (registration)
        await cancelRegistrationFollow(
          tx,
          userId,
          registration,
          followSource(competitor.class.event.externalSource),
        );
      else await tx.competitorFavorite.deleteMany({ where: { userId, competitorId } });
      return;
    }
    if (registration) {
      await saveAthleteFollow(tx, userId, {
        ...competitor,
        source: competitor.class.event.externalSource,
      });
      // The registration follow is canonical. Do not retain an event row that
      // could start tracking a different identity if its registration changes.
      await tx.competitorFavorite.deleteMany({ where: { userId, competitorId } });
      return;
    }
    const existing = await tx.competitorFavorite.findUnique({
      where: { userId_competitorId: { userId, competitorId } },
    });
    if (existing) return;
    const count = await tx.competitorFavorite.count({
      where: { userId, competitor: { class: { eventId } } },
    });
    if (count >= MAX_EVENT_FAVORITES) throw new ValidationError('Maximum 100 favorites per event');
    await tx.competitorFavorite.create({ data: { userId, competitorId } });
  });
  await pubsub.publish(notificationTopic(userId), true);
  return favorite;
}

export async function selectedEventCompetitors(
  db: AppPrismaClient,
  auth: GraphQLAuthContext,
  input: unknown,
  query: Omit<Prisma.CompetitorFindManyArgs, 'where'> = {},
) {
  const parsed = eventFavoriteSelectionSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError('Invalid favorite selection');
  const { eventId, competitorIds } = parsed.data;
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { published: true, authorId: true },
  });
  if (!event) throw new AuthzError('Event unavailable', 404);
  if (!event.published) {
    const userId = await requireInboxUser(db, auth);
    if (event.authorId !== userId) throw new AuthzError('Event unavailable', 404);
  }
  return db.competitor.findMany({
    ...query,
    where: { id: { in: competitorIds }, class: { eventId } },
    orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }, { id: 'asc' }],
  });
}
