import { Prisma } from '../../generated/prisma/client.js';

export type FavoriteAudienceRow = {
  competitorId: number;
  userId: number;
  athleteFollowId: string | null;
};

/** Indexed issuer/registration joins; no materialized per-event follow copies. */
export async function favoriteAudience(
  tx: Prisma.TransactionClient,
  eventId: string,
  options: { userId?: number; includePaused?: boolean } = {},
): Promise<FavoriteAudienceRow[]> {
  const explicitUser =
    options.userId === undefined ? Prisma.empty : Prisma.sql`AND cf.userId = ${options.userId}`;
  const registrationUser =
    options.userId === undefined ? Prisma.empty : Prisma.sql`AND af.userId = ${options.userId}`;
  const explicitPause = options.includePaused
    ? Prisma.empty
    : Prisma.sql`AND (af.id IS NULL OR af.pausedAt IS NULL)`;
  const registrationPause = options.includePaused
    ? Prisma.empty
    : Prisma.sql`AND af.pausedAt IS NULL`;
  const rows = await tx.$queryRaw<
    Array<
      Omit<FavoriteAudienceRow, 'competitorId' | 'userId'> & {
        competitorId: number | bigint;
        userId: number | bigint;
      }
    >
  >(Prisma.sql`
    SELECT cf.competitorId, cf.userId, af.id AS athleteFollowId
    FROM CompetitorFavorite cf
    JOIN Competitor c ON c.id=cf.competitorId
    JOIN Class cl ON cl.id=c.classId
    JOIN Event e ON e.id=cl.eventId
    JOIN User u ON u.id=cf.userId
    LEFT JOIN AthleteFollow af ON af.userId=cf.userId
      AND af.registration=UPPER(TRIM(c.registration)) AND af.source=COALESCE(e.externalSource,'LOCAL')
    WHERE cl.eventId=${eventId} AND u.deletedAt IS NULL ${explicitUser} ${explicitPause}
    UNION
    SELECT c.id AS competitorId, af.userId, af.id AS athleteFollowId
    FROM AthleteFollow af
    JOIN User u ON u.id=af.userId
    JOIN Event e ON COALESCE(e.externalSource,'LOCAL')=af.source
    JOIN Class cl ON cl.eventId=e.id
    JOIN Competitor c ON c.classId=cl.id AND af.registration=UPPER(TRIM(c.registration))
    WHERE e.id=${eventId} AND u.deletedAt IS NULL ${registrationUser} ${registrationPause}
  `);
  // UNION promotes unsigned INT columns to BIGINT in MariaDB. Both source
  // columns are unsigned 32-bit IDs, so Number preserves them exactly.
  return rows.map((row) => ({
    ...row,
    competitorId: Number(row.competitorId),
    userId: Number(row.userId),
  }));
}
