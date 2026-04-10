import { typeDef } from './schema.js';
import * as queries from './query.js';
import * as mutations from './mutation.js';
import * as subscriptions from './subscription.js';

import prisma from '../../utils/context.js';
import {
  assertSplitPublicationAccessible,
  assertSplitPublicationAccessibleForCompetitor,
} from '../../modules/event/split-publication.service.js';

export { typeDef, resolvers };

const resolvers = {
  Query: {
    ...queries,
  },
  Mutation: {
    ...mutations,
  },
  Subscription: {
    ...subscriptions,
  },
  Competitor: {
    async splits(parent, _, context) {
      if (typeof parent.classId === 'number') {
        await assertSplitPublicationAccessible(context.prisma, context.auth, parent.classId);
      } else {
        await assertSplitPublicationAccessibleForCompetitor(
          context.prisma,
          context.auth,
          parent.id,
        );
      }

      if (Array.isArray(parent.splits)) {
        return parent.splits;
      }

      return prisma.split.findMany({
        where: { competitorId: parent.id },
        orderBy: { time: 'asc' },
      });
    },
  },
};
