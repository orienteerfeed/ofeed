import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { AppPrismaClient } from '../../../db/prisma-client.js';
vi.mock('../live-status.service.js', () => ({ ingestHeartbeat: vi.fn() }));
import { ingestHeartbeat } from '../live-status.service.js';
import {
  registerExternalDevice,
  registerUploadSource,
  legacySourceId,
} from '../live-status.external.js';
const auth = { isAuthenticated: true, type: 'eventBasic' as const, eventId: 'race', userId: 1 };
const sourceId = 'f9e5f5b0-5540-49e2-a719-6c7db9a36fed';
function database() {
  const upsert = vi.fn().mockResolvedValue({
    id: 'device',
    eventId: 'race',
    sourceType: 'quickevent',
    sourceId,
    revokedAt: null,
  });
  const monitoring = vi.fn().mockResolvedValue(null);
  const db = {
    liveDevice: { upsert },
    liveMonitoring: { findUnique: monitoring },
  } as unknown as AppPrismaClient;
  return { db, upsert, monitoring };
}
describe('event-password application onboarding', () => {
  beforeEach(() => {
    vi.mocked(ingestHeartbeat).mockClear();
  });
  it('reuses a stable identity without changing settings or issuing bearer credentials', async () => {
    const { db, upsert } = database();
    await registerExternalDevice(db, auth, 'race', { sourceType: 'quickevent', sourceId });
    await registerExternalDevice(db, auth, 'race', { sourceType: 'quickevent', sourceId });
    expect(upsert.mock.calls[0][0].where).toEqual(upsert.mock.calls[1][0].where);
    expect(upsert.mock.calls[0][0].update).toEqual({});
    expect(upsert.mock.calls[0][0].create).not.toHaveProperty('tokenHash');
  });
  it('rejects other events and application types before any write', async () => {
    const { db, upsert } = database();
    await expect(
      registerExternalDevice(db, auth, 'other', { sourceType: 'quickevent', sourceId }),
    ).rejects.toThrow('match');
    await expect(
      registerExternalDevice(db, auth, 'race', { sourceType: 'yaroc', sourceId }),
    ).rejects.toThrow();
    expect(upsert).not.toHaveBeenCalled();
  });
  it('ignores existing JWT and cross-event uploads', async () => {
    const { db, upsert } = database();
    await registerUploadSource(db, { ...auth, type: 'jwt' }, 'race', 'QuickEvent 2.0');
    await registerUploadSource(db, auth, 'other', 'QuickEvent 2.0');
    expect(upsert).not.toHaveBeenCalled();
  });
  it('automatically discovers other authenticated IOF exporters using their creator name', async () => {
    const { db, upsert } = database();
    await registerUploadSource(db, auth, 'race', 'Other timing software');
    expect(upsert.mock.calls[0][0].create).toMatchObject({
      sourceType: 'uploader',
      name: expect.stringContaining('Other timing software'),
    });
  });
  it('registers recognized legacy uploads without requiring new metadata or active monitoring', async () => {
    const { db, upsert } = database();
    await registerUploadSource(db, auth, 'race', 'QuickEvent 2.0');
    expect(upsert.mock.calls[0][0].create.sourceId).toBe(legacySourceId('race', 'quickevent'));
    expect(z.string().uuid().safeParse(legacySourceId('race', 'quickevent')).success).toBe(true);
    expect(ingestHeartbeat).not.toHaveBeenCalled();
  });
  it('uses optional instance headers and records activity only during active monitoring', async () => {
    const { db, upsert, monitoring } = database();
    monitoring.mockResolvedValue({ until: new Date(Date.now() + 60_000) });
    await registerUploadSource(db, auth, 'race', 'QuickEvent 2.0', 'ochecklist', sourceId);
    expect(upsert.mock.calls[0][0].create).toMatchObject({ sourceType: 'ochecklist', sourceId });
    expect(ingestHeartbeat).toHaveBeenCalledOnce();
  });
});
