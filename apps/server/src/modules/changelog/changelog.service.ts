import type { AppPrismaClient } from '../../db/prisma-client.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { GraphQLAuthContext } from '../../graphql/context.types.js';
import { requireEventOwnerOrAdmin } from '../../utils/authz.js';
import type { ChangelogByEventInput } from './changelog.schema.js';

export async function findChangelogByEvent(
  prisma: AppPrismaClient,
  auth: GraphQLAuthContext,
  input: ChangelogByEventInput,
) {
  const { eventId, origin, classId, since } = input;

  await requireEventOwnerOrAdmin(prisma, auth, eventId);

  const filters: Prisma.ProtocolWhereInput = { eventId };

  if (since) {
    filters.createdAt = { gte: new Date(since) };
  }

  if (origin) {
    filters.origin = origin as Prisma.ProtocolWhereInput['origin'];
  }

  if (classId) {
    filters.competitor = { classId: Number(classId) };
  }

  return prisma.protocol.findMany({
    where: filters,
    orderBy: [{ createdAt: 'asc' }],
    include: {
      competitor: true,
      event: true,
      author: { select: { firstname: true, lastname: true } },
    },
  });
}
