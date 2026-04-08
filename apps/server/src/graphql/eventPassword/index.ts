import { typeDef } from './schema.js';
import * as queries from './query.js';
import * as mutations from './mutation.js';
import prisma from '../../utils/context.js';
export { typeDef, resolvers };

const resolvers = {
  Query: {
    ...queries,
  },
  Mutation: {
    ...mutations,
  },
  EventPassword: {
    event(parent, _, context) {
      return prisma.event.findUnique({
        where: { id: parent.eventId },
      });
    },
  },
};
