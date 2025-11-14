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
  Class: {
    competitors(parent, _, context) {
      return prisma.competitor.findMany({
        where: { classId: parent.id },
      });
    },
    teams(parent, _, context) {
      return prisma.team.findMany({
        where: { classId: parent.id },
      });
    },
  },
};
