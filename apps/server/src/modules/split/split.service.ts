import type { AppPrismaClient } from '../../db/prisma-client.js';
import { COMPETITORS_BY_CLASS_UPDATED, pubsub as defaultPubsub } from '../../lib/pubsub.js';
import type { GraphQLAuthContext } from '../../graphql/context.types.js';
import {
  assertSplitPublicationAccessible,
  assertSplitPublicationAccessibleForCompetitor,
  getSplitPublicationStatus,
} from '../event/split-publication.service.js';
import { findCompetitorsByClassWithLegacyShape } from '../competitor/competitor.service.js';
import type { CompetitorSplitsInput, SplitPublicationStatusInput } from './split.schema.js';

export type SplitCompetitorsByClassUpdatedPayload = {
  splitCompetitorsByClassUpdated: Awaited<ReturnType<typeof findCompetitorsByClassWithLegacyShape>>;
};

export async function findSplitsByCompetitor(
  prisma: AppPrismaClient,
  auth: GraphQLAuthContext,
  input: CompetitorSplitsInput,
) {
  const splitPublicationAuth = auth as Parameters<
    typeof assertSplitPublicationAccessibleForCompetitor
  >[1];
  const { competitorId } = input;

  await assertSplitPublicationAccessibleForCompetitor(prisma, splitPublicationAuth, competitorId);

  return prisma.split.findMany({
    where: { competitorId },
    orderBy: { id: 'asc' },
  });
}

export function findSplitPublicationStatus(
  prisma: AppPrismaClient,
  auth: GraphQLAuthContext,
  input: SplitPublicationStatusInput,
) {
  const splitPublicationAuth = auth as Parameters<typeof getSplitPublicationStatus>[1];

  return getSplitPublicationStatus(prisma, splitPublicationAuth, input.classId);
}

export async function* subscribeSplitCompetitorsByClassUpdated(
  prisma: AppPrismaClient,
  auth: GraphQLAuthContext,
  classId: number,
  pubsub: typeof defaultPubsub = defaultPubsub,
): AsyncIterable<SplitCompetitorsByClassUpdatedPayload> {
  const splitPublicationAuth = auth as Parameters<typeof assertSplitPublicationAccessible>[1];

  await assertSplitPublicationAccessible(prisma, splitPublicationAuth, classId);

  yield {
    splitCompetitorsByClassUpdated: await findCompetitorsByClassWithLegacyShape(
      prisma,
      classId,
      true,
    ),
  };

  const topic = `${COMPETITORS_BY_CLASS_UPDATED}_${classId}`;
  const asyncIterableIterator = pubsub.asyncIterableIterator([topic]) as AsyncIterable<unknown>;

  for await (const _payload of asyncIterableIterator) {
    await assertSplitPublicationAccessible(prisma, splitPublicationAuth, classId);

    yield {
      splitCompetitorsByClassUpdated: await findCompetitorsByClassWithLegacyShape(
        prisma,
        classId,
        true,
      ),
    };
  }
}
