import { builder } from '../../graphql/builder.js';

import { findSportById, findSports } from './sport.service.js';

export const SportRef = builder.prismaObject('Sport', {
  fields: (t) => ({
    id: t.exposeInt('id'),
    name: t.exposeString('name'),
  }),
});

builder.queryFields((t) => ({
  sports: t.prismaField({
    type: [SportRef],
    resolve: (query, _root, _args, context) => findSports(context.prisma, query),
  }),
  sport: t.prismaField({
    type: SportRef,
    nullable: true,
    args: {
      id: t.arg.int({ required: true }),
    },
    resolve: (query, _root, args, context) => findSportById(context.prisma, args.id, query),
  }),
}));
