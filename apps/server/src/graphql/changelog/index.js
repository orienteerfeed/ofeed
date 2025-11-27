import { DateScalar } from '../dateScalar.js';
import * as mutations from './mutation.js';
import * as queries from './query.js';
import { typeDef } from './schema.js';

export { resolvers, typeDef };

const resolvers = {
  Date: DateScalar,
  Query: {
    ...queries,
  },
  Mutation: {
    ...mutations,
  },
};
