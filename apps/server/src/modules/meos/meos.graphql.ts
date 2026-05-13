import { builder } from '../../graphql/builder.js';
import { requireEventOwnerOrAdmin } from '../../utils/authz.js';
import prisma from '../../utils/context.js';

export const EventMeosBindingRef = builder.prismaObject('EventMeosBinding', {
  fields: (t) => ({
    id: t.exposeInt('id'),
    eventId: t.exposeString('eventId'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
  }),
});

builder.prismaObjectFields('Event', (t) => ({
  meosEventBindings: t.relation('meosEventBindings', {
    nullable: true,
    resolve: async (query, event, _args, context) => {
      await requireEventOwnerOrAdmin(context.prisma, context.auth, event.id);
      return context.prisma.eventMeosBinding.findMany({
        ...query,
        where: { eventId: event.id },
        orderBy: { createdAt: 'asc' },
      });
    },
  }),
}));

builder.mutationFields((t) => ({
  createMeosEventBinding: t.prismaField({
    type: EventMeosBindingRef,
    args: {
      eventId: t.arg.string({ required: true }),
    },
    resolve: async (query, _root, args, context) => {
      await requireEventOwnerOrAdmin(context.prisma, context.auth, args.eventId as string);
      return prisma.eventMeosBinding.create({
        ...query,
        data: { eventId: args.eventId as string },
      });
    },
  }),
  deleteMeosEventBinding: t.field({
    type: 'Boolean',
    args: {
      id: t.arg.int({ required: true }),
    },
    resolve: async (_root, args, context) => {
      const binding = await prisma.eventMeosBinding.findUnique({
        where: { id: args.id as number },
        select: { eventId: true },
      });
      if (!binding) return false;
      await requireEventOwnerOrAdmin(context.prisma, context.auth, binding.eventId);
      await prisma.eventMeosBinding.delete({ where: { id: args.id as number } });
      return true;
    },
  }),
}));
