import { afterEach, describe, expect, it, vi } from 'vitest';
import { startYarocWorker } from '../yaroc.worker.js';
import { workerId } from '../yaroc.service.js';
import { ingestYarocPunches } from '../../punch/punch.service.js';
import type { AppPrismaClient } from '../../../db/prisma-client.js';

const state = vi.hoisted(() => ({
  clients: [] as {
    dns: { name: string; macAddress: string }[];
    configs: { meshtasticChannel?: string }[];
    callback?: (error: Error | null, event: unknown) => void;
    stop: ReturnType<typeof vi.fn>;
  }[],
}));
vi.mock('../yaroc.native.js', () => ({
  loadYaroc: vi.fn().mockResolvedValue({
    MqttClient: class {
      stop = vi.fn();
      constructor(
        public dns: { name: string; macAddress: string }[],
        public configs: { meshtasticChannel?: string }[],
      ) {
        state.clients.push(this);
      }
      start(callback: (error: Error | null, event: unknown) => void) {
        Object.assign(this, { callback });
      }
    },
  }),
}));
vi.mock('../../live-status/live-status.bus.js', () => ({
  notifyLiveStatus: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../punch/punch.service.js', () => ({
  ingestYarocPunches: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../live-status/live-status.service.js', () => ({
  ingestHeartbeat: vi.fn().mockResolvedValue({}),
}));
let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
  state.clients = [];
  vi.clearAllMocks();
});
describe('scoped native reception', () => {
  it('groups system channels, isolates personal units and sends the scope with punches', async () => {
    const now = new Date();
    const settings = {
      hours: 24,
      checkCode: 3,
      startCode: 1,
      finishCode: 2,
      brokerProfile: 'default',
      timezoneOffset: '+00:00',
    };
    const sessions = ['event', 'system'].map((scope) => ({
      eventId: 'race',
      scope,
      owner: workerId,
      generation: 1,
      leaseUntil: new Date(+now + 60_000),
      until: new Date(+now + 3600_000),
      startedAt: new Date(+now - 1000),
      state: 'running',
      settings,
    }));
    const unit = (name: string, macAddress: string, channel?: string) => ({
      id: name,
      name,
      macAddress,
      sourceType: channel ? 'meshtastic' : 'yaroc',
      intervalSeconds: 60,
      systemDevice: channel ? { brokerProfile: 'default', meshtasticChannel: channel } : null,
    });
    const personal = unit('personal', 'deadbeef0001');
    const system = [
      unit('system-one', 'dead0002', 'club-one'),
      unit('system-two', 'dead0003', 'club-two'),
    ];
    const db = {
      yarocSession: {
        findMany: vi
          .fn()
          .mockImplementation(({ where }) => Promise.resolve(where.scope ? [] : sessions)),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi
          .fn()
          .mockImplementation(({ where }) =>
            Promise.resolve(
              sessions.find((session) => session.scope === where.eventId_scope.scope),
            ),
          ),
      },
      liveDevice: {
        findMany: vi
          .fn()
          .mockImplementation(({ where }) =>
            Promise.resolve(where.systemDeviceId === null ? [personal] : system),
          ),
        findFirst: vi.fn().mockResolvedValue({ id: 'valid' }),
      },
      event: { findUniqueOrThrow: vi.fn().mockResolvedValue({ timezone: 'UTC' }) },
    } as unknown as AppPrismaClient;
    const report = vi.fn();
    close = startYarocWorker(db, report);
    await vi.waitFor(() => expect(state.clients).toHaveLength(3));
    expect(state.clients.map((client) => client.dns.map((device) => device.name))).toEqual([
      ['personal'],
      ['system-one'],
      ['system-two'],
    ]);
    expect(state.clients[1].configs[0].meshtasticChannel).toBe('club-one');
    for (const client of state.clients)
      client.callback!(null, {
        type: 'SiPunches',
        payload: [
          {
            hostInfo: client.dns[0],
            punch: { card: 1234, code: 31, time: new Date().toISOString() },
          },
        ],
      });
    await vi.waitFor(() => expect(ingestYarocPunches).toHaveBeenCalledTimes(3));
    expect(vi.mocked(ingestYarocPunches).mock.calls.map((call) => call[5])).toEqual([
      'event',
      'system',
      'system',
    ]);
    expect(report).not.toHaveBeenCalled();
    await close();
    close = undefined;
    for (const client of state.clients) expect(client.stop).toHaveBeenCalledOnce();
  });
});
