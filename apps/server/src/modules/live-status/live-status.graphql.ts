import { restartMonitoring } from './live-status.monitoring.js';
import { builder } from '../../graphql/builder.js';
import {
  authorizeLive,
  registerDevice,
  snapshot,
  deviceHistory,
  tokenHash,
} from './live-status.service.js';
import { monitoringSchema, liveIntervalSchema, type YarocSettings } from '@repo/shared';
import { randomBytes } from 'node:crypto';
import { liveBus, liveTopic, notifyLiveStatus } from './live-status.bus.js';
import { startYarocSession, stopYarocSession, saveYarocSettings } from '../yaroc/yaroc.service.js';

type Device = Awaited<ReturnType<typeof snapshot>>['devices'][number];
const DeviceRef = builder.objectRef<Device>('LiveDeviceStatus').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    sourceType: t.exposeString('sourceType'),
    revoked: t.exposeBoolean('revoked'),
    status: t.exposeString('status'),
    macAddress: t.exposeString('macAddress', { nullable: true }),
    intervalSeconds: t.exposeInt('intervalSeconds'),
    lastSeenAt: t.exposeString('lastSeenAt', { nullable: true }),
    lastPunchAt: t.exposeString('lastPunchAt', { nullable: true }),
    uploadState: t.exposeString('uploadState', { nullable: true }),
    uploadCompletedAt: t.exposeString('uploadCompletedAt', { nullable: true }),
    uploadBytes: t.exposeFloat('uploadBytes', { nullable: true }),
    uploadDurationMs: t.exposeFloat('uploadDurationMs', { nullable: true }),
    batteryPercent: t.exposeFloat('batteryPercent', { nullable: true }),
    gsmRsrpDbm: t.exposeFloat('gsmRsrpDbm', { nullable: true }),
    gsmRssiDbm: t.exposeFloat('gsmRssiDbm', { nullable: true }),
    gsmSnrDb: t.exposeFloat('gsmSnrDb', { nullable: true }),
    loraRssiDbm: t.exposeFloat('loraRssiDbm', { nullable: true }),
    loraSnrDb: t.exposeFloat('loraSnrDb', { nullable: true }),
    signalBars: t.exposeInt('signalBars', { nullable: true }),
    latitude: t.exposeFloat('latitude', { nullable: true }),
    longitude: t.exposeFloat('longitude', { nullable: true }),
    positionAt: t.exposeString('positionAt', { nullable: true }),
    errorMessage: t.exposeString('errorMessage', { nullable: true }),
  }),
});
const YarocSettingsRef = builder.objectRef<YarocSettings>('EventYarocSettings').implement({
  fields: (t) => ({
    hours: t.exposeFloat('hours'),
    checkCode: t.exposeInt('checkCode'),
    startCode: t.exposeInt('startCode'),
    finishCode: t.exposeInt('finishCode'),
    brokerProfile: t.exposeString('brokerProfile'),
    meshtasticChannel: t.exposeString('meshtasticChannel', { nullable: true }),
  }),
});
const StatusRef = builder
  .objectRef<Awaited<ReturnType<typeof snapshot>>>('EventLiveStatus')
  .implement({
    fields: (t) => ({
      yarocSettings: t.field({ type: YarocSettingsRef, resolve: (s) => s.yarocSettings }),
      devices: t.field({ type: [DeviceRef], resolve: (s) => s.devices }),
      brokerProfiles: t.exposeStringList('brokerProfiles'),
      yarocAvailable: t.exposeBoolean('yarocAvailable'),
      sessionUntil: t.exposeString('sessionUntil', { nullable: true }),
      monitoringStartedAt: t.exposeString('monitoringStartedAt', { nullable: true }),
      monitoringUntil: t.exposeString('monitoringUntil', { nullable: true }),
      sessionState: t.exposeString('sessionState'),
      sessionError: t.exposeString('sessionError', { nullable: true }),
    }),
  });
type History = Awaited<ReturnType<typeof deviceHistory>>;
const SampleRef = builder.objectRef<History['samples'][number]>('LiveDeviceSample').implement({
  fields: (t) => ({
    minute: t.exposeString('minute'),
    count: t.exposeInt('count'),
    maxGapMs: t.exposeInt('maxGapMs'),
    batteryPercent: t.exposeFloat('batteryPercent', { nullable: true }),
    gsmRsrpDbm: t.exposeFloat('gsmRsrpDbm', { nullable: true }),
    gsmSnrDb: t.exposeFloat('gsmSnrDb', { nullable: true }),
    loraRssiDbm: t.exposeFloat('loraRssiDbm', { nullable: true }),
    loraSnrDb: t.exposeFloat('loraSnrDb', { nullable: true }),
  }),
});
const OutageRef = builder.objectRef<History['outages'][number]>('LiveDeviceOutage').implement({
  fields: (t) => ({
    kind: t.exposeString('kind'),
    startedAt: t.exposeString('startedAt'),
    endedAt: t.exposeString('endedAt', { nullable: true }),
  }),
});
const HistoryRef = builder.objectRef<History>('LiveDeviceHistory').implement({
  fields: (t) => ({
    samples: t.field({ type: [SampleRef], resolve: (h) => h.samples }),
    outages: t.field({ type: [OutageRef], resolve: (h) => h.outages }),
  }),
});
const RegistrationRef = builder
  .objectRef<{ deviceId: string; token: string }>('LiveDeviceRegistration')
  .implement({
    fields: (t) => ({ deviceId: t.exposeID('deviceId'), token: t.exposeString('token') }),
  });
builder.queryFields((t) => ({
  eventLiveStatus: t.field({
    type: StatusRef,
    args: { eventId: t.arg.string({ required: true }) },
    resolve: async (_, a, c) => {
      await authorizeLive(c.prisma, c.auth, a.eventId);
      return snapshot(c.prisma, a.eventId);
    },
  }),
  eventDeviceHistory: t.field({
    type: HistoryRef,
    args: {
      eventId: t.arg.string({ required: true }),
      deviceId: t.arg.string({ required: true }),
      from: t.arg.string({ required: true }),
      to: t.arg.string({ required: true }),
    },
    resolve: async (_, a, c) => {
      await authorizeLive(c.prisma, c.auth, a.eventId);
      return deviceHistory(c.prisma, a.eventId, a.deviceId, a.from, a.to);
    },
  }),
}));
builder.mutationFields((t) => ({
  registerLiveDevice: t.field({
    type: RegistrationRef,
    args: {
      eventId: t.arg.string({ required: true }),
      name: t.arg.string({ required: true }),
      sourceType: t.arg.string({ required: true }),
      macAddress: t.arg.string(),
      intervalSeconds: t.arg.int(),
    },
    resolve: async (_, a, c) => {
      await authorizeLive(c.prisma, c.auth, a.eventId);
      const result = await registerDevice(c.prisma, a.eventId, {
        ...a,
        macAddress: a.macAddress ?? undefined,
        intervalSeconds:
          a.intervalSeconds ?? (['yaroc', 'meshtastic'].includes(a.sourceType) ? 60 : 10),
      });
      await notifyLiveStatus(a.eventId);
      return { deviceId: result.device.id, token: result.token };
    },
  }),
  rotateLiveDeviceToken: t.field({
    type: RegistrationRef,
    args: { eventId: t.arg.string({ required: true }), deviceId: t.arg.string({ required: true }) },
    resolve: async (_, a, c) => {
      await authorizeLive(c.prisma, c.auth, a.eventId);
      const token = randomBytes(32).toString('base64url');
      const changed = await c.prisma.liveDevice.updateMany({
        where: { id: a.deviceId, eventId: a.eventId },
        data: { tokenHash: tokenHash(token), revokedAt: null },
      });
      if (!changed.count) throw new Error('Device not found');
      return { deviceId: a.deviceId, token };
    },
  }),
  revokeLiveDevice: t.boolean({
    args: { eventId: t.arg.string({ required: true }), deviceId: t.arg.string({ required: true }) },
    resolve: async (_, a, c) => {
      await authorizeLive(c.prisma, c.auth, a.eventId);
      await c.prisma.liveDevice.updateMany({
        where: { id: a.deviceId, eventId: a.eventId },
        data: { tokenHash: null, revokedAt: new Date() },
      });
      await notifyLiveStatus(a.eventId);
      return true;
    },
  }),
  updateLiveDeviceInterval: t.boolean({
    args: {
      eventId: t.arg.string({ required: true }),
      deviceId: t.arg.string({ required: true }),
      intervalSeconds: t.arg.int({ required: true }),
    },
    resolve: async (_, a, c) => {
      await authorizeLive(c.prisma, c.auth, a.eventId);
      const intervalSeconds = liveIntervalSchema.parse(a.intervalSeconds);
      const result = await c.prisma.liveDevice.updateMany({
        where: { id: a.deviceId, eventId: a.eventId },
        data: { intervalSeconds },
      });
      if (!result.count) throw new Error('Device not found');
      await notifyLiveStatus(a.eventId);
      return true;
    },
  }),
  startLiveMonitoring: t.boolean({
    args: { eventId: t.arg.string({ required: true }), hours: t.arg.int() },
    resolve: async (_, a, c) => {
      await authorizeLive(c.prisma, c.auth, a.eventId);
      const { hours } = monitoringSchema.parse({ hours: a.hours ?? 24 });
      const now = new Date();
      const until = new Date(+now + hours * 3600_000);
      await restartMonitoring(c.prisma, a.eventId, now, until);
      await notifyLiveStatus(a.eventId);
      return true;
    },
  }),
  updateEventYarocSettings: t.boolean({
    args: {
      eventId: t.arg.string({ required: true }),
      hours: t.arg.int(),
      checkCode: t.arg.int({ required: true }),
      startCode: t.arg.int({ required: true }),
      finishCode: t.arg.int({ required: true }),
      brokerProfile: t.arg.string(),
      meshtasticChannel: t.arg.string(),
    },
    resolve: async (_, a, c) => {
      await authorizeLive(c.prisma, c.auth, a.eventId);
      await saveYarocSettings(c.prisma, a.eventId, {
        ...a,
        hours: a.hours ?? 24,
        brokerProfile: a.brokerProfile ?? 'default',
        meshtasticChannel: a.meshtasticChannel ?? undefined,
      });
      return true;
    },
  }),
  startYaroc: t.boolean({
    args: {
      eventId: t.arg.string({ required: true }),
      hours: t.arg.int(),
      checkCode: t.arg.int({ required: true }),
      startCode: t.arg.int({ required: true }),
      finishCode: t.arg.int({ required: true }),
      brokerProfile: t.arg.string(),
      meshtasticChannel: t.arg.string(),
    },
    resolve: async (_, a, c) => {
      const { userId } = await authorizeLive(c.prisma, c.auth, a.eventId);
      await startYarocSession(c.prisma, a.eventId, userId!, {
        ...a,
        hours: a.hours ?? 24,
        brokerProfile: a.brokerProfile ?? 'default',
        meshtasticChannel: a.meshtasticChannel ?? undefined,
      });
      return true;
    },
  }),
  stopYaroc: t.boolean({
    args: { eventId: t.arg.string({ required: true }) },
    resolve: async (_, a, c) => {
      await authorizeLive(c.prisma, c.auth, a.eventId);
      await stopYarocSession(c.prisma, a.eventId);
      return true;
    },
  }),
}));
builder.subscriptionFields((t) => ({
  eventLiveStatusChanged: t.field({
    type: StatusRef,
    args: { eventId: t.arg.string({ required: true }) },
    subscribe: async (_, a, c) => {
      await authorizeLive(c.prisma, c.auth, a.eventId);
      return liveBus.asyncIterableIterator<string>(liveTopic(a.eventId));
    },
    resolve: async (_, a, c) => {
      await authorizeLive(c.prisma, c.auth, a.eventId);
      return snapshot(c.prisma, a.eventId);
    },
  }),
}));
