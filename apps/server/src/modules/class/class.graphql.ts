import { builder } from '../../graphql/builder.js';

import { findClassById, findEventClasses, findEventClassesByIds } from './class.service.js';

async function requireClass<T>(eventClass: Promise<T | null>): Promise<T> {
  const result = await eventClass;
  if (!result) {
    throw new Error('Class not found');
  }
  return result;
}

export const ClassRef = builder.prismaObject('Class', {
  fields: (t) => ({
    id: t.exposeInt('id'),
    eventId: t.exposeString('eventId'),
    externalId: t.exposeString('externalId', { nullable: true }),
    name: t.exposeString('name'),
    startName: t.exposeString('startName', { nullable: true }),
    length: t.exposeInt('length', { nullable: true }),
    climb: t.exposeInt('climb', { nullable: true }),
    controlsCount: t.exposeInt('controlsCount', { nullable: true }),
    competitorsCount: t.exposeInt('competitorsCount', { nullable: true }),
    printedMaps: t.exposeInt('printedMaps', { nullable: true }),
    minAge: t.exposeInt('minAge', { nullable: true }),
    maxAge: t.exposeInt('maxAge', { nullable: true }),
    sex: t.string({
      nullable: true,
      resolve: (eventClass) => eventClass.sex,
    }),
    status: t.string({
      nullable: true,
      resolve: (eventClass) => eventClass.status,
    }),
    competitors: t.relation('competitors', { nullable: true }),
    teams: t.relation('teams', { nullable: true }),
  }),
});

builder.queryFields((t) => ({
  classById: t.prismaField({
    type: ClassRef,
    args: {
      id: t.arg.int({ required: true }),
    },
    resolve: (query, _root, args, context) =>
      requireClass(findClassById(context.prisma, args.id, query)),
  }),
  eventClasses: t.prismaField({
    type: [ClassRef],
    nullable: true,
    args: {
      eventId: t.arg.string({ required: true }),
    },
    resolve: (query, _root, args, context) => findEventClasses(context.prisma, args.eventId, query),
  }),
  eventClassesByIds: t.prismaField({
    type: [ClassRef],
    nullable: true,
    args: {
      eventId: t.arg.string({ required: true }),
      ids: t.arg.intList(),
    },
    resolve: (query, _root, args, context) =>
      findEventClassesByIds(context.prisma, args.eventId, args.ids, query),
  }),
}));
