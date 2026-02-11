import { typeDef } from './schema.js';
import * as queries from './query.js';
import * as mutations from './mutation.js';
import * as subscriptions from './subscription.js';

import prisma from '../../utils/context.js';

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
    splits(parent, _, context) {
      return prisma.split.findMany({
        where: { competitorId: parent.id },
        orderBy: { time: 'asc' },
      });
    },
  },
};
