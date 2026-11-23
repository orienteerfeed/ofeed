import { lookupAresOrganizer, searchAresOrganizers } from './organizer-ares.service.js';
import type { SettlementSettings } from '@repo/shared';
import { builder } from '../../graphql/builder.js';
import { OrganizerDetailsRef, OrganizerDetailsInputRef } from '../entry/billing.graphql-types.js';
import { getSettlementSettings, updateSettlementSettings } from './event-settlement.service.js';

const SettingsRef = builder.objectRef<SettlementSettings>('EventSettlementSettings').implement({
  fields: (t) => ({
    enabled: t.exposeBoolean('enabled'),
    organizer: t.field({
      type: OrganizerDetailsRef,
      nullable: true,
      resolve: (value) => value.organizer,
    }),
  }),
});
builder.queryFields((t) => ({
  searchOrganizerAres: t.field({
    type: [OrganizerDetailsRef],
    args: { eventId: t.arg.string({ required: true }), name: t.arg.string({ required: true }) },
    resolve: (_root, args, context) =>
      searchAresOrganizers(context.prisma, context.auth, args.eventId, args.name),
  }),
  organizerAres: t.field({
    type: OrganizerDetailsRef,
    nullable: true,
    args: {
      eventId: t.arg.string({ required: true }),
      companyId: t.arg.string({ required: true }),
    },
    resolve: (_root, args, context) =>
      lookupAresOrganizer(context.prisma, context.auth, args.eventId, args.companyId),
  }),
  eventSettlementSettings: t.field({
    type: SettingsRef,
    args: { eventId: t.arg.string({ required: true }) },
    resolve: (_root, args, context) =>
      getSettlementSettings(context.prisma, context.auth, args.eventId),
  }),
}));
builder.mutationFields((t) => ({
  updateEventSettlementSettings: t.field({
    type: SettingsRef,
    args: {
      eventId: t.arg.string({ required: true }),
      enabled: t.arg.boolean({ required: true }),
      organizer: t.arg({ type: OrganizerDetailsInputRef }),
    },
    resolve: (_root, args, context) =>
      updateSettlementSettings(context.prisma, context.auth, args.eventId, {
        enabled: args.enabled,
        organizer: args.organizer
          ? {
              ...args.organizer,
              vatId: args.organizer.vatId ?? undefined,
            }
          : null,
      }),
  }),
}));
