import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppPrismaClient } from '../../../db/prisma-client.js';
vi.mock('../live-status.external.js', () => ({
  registerExternalDevice: vi.fn(),
  legacySourceId: (eventId: string, source: string) => `${eventId}:${source}`,
}));
vi.mock('../live-status.service.js', () => ({ ingestHeartbeat: vi.fn() }));
vi.mock('../../../lib/logging.js', () => ({ logger: { warn: vi.fn() } }));
import { registerExternalDevice } from '../live-status.external.js';
import { ingestHeartbeat } from '../live-status.service.js';
import { noteMeosUpload } from '../live-status.meos.js';
function database(active = true) {
  return {
    liveMonitoring: {
      findUnique: vi
        .fn()
        .mockResolvedValue(active ? { until: new Date(Date.now() + 60_000) } : null),
    },
  } as unknown as AppPrismaClient;
}
beforeEach(() => {
  vi.mocked(registerExternalDevice).mockReset();
  vi.mocked(ingestHeartbeat).mockReset();
  vi.mocked(registerExternalDevice).mockResolvedValue({ id: 'device' } as never);
});
describe('MOP telemetry boundary', () => {
  it('tracks processing and completed bytes/duration for the authenticated binding', async () => {
    const db = database();
    const startedAt = Date.now() - 500;
    await noteMeosUpload(db, 'event', 42, 'processing', 128, startedAt);
    await noteMeosUpload(db, 'event', 42, 'completed', 128, startedAt);
    const calls = vi.mocked(ingestHeartbeat).mock.calls;
    expect(calls[0][2].metrics).toMatchObject({ uploadState: 'processing', uploadBytes: 128 });
    expect(calls[0][2].metrics).not.toHaveProperty('uploadDurationMs');
    expect(calls[1][2].metrics).toMatchObject({
      uploadState: 'completed',
      uploadBytes: 128,
      errorCode: '',
    });
    expect(calls[1][2].metrics.uploadDurationMs).toBeGreaterThanOrEqual(500);
    expect(vi.mocked(registerExternalDevice).mock.calls[0][3]).toMatchObject({
      sourceType: 'meos',
      sourceId: 'event:meos:42',
    });
  });
  it('registers before monitoring but does not record telemetry outside its window', async () => {
    await noteMeosUpload(database(false), 'event', 42, 'completed', 128, Date.now());
    expect(registerExternalDevice).toHaveBeenCalledOnce();
    expect(ingestHeartbeat).not.toHaveBeenCalled();
  });
  it('absorbs registration/storage failures so they cannot change MOP responses', async () => {
    vi.mocked(registerExternalDevice).mockRejectedValue(new Error('DB unavailable'));
    await expect(
      noteMeosUpload(database(), 'event', 42, 'failed', 128, Date.now()),
    ).resolves.toBeUndefined();
    expect(ingestHeartbeat).not.toHaveBeenCalled();
  });
});
