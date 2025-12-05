import * as mutations from './mutation.js';
import * as queries from './query.js';
import { typeDef } from './schema.js';

export { resolvers, typeDef };

const resolvers = {
  Query: {
    ...queries,
  },
  Mutation: {
    ...mutations,
  },
};
