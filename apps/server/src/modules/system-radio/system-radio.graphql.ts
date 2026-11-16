import { builder } from '../../graphql/builder.js';
import { requireAdmin } from '../../utils/authz.js';
import { brokerProfiles } from '../yaroc/yaroc.config.js';
import { yarocNativeAvailable } from '../yaroc/yaroc.native.js';
import { sessionActive } from '../yaroc/yaroc.session.js';
import {
  systemRadioInventory,
  saveSystemRadio,
  archiveSystemRadio,
  assignSystemRadio,
  systemCollection,
  configureSystemCollection,
  stopSystemCollection,
} from './system-radio.service.js';

type Unit = Awaited<ReturnType<typeof systemRadioInventory>>[number];
type Collection = Awaited<ReturnType<typeof systemCollection>>;
const UnitRef = builder.objectRef<Unit>('SystemRadioDevice').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    sourceType: t.exposeString('sourceType'),
    macAddress: t.exposeString('macAddress'),
    intervalSeconds: t.exposeInt('intervalSeconds'),
    brokerProfile: t.exposeString('brokerProfile'),
    meshtasticChannel: t.exposeString('meshtasticChannel', { nullable: true }),
    archived: t.boolean({ resolve: (unit) => !!unit.archivedAt }),
    eventId: t.string({ nullable: true, resolve: (unit) => unit.currentAssignment?.eventId }),
    eventName: t.string({ nullable: true, resolve: (unit) => unit.currentAssignment?.event.name }),
    eventDate: t.string({
      nullable: true,
      resolve: (unit) => unit.currentAssignment?.event.date.toISOString(),
    }),
    lastSeenAt: t.string({
      nullable: true,
      resolve: (unit) => unit.currentAssignment?.liveDevice.lastSeenAt?.toISOString(),
    }),
    collectionState: t.string({
      resolve: (unit) => {
        const session = unit.currentAssignment?.event.yarocSession[0];
        return sessionActive(session)
          ? session!.state
          : session?.state === 'error'
            ? 'error'
            : 'stopped';
      },
    }),
    collectionError: t.string({
      nullable: true,
      resolve: (unit) => unit.currentAssignment?.event.yarocSession[0]?.error,
    }),
  }),
});
const SettingsRef = builder
  .objectRef<Collection['settings']>('SystemRadioCollectionSettings')
  .implement({
    fields: (t) => ({
      hours: t.exposeInt('hours'),
      checkCode: t.exposeInt('checkCode'),
      startCode: t.exposeInt('startCode'),
      finishCode: t.exposeInt('finishCode'),
    }),
  });
const CollectionRef = builder.objectRef<Collection>('SystemRadioCollection').implement({
  fields: (t) => ({
    eventId: t.exposeString('eventId'),
    timezone: t.exposeString('timezone'),
    state: t.exposeString('state'),
    until: t.exposeString('until', { nullable: true }),
    error: t.exposeString('error', { nullable: true }),
    settings: t.field({ type: SettingsRef, resolve: (value) => value.settings }),
  }),
});
const OptionsRef = builder
  .objectRef<{ devices: Unit[]; brokerProfiles: string[]; available: boolean }>(
    'SystemRadioInventory',
  )
  .implement({
    fields: (t) => ({
      devices: t.field({ type: [UnitRef], resolve: (value) => value.devices }),
      brokerProfiles: t.exposeStringList('brokerProfiles'),
      available: t.exposeBoolean('available'),
    }),
  });
const EventRef = builder
  .objectRef<{ id: string; name: string | null; date: Date }>('SystemRadioEventOption')
  .implement({
    fields: (t) => ({
      id: t.exposeString('id'),
      name: t.string({ resolve: (event) => event.name ?? event.id }),
      date: t.string({ resolve: (event) => event.date.toISOString() }),
    }),
  });
const DeviceInput = builder.inputType('SystemRadioDeviceInput', {
  fields: (t) => ({
    name: t.string({ required: true }),
    sourceType: t.string({ required: true }),
    macAddress: t.string({ required: true }),
    intervalSeconds: t.int(),
    brokerProfile: t.string(),
    meshtasticChannel: t.string(),
  }),
});
const CollectionInput = builder.inputType('SystemRadioCollectionInput', {
  fields: (t) => ({
    hours: t.int(),
    checkCode: t.int({ required: true }),
    startCode: t.int({ required: true }),
    finishCode: t.int({ required: true }),
  }),
});
const normalizeCollection = (input: {
  hours?: number | null;
  checkCode?: number | null;
  startCode?: number | null;
  finishCode?: number | null;
}) => ({ ...input, hours: input.hours ?? 24 });
builder.queryFields((t) => ({
  adminSystemRadios: t.field({
    type: OptionsRef,
    args: { search: t.arg.string() },
    resolve: async (_, args, ctx) => {
      await requireAdmin(ctx.prisma, ctx.auth);
      return {
        devices: await systemRadioInventory(ctx.prisma, args.search?.slice(0, 100)),
        brokerProfiles: Object.keys(brokerProfiles()),
        available: await yarocNativeAvailable(),
      };
    },
  }),
  adminSystemRadioEvents: t.field({
    type: [EventRef],
    args: { search: t.arg.string() },
    resolve: async (_, args, ctx) => {
      await requireAdmin(ctx.prisma, ctx.auth);
      const search = args.search?.trim().slice(0, 100);
      return ctx.prisma.event.findMany({
        where: search ? { OR: [{ name: { contains: search } }, { id: { contains: search } }] } : {},
        select: { id: true, name: true, date: true },
        orderBy: { date: 'desc' },
        take: 50,
      });
    },
  }),
  adminSystemRadioCollection: t.field({
    type: CollectionRef,
    args: { eventId: t.arg.string({ required: true }) },
    resolve: async (_, args, ctx) => {
      await requireAdmin(ctx.prisma, ctx.auth);
      return systemCollection(ctx.prisma, args.eventId);
    },
  }),
}));
builder.mutationFields((t) => ({
  saveSystemRadioDevice: t.field({
    type: UnitRef,
    args: { id: t.arg.string(), input: t.arg({ type: DeviceInput, required: true }) },
    resolve: async (_, args, ctx) => {
      const { userId } = await requireAdmin(ctx.prisma, ctx.auth);
      return saveSystemRadio(
        ctx.prisma,
        userId!,
        {
          ...args.input,
          intervalSeconds: args.input.intervalSeconds ?? 60,
          brokerProfile: args.input.brokerProfile ?? 'default',
          meshtasticChannel: args.input.meshtasticChannel ?? null,
        },
        args.id ?? undefined,
      );
    },
  }),
  archiveSystemRadioDevice: t.field({
    type: UnitRef,
    args: { id: t.arg.string({ required: true }), archived: t.arg.boolean({ required: true }) },
    resolve: async (_, args, ctx) => {
      const { userId } = await requireAdmin(ctx.prisma, ctx.auth);
      return archiveSystemRadio(ctx.prisma, args.id, args.archived, userId!);
    },
  }),
  assignSystemRadioDevice: t.field({
    type: UnitRef,
    args: { id: t.arg.string({ required: true }), eventId: t.arg.string() },
    resolve: async (_, args, ctx) => {
      const { userId } = await requireAdmin(ctx.prisma, ctx.auth);
      return assignSystemRadio(ctx.prisma, args.id, args.eventId ?? null, userId!);
    },
  }),
  saveSystemRadioCollection: t.field({
    type: CollectionRef,
    args: {
      eventId: t.arg.string({ required: true }),
      input: t.arg({ type: CollectionInput, required: true }),
    },
    resolve: async (_, args, ctx) => {
      const { userId } = await requireAdmin(ctx.prisma, ctx.auth);
      return configureSystemCollection(
        ctx.prisma,
        args.eventId,
        userId!,
        normalizeCollection(args.input),
        false,
      );
    },
  }),
  startSystemRadioCollection: t.field({
    type: CollectionRef,
    args: {
      eventId: t.arg.string({ required: true }),
      input: t.arg({ type: CollectionInput, required: true }),
    },
    resolve: async (_, args, ctx) => {
      const { userId } = await requireAdmin(ctx.prisma, ctx.auth);
      return configureSystemCollection(
        ctx.prisma,
        args.eventId,
        userId!,
        normalizeCollection(args.input),
        true,
      );
    },
  }),
  stopSystemRadioCollection: t.field({
    type: CollectionRef,
    args: { eventId: t.arg.string({ required: true }) },
    resolve: async (_, args, ctx) => {
      await requireAdmin(ctx.prisma, ctx.auth);
      return stopSystemCollection(ctx.prisma, args.eventId);
    },
  }),
}));
