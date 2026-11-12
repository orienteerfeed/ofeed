import { brokerProfiles } from './yaroc.config.js';
import { activeYaroc } from '../live-status/live-status.metrics.js';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { yarocSettingsSchema, registerLiveDeviceSchema } from '@repo/shared';
import type { AppPrismaClient } from '../../db/prisma-client.js';
import { ingestHeartbeat } from '../live-status/live-status.service.js';
import { ingestYarocPunches } from '../punch/punch.service.js';
import { loadYaroc, timezoneOffset, workerId, type NativeClient } from './yaroc.service.js';
import { notifyLiveStatus } from '../live-status/live-status.bus.js';

export function stablePunchId(value: string) {
  const hex = createHash('sha256').update(value).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(
    17,
    20,
  )}-${hex.slice(20, 32)}`;
}
const punch = z.object({
  card: z.number().int().positive(),
  code: z.number().int(),
  time: z.string().datetime({ offset: true }),
});
const nativeEvent = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('SiPunches'),
    payload: z.array(
      z.object({
        punch,
        hostInfo: z.object({ macAddress: z.string() }),
        rssiDbm: z.number().nullish(),
        snr: z.number().nullish(),
        hopCount: z.number().nullish(),
      }),
    ),
  }),
  z.object({
    type: z.literal('CellularLog'),
    payload: z.object({
      macAddress: z.string(),
      rsrpDbm: z.number().nullish(),
      snr: z.number().nullish(),
      batteryPercentage: z.number().nullish(),
    }),
  }),
  z.object({
    type: z.literal('NodeInfos'),
    payload: z.array(
      z.object({
        name: z.string(),
        lastUpdate: z.string().nullish(),
        signalStrength: z.string(),
        batteryPercentage: z.number().nullish(),
      }),
    ),
  }),
]);
export function startYarocWorker(db: AppPrismaClient, report: (error: unknown) => void) {
  const clients = new Map<
    string,
    { client: NativeClient; generation: number; queue: Promise<void>; pending: number }
  >();
  let busy = false,
    closed = false;
  async function tick() {
    if (busy || closed) return;
    busy = true;
    try {
      const now = new Date();
      await db.yarocSession.updateMany({
        where: { until: { lte: now }, state: { in: ['starting', 'running'] } },
        data: { state: 'stopped', owner: null, leaseUntil: null, generation: { increment: 1 } },
      });
      const sessions = await db.yarocSession.findMany({
        where: { until: { gt: now }, state: { in: ['starting', 'running'] } },
      });
      for (const [id, local] of clients)
        if (
          !sessions.some(
            (s) => s.eventId === id && s.owner === workerId && s.generation === local.generation,
          )
        ) {
          local.client.stop();
          clients.delete(id);
        }
      for (const session of sessions) {
        const claimed = await db.yarocSession.updateMany({
          where: {
            eventId: session.eventId,
            generation: session.generation,
            OR: [{ owner: workerId }, { leaseUntil: null }, { leaseUntil: { lt: now } }],
          },
          data: {
            owner: workerId,
            leaseUntil: new Date(+now + 30_000),
            generation: session.owner === workerId ? undefined : { increment: 1 },
          },
        });
        if (!claimed.count) continue;
        if (clients.has(session.eventId)) continue;
        const owned = await db.yarocSession.findUniqueOrThrow({
          where: { eventId: session.eventId },
        });
        try {
          const { MqttClient } = await loadYaroc();
          const devices = await db.liveDevice.findMany({
            where: {
              eventId: session.eventId,
              revokedAt: null,
              sourceType: { in: ['yaroc', 'meshtastic'] },
            },
          });
          if (!devices.length) throw new Error('No active radio units remain');
          for (const device of devices) registerLiveDeviceSchema.parse(device);
          const event = await db.event.findUniqueOrThrow({ where: { id: session.eventId } });
          const settings = yarocSettingsSchema.parse(session.settings);
          const client = new MqttClient(
            devices.map((d) => ({ name: d.name, macAddress: d.macAddress! })),
            [
              {
                ...brokerProfiles()[settings.brokerProfile],
                meshtasticChannel: settings.meshtasticChannel,
              },
            ],
            z.object({ timezoneOffset: z.string().optional() }).parse(session.settings)
              .timezoneOffset ?? timezoneOffset(event.timezone, now),
          );
          const local = {
            client,
            generation: owned.generation,
            queue: Promise.resolve(),
            pending: 0,
          };
          clients.set(session.eventId, local);
          client.start((error, raw) => {
            if (error) {
              report(error);
              return;
            }
            const parsed = nativeEvent.safeParse(raw);
            if (!parsed.success) return;
            if (local.pending >= 1000) {
              client.stop();
              void db.yarocSession
                .updateMany({
                  where: {
                    eventId: session.eventId,
                    owner: workerId,
                    generation: owned.generation,
                  },
                  data: { state: 'error', error: 'Reception queue overflow; reception stopped' },
                })
                .then(() => notifyLiveStatus(session.eventId))
                .catch(report);
              return;
            }
            local.pending++;
            local.queue = local.queue
              .then(async () => {
                const active = await db.yarocSession.findUniqueOrThrow({
                  where: { eventId: session.eventId },
                });
                if (
                  active.owner !== workerId ||
                  active.generation !== owned.generation ||
                  active.until <= new Date() ||
                  !active.leaseUntil ||
                  active.leaseUntil <= new Date()
                )
                  return;
                const incoming = parsed.data;
                const fence = {
                  eventId: session.eventId,
                  owner: workerId,
                  generation: owned.generation,
                };
                if (incoming.type === 'SiPunches')
                  for (const log of incoming.payload) {
                    const device = devices.find(
                      (d) => d.macAddress === log.hostInfo.macAddress.toLowerCase(),
                    );
                    if (
                      !device ||
                      !(await db.liveDevice.findFirst({
                        where: { id: device.id, eventId: session.eventId, revokedAt: null },
                        select: { id: true },
                      }))
                    )
                      continue;
                    const p = log.punch;
                    const code =
                      p.code === settings.checkCode
                        ? -2
                        : p.code === settings.startCode
                        ? 0
                        : p.code === settings.finishCode
                        ? -1
                        : p.code;
                    await ingestYarocPunches(db, session.eventId, workerId, owned.generation, {
                      source: 'SRR',
                      deviceId: `yaroc:${device.id}`,
                      punches: [
                        {
                          clientPunchId: stablePunchId(
                            `${device.id}/${p.card}/${code}/${new Date(p.time).toISOString()}`,
                          ),
                          card: p.card,
                          controlCode: code,
                          punchTime: new Date(p.time).toISOString(),
                          receivedAt: new Date().toISOString(),
                        },
                      ],
                    });
                    await ingestHeartbeat(
                      db,
                      device.id,
                      {
                        version: 1,
                        messageId: stablePunchId(
                          `telemetry/${device.id}/${p.card}/${p.code}/${p.time}`,
                        ),
                        measuredAt: p.time,
                        metrics: {
                          lastPunchAt: p.time,
                          loraRssiDbm: log.rssiDbm ?? undefined,
                          loraSnrDb: log.snr ?? undefined,
                          hopCount: log.hopCount ?? undefined,
                        },
                      },
                      undefined,
                      fence,
                    ).catch(report);
                  }
                if (incoming.type === 'CellularLog') {
                  const p = incoming.payload,
                    device = devices.find((d) => d.macAddress === p.macAddress.toLowerCase());
                  if (device)
                    await ingestHeartbeat(
                      db,
                      device.id,
                      {
                        version: 1,
                        messageId: stablePunchId(JSON.stringify(p) + Math.floor(Date.now() / 5000)),
                        measuredAt: new Date().toISOString(),
                        metrics: {
                          gsmRsrpDbm: p.rsrpDbm ?? undefined,
                          gsmSnrDb: p.snr ?? undefined,
                          batteryPercent: p.batteryPercentage ?? undefined,
                        },
                      },
                      undefined,
                      fence,
                    ).catch(report);
                }
                if (incoming.type === 'NodeInfos')
                  for (const p of incoming.payload) {
                    const device = devices.find((d) => d.name === p.name);
                    if (device && p.lastUpdate)
                      await ingestHeartbeat(
                        db,
                        device.id,
                        {
                          version: 1,
                          messageId: stablePunchId(`${device.id}/${p.lastUpdate}`),
                          measuredAt: p.lastUpdate,
                          metrics: {
                            batteryPercent: p.batteryPercentage ?? undefined,
                            signalBars: [...p.signalStrength].filter((c) => c !== '_').length,
                          },
                        },
                        new Date(p.lastUpdate),
                        fence,
                      ).catch(report);
                  }
              })
              .catch(async (error) => {
                report(error);
                client.stop();
                await db.yarocSession.updateMany({
                  where: {
                    eventId: session.eventId,
                    owner: workerId,
                    generation: owned.generation,
                  },
                  data: {
                    state: 'error',
                    error: 'Reception processing failed; inspect server logs',
                  },
                });
                await notifyLiveStatus(session.eventId);
              })
              // Keep the queue resolved even if recording the error state fails.
              .catch(report)
              .finally(() => {
                local.pending--;
              });
          });
          await db.yarocSession.updateMany({
            where: { eventId: session.eventId, owner: workerId, generation: owned.generation },
            data: { state: 'running', error: null },
          });
          await notifyLiveStatus(session.eventId);
        } catch (error) {
          report(error);
          await db.yarocSession.updateMany({
            where: { eventId: session.eventId, owner: workerId, generation: owned.generation },
            data: {
              state: 'error',
              error: 'YAROC native startup failed; verify the installed 0.1.3 package',
            },
          });
        }
      }
    } catch (error) {
      for (const { client } of clients.values()) client.stop();
      clients.clear();
      report(error);
    } finally {
      activeYaroc.set(clients.size);
      busy = false;
    }
  }
  const timer = setInterval(() => void tick(), 10_000);
  timer.unref();
  void tick();
  return async () => {
    closed = true;
    clearInterval(timer);
    while (busy) await new Promise((resolve) => setTimeout(resolve, 20));
    for (const local of clients.values()) {
      local.client.stop();
      await local.queue;
    }
    await db.yarocSession.updateMany({
      where: { owner: workerId },
      data: { owner: null, leaseUntil: null },
    });
  };
}
