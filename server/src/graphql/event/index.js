import { typeDef } from './schema.js';
import * as queries from './query.js';
import * as mutations from './mutation.js';
import * as subscriptions from './subscription.js';

import prisma from '../../utils/context.js';
import { verifyToken } from '../../utils/jwtToken.js';
import { getDecryptedEventPassword } from '../../modules/event/eventService.js';

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
  Event: {
    classes(parent, _, context) {
      return prisma.class.findMany({
        where: { eventId: parent.id },
      });
    },
    sport(parent, _, context) {
      return prisma.sport.findUnique({
        where: { id: parent.sportId },
      });
    },
    country(parent, _, context) {
      return prisma.country.findUnique({
        where: { countryCode: parent.countryId },
      });
    },
    eventPassword(parent, _, context) {
      if (!context.token) {
        throw new Error('Unauthorized: No token provided');
      }
      const jwtDecoded = verifyToken(context.token);
      if (!jwtDecoded) {
        throw new Error('Unauthorized: Invalid or expired token');
      }
      const { userId } = jwtDecoded;
      const decryptedPassword = getDecryptedEventPassword(parent.id, userId);
      // Return `null` if no password exists
      if (!decryptedPassword) {
        return null;
      }
      return decryptedPassword;
    },
  },
};
