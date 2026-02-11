import * as mutations from './mutation.js';
import * as queries from './query.js';
import { typeDef } from './schema.js';
import * as subscriptions from './subscription.js';

import { EVENT_OPENAPI } from '../../modules/event/event.openapi.js';
import { getDecryptedEventPassword } from '../../modules/event/event.service.js';
import { requireEventOwner } from '../../utils/authz.js';
import prisma from '../../utils/context.js';

export { resolvers, typeDef };

const buildPublicImageUrl = (key, eventId) => {
  if (!key || !eventId) return null;
  return `${EVENT_OPENAPI.basePath}/${eventId}/image`;
};

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
    user(parent, _, context) {
      return prisma.user.findUnique({
        where: { id: parent.authorId },
      });
    },
    eventPassword: async (parent, _, context) => {
      const { prisma, auth } = context;
      const { userId } = await requireEventOwner(prisma, auth, parent.id);
      const decryptedPassword = getDecryptedEventPassword(parent.id, userId);
      // Return `null` if no password exists
      if (!decryptedPassword) {
        return null;
      }
      return decryptedPassword;
    },
    featuredImage: (parent) => buildPublicImageUrl(parent.featuredImageKey, parent.id),
  },
};
