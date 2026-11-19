import { describe, expect, it, vi, beforeEach } from 'vitest';
import { deleteClassForGraphQL } from '../class.service.js';
import { publishClassesUpdated } from '../../../lib/pubsub.js';

vi.mock('../../../lib/pubsub.js', () => ({ publishClassesUpdated: vi.fn() }));
const auth = { isAuthenticated: true, type: 'jwt', userId: 7 } as const;

function database() {
  const calls: string[] = [];
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 42 }]),
    punch: {
      deleteMany: vi.fn(async () => {
        calls.push('punch');
      }),
    },
    protocol: {
      deleteMany: vi.fn(async () => {
        calls.push('protocol');
      }),
    },
    split: {
      deleteMany: vi.fn(async () => {
        calls.push('split');
      }),
    },
    entryItem: {
      deleteMany: vi.fn(async () => {
        calls.push('entryItem');
      }),
    },
    competitor: {
      deleteMany: vi.fn(async () => {
        calls.push('competitor');
      }),
      updateMany: vi.fn(async () => {
        calls.push('detachTeam');
      }),
    },
    team: {
      deleteMany: vi.fn(async () => {
        calls.push('team');
      }),
    },
    startSlotVacancy: {
      deleteMany: vi.fn(async () => {
        calls.push('vacancy');
      }),
    },
    class: {
      delete: vi.fn(async () => {
        calls.push('class');
      }),
    },
  };
  const db = {
    event: { findUnique: vi.fn().mockResolvedValue({ authorId: 7 }) },
    user: { findUnique: vi.fn().mockResolvedValue({ role: 'USER' }) },
    $transaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) => {
      const result = await work(tx);
      calls.push('commit');
      return result;
    }),
  };
  return { db, tx, calls };
}
beforeEach(() => vi.clearAllMocks());

describe('deleteClassForGraphQL', () => {
  it('deletes only scoped dependants in FK order and publishes after commit', async () => {
    const { db, tx, calls } = database();
    vi.mocked(publishClassesUpdated).mockImplementationOnce(() => {
      calls.push('publish');
    });
    await expect(deleteClassForGraphQL(db as never, auth, 'event-1', 42)).resolves.toEqual({
      message: 'Class and dependent data deleted',
    });
    expect(calls).toEqual([
      'punch',
      'protocol',
      'split',
      'entryItem',
      'competitor',
      'detachTeam',
      'team',
      'vacancy',
      'class',
      'commit',
      'publish',
    ]);
    expect(tx.$queryRaw).toHaveBeenNthCalledWith(1, expect.anything(), 'event-1');
    expect(tx.$queryRaw).toHaveBeenNthCalledWith(2, expect.anything(), 42, 'event-1');
    expect(tx.class.delete).toHaveBeenCalledWith({ where: { id: 42, eventId: 'event-1' } });
    const scope = { classId: 42, class: { eventId: 'event-1' } };
    expect(tx.entryItem.deleteMany).toHaveBeenCalledWith({
      where: { ...scope, entry: { eventId: 'event-1' } },
    });
    expect(tx.punch.deleteMany).toHaveBeenCalledWith({
      where: { eventId: 'event-1', OR: [{ competitor: scope }, { split: { competitor: scope } }] },
    });
    expect(tx.protocol.deleteMany).toHaveBeenCalledWith({
      where: { eventId: 'event-1', competitor: scope },
    });
    expect(tx.competitor.updateMany).toHaveBeenCalledWith({
      where: { team: scope },
      data: { teamId: null },
    });
  });
  it('allows a JWT admin of another event', async () => {
    const { db } = database();
    db.event.findUnique.mockResolvedValue({ authorId: 99 });
    db.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
    await deleteClassForGraphQL(db as never, auth, 'event-1', 42);
    expect(db.$transaction).toHaveBeenCalledOnce();
  });
  it.each([0, -1, 1.5])('rejects invalid class ID %s before writes', async (id) => {
    const { db } = database();
    await expect(deleteClassForGraphQL(db as never, auth, 'event-1', id)).rejects.toThrow(
      'positive class ID',
    );
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it.each([
    { isAuthenticated: false },
    { ...auth, userId: 99 },
    { isAuthenticated: true, type: 'eventBasic', eventId: 'other' },
  ])('rejects unauthorised callers before starting destructive work', async (caller) => {
    const { db } = database();
    await expect(
      deleteClassForGraphQL(db as never, caller as never, 'event-1', 42),
    ).rejects.toThrow();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('rejects a missing class or class in another event before deletion', async () => {
    const { db, tx } = database();
    tx.$queryRaw.mockResolvedValueOnce([{ id: 'event-1' }]).mockResolvedValueOnce([]);
    await expect(deleteClassForGraphQL(db as never, auth, 'event-1', 42)).rejects.toThrow(
      'Class not found for this event',
    );
    expect(tx.punch.deleteMany).not.toHaveBeenCalled();
    expect(publishClassesUpdated).not.toHaveBeenCalled();
  });
  it('propagates transaction failure without publishing a deletion', async () => {
    const { db, tx, calls } = database();
    tx.class.delete.mockRejectedValueOnce(new Error('foreign key conflict') as never);
    await expect(deleteClassForGraphQL(db as never, auth, 'event-1', 42)).rejects.toThrow(
      'foreign key conflict',
    );
    expect(calls).not.toContain('commit');
    expect(publishClassesUpdated).not.toHaveBeenCalled();
  });
});
