import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listAthleteFollows,
  mutateAthleteFollow,
  saveAthleteFollow,
} from '../athlete-follows.service.js';
const auth = { isAuthenticated: true, type: 'jwt', userId: 7 } as const;
const row = {
  id: 'follow-1',
  userId: 7,
  registration: 'ABC9001',
  source: 'ORIS',
  displayName: 'Runner Test',
  pausedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
function database() {
  const db = {
    user: { findFirst: vi.fn().mockResolvedValue({ id: 7 }) },
    $queryRaw: vi.fn().mockResolvedValue([{ deletedAt: null }]),
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
    athleteFollow: {
      findMany: vi.fn().mockResolvedValue([row]),
      findFirst: vi.fn().mockResolvedValue(row),
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      upsert: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    userNotification: { createMany: vi.fn() },
  };
  db.$transaction.mockImplementation(async (callback) => callback(db));
  return db;
}
let db: ReturnType<typeof database>;
beforeEach(() => {
  db = database();
});
describe('profile registration follows', () => {
  it('lists only the caller preferences with persisted paused state', async () => {
    const result = await listAthleteFollows(db as never, auth);
    expect(result).toMatchObject([
      { id: 'follow-1', registration: 'ABC9001', source: 'ORIS', pausedAt: null },
    ]);
    expect(db.athleteFollow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 7 } }),
    );
  });
  it.each([
    { isAuthenticated: false, type: null },
    { isAuthenticated: true, type: 'eventBasic', userId: 7 },
  ])('rejects non-account identity %j', async (actor) => {
    await expect(
      mutateAthleteFollow(db as never, actor as never, { id: row.id, paused: true }),
    ).rejects.toThrow('JWT');
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('pauses without generating messages and resumes without history replay', async () => {
    await mutateAthleteFollow(db as never, auth, { id: row.id, paused: true });
    expect(db.athleteFollow.update).toHaveBeenCalledWith({
      where: { id: row.id },
      data: { pausedAt: expect.any(Date) },
    });
    db.athleteFollow.findFirst.mockResolvedValue({ ...row, pausedAt: new Date() } as never);
    await mutateAthleteFollow(db as never, auth, { id: row.id, paused: false });
    expect(db.athleteFollow.update).toHaveBeenLastCalledWith({
      where: { id: row.id },
      data: { pausedAt: null },
    });
    expect(db.userNotification.createMany).not.toHaveBeenCalled();
  });
  it('scopes pause/cancel to the authenticated user and makes removal idempotent', async () => {
    db.athleteFollow.findFirst.mockResolvedValue(null);
    await expect(
      mutateAthleteFollow(db as never, auth, { id: 'foreign', paused: true }),
    ).rejects.toThrow('unavailable');
    await expect(mutateAthleteFollow(db as never, auth, { id: 'foreign' }, true)).resolves.toBe(
      true,
    );
    expect(db.athleteFollow.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign', userId: 7 },
    });
    expect(db.athleteFollow.deleteMany).not.toHaveBeenCalled();
  });
  it('cancels the registration identity and explicit event selections together', async () => {
    await mutateAthleteFollow(db as never, auth, { id: row.id }, true);
    expect(db.$executeRaw).toHaveBeenCalledOnce();
    expect(db.athleteFollow.deleteMany).toHaveBeenCalledWith({
      where: { userId: 7, registration: 'ABC9001', source: 'ORIS' },
    });
  });
  it('normalizes registration, separates undeclared issuers, and bounds new follows', async () => {
    const competitor = {
      registration: ' abc9001 ',
      source: null,
      firstname: 'Test',
      lastname: 'Runner',
    } as const;
    await saveAthleteFollow(db as never, 7, competitor);
    expect(db.athleteFollow.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_source_registration: { userId: 7, registration: 'ABC9001', source: 'LOCAL' },
        },
      }),
    );
    db.athleteFollow.count.mockResolvedValue(100);
    await expect(saveAthleteFollow(db as never, 7, competitor)).rejects.toThrow('100');
    db.athleteFollow.findUnique.mockResolvedValue(row as never);
    await expect(saveAthleteFollow(db as never, 7, competitor)).resolves.toBeUndefined();
  });
});
