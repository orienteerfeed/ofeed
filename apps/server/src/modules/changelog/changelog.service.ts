import type { AppPrismaClient } from '../../db/prisma-client.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { GraphQLAuthContext } from '../../graphql/context.types.js';
import { requireEventOwnerOrAdmin } from '../../utils/authz.js';
import type { ChangelogByEventInput, MarkChangelogProcessedInput } from './changelog.schema.js';

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
      processedByUser: { select: { id: true, firstname: true, lastname: true } },
    },
  });
}

export async function markChangelogProcessed(
  prisma: AppPrismaClient,
  auth: GraphQLAuthContext,
  input: MarkChangelogProcessedInput,
) {
  await requireEventOwnerOrAdmin(prisma, auth, input.eventId);

  const protocol = await prisma.protocol.findFirst({
    where: {
      id: input.protocolId,
      eventId: input.eventId,
    },
    select: {
      id: true,
      processed: true,
      processedAt: true,
      processedByType: true,
      processedBySource: true,
    },
  });

  if (!protocol) {
    throw new Error('Protocol entry not found');
  }

  if (protocol.processed) {
    return protocol;
  }

  await prisma.protocol.updateMany({
    where: {
      id: input.protocolId,
      eventId: input.eventId,
      processed: false,
    },
    data: {
      processed: true,
      processedAt: new Date(),
      processedByType: input.processedByType,
      processedBySource: input.processedBySource,
      processedByUserId: null,
    },
  });

  return prisma.protocol.findFirstOrThrow({
    where: {
      id: input.protocolId,
      eventId: input.eventId,
    },
    select: {
      id: true,
      processed: true,
      processedAt: true,
      processedByType: true,
      processedBySource: true,
    },
  });
}
