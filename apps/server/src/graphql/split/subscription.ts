import { COMPETITORS_BY_CLASS_UPDATED, pubsub } from '../../lib/pubsub.js';
import { assertSplitPublicationAccessible } from '../../modules/event/split-publication.service.js';
import { getCompetitorsWithSplitsByClass } from '../competitor/shared.js';

export const splitCompetitorsByClassUpdated = {
  subscribe: async function* (_, { classId }, context) {
    await assertSplitPublicationAccessible(context.prisma, context.auth, classId);

    yield {
      splitCompetitorsByClassUpdated: await getCompetitorsWithSplitsByClass(classId),
    };

    const topic = `${COMPETITORS_BY_CLASS_UPDATED}_${classId}`;
    const asyncIterableIterator = pubsub.asyncIterableIterator([topic]) as AsyncIterable<unknown>;

    for await (const _payload of asyncIterableIterator) {
      await assertSplitPublicationAccessible(context.prisma, context.auth, classId);

      yield {
        splitCompetitorsByClassUpdated: await getCompetitorsWithSplitsByClass(classId),
      };
    }
  },
  resolve: (payload) => {
    return payload.splitCompetitorsByClassUpdated;
  },
};
