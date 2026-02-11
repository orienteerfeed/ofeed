import { typeDef } from './schema.js';
import * as queries from './query.js';
import * as mutations from './mutation.js';

export { typeDef, resolvers };

const resolvers = {
  Query: {
    ...queries,
  },
  Mutation: {
    ...mutations,
  },
};
