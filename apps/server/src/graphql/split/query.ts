import prisma from '../../utils/context.js';
import {
  assertSplitPublicationAccessibleForCompetitor,
  getSplitPublicationStatus,
} from '../../modules/event/split-publication.service.js';

export const competitorSplits = async (_, { competitorId }, context) => {
  await assertSplitPublicationAccessibleForCompetitor(context.prisma, context.auth, competitorId);

  return prisma.split.findMany({
    where: { competitorId: competitorId },
    orderBy: { time: 'asc' },
  });
};

export const splitPublicationStatus = async (_, { classId }, context) => {
  return getSplitPublicationStatus(context.prisma, context.auth, classId);
};
