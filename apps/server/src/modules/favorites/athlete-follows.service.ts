import { athleteFollowIdSchema, athleteFollowPauseSchema, type AthleteFollow } from '@repo/shared';
import type { AppPrismaClient } from '../../db/prisma-client.js';
import type {
  Prisma,
  AthleteFollow as Row,
  AthleteFollowSource,
} from '../../generated/prisma/client.js';
import type { GraphQLAuthContext } from '../../graphql/context.types.js';
import { AuthzError } from '../../utils/authz.js';
import { ValidationError } from '../../exceptions/index.js';
import { pubsub } from '../../lib/pubsub.js';
import { notificationTopic, requireInboxUser } from '../notifications/notifications.service.js';

export const followSource = (source: 'ORIS' | 'EVENTOR' | null): AthleteFollowSource =>
  source ?? 'LOCAL';
export const followRegistration = (registration: string) => registration.trim().toUpperCase();
export const MAX_ATHLETE_FOLLOWS = 100;

function serialize(row: Row): AthleteFollow {
  return {
    id: row.id,
    registration: row.registration,
    source: row.source,
    displayName: row.displayName,
    pausedAt: row.pausedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
export async function listAthleteFollows(db: AppPrismaClient, auth: GraphQLAuthContext) {
  const userId = await requireInboxUser(db, auth);
  return (
    await db.athleteFollow.findMany({
      where: { userId },
      orderBy: [{ displayName: 'asc' }, { registration: 'asc' }, { id: 'asc' }],
    })
  ).map(serialize);
}

/** Caller holds recipient row lock, shared with event fan-out/account erasure. */
export async function saveAthleteFollow(
  tx: Prisma.TransactionClient,
  userId: number,
  competitor: {
    registration: string;
    firstname: string;
    lastname: string;
    source: 'ORIS' | 'EVENTOR' | null;
  },
) {
  const registration = followRegistration(competitor.registration);
  if (!registration) return;
  const source = followSource(competitor.source);
  const identity = { userId, source, registration };
  const existing = await tx.athleteFollow.findUnique({
    where: { userId_source_registration: identity },
  });
  if (!existing && (await tx.athleteFollow.count({ where: { userId } })) >= MAX_ATHLETE_FOLLOWS)
    throw new ValidationError('Maximum 100 registration follows');
  await tx.athleteFollow.upsert({
    where: { userId_source_registration: identity },
    create: { ...identity, displayName: `${competitor.lastname} ${competitor.firstname}`.trim() },
    update: {
      pausedAt: null,
      displayName: `${competitor.lastname} ${competitor.firstname}`.trim(),
    },
  });
}

export async function cancelRegistrationFollow(
  tx: Prisma.TransactionClient,
  userId: number,
  registration: string,
  source: AthleteFollowSource,
) {
  await tx.$executeRaw`DELETE cf FROM CompetitorFavorite cf
    JOIN Competitor c ON c.id=cf.competitorId JOIN Class cl ON cl.id=c.classId
    JOIN Event e ON e.id=cl.eventId
    WHERE cf.userId=${userId} AND UPPER(TRIM(c.registration))=${registration}
      AND COALESCE(e.externalSource,'LOCAL')=${source}`;
  await tx.athleteFollow.deleteMany({ where: { userId, registration, source } });
}

export async function mutateAthleteFollow(
  db: AppPrismaClient,
  auth: GraphQLAuthContext,
  input: unknown,
  remove = false,
) {
  const userId = await requireInboxUser(db, auth);
  const parsed = remove
    ? athleteFollowIdSchema.safeParse(input)
    : athleteFollowPauseSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError('Invalid athlete follow');
  const { id } = parsed.data;
  await db.$transaction(async (tx) => {
    const users = await tx.$queryRaw<
      Array<{ deletedAt: Date | null }>
    >`SELECT deletedAt FROM User WHERE id=${userId} FOR UPDATE`;
    if (!users.length || users[0].deletedAt) throw new AuthzError('User unavailable', 401);
    const row = await tx.athleteFollow.findFirst({ where: { id, userId } });
    if (!row) {
      if (remove) return;
      throw new AuthzError('Athlete follow unavailable', 404);
    }
    if (remove) await cancelRegistrationFollow(tx, userId, row.registration, row.source);
    else {
      const { paused } = athleteFollowPauseSchema.parse(input);
      if (!!row.pausedAt !== paused)
        await tx.athleteFollow.update({
          where: { id: row.id },
          data: { pausedAt: paused ? new Date() : null },
        });
    }
  });
  await pubsub.publish(notificationTopic(userId), true);
  return true;
}
