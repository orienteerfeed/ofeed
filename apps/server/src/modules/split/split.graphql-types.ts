import { builder } from '../../graphql/builder.js';

export const SplitRef = builder.prismaObject('Split', {
  fields: (t) => ({
    id: t.exposeInt('id'),
    competitorId: t.exposeInt('competitorId'),
    controlCode: t.exposeInt('controlCode'),
    time: t.exposeInt('time', { nullable: true }),
  }),
});
