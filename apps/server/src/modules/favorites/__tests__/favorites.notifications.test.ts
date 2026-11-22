import { describe, expect, it, vi } from 'vitest';
import { favoriteAudience } from '../favorites.audience.js';
vi.mock('../favorites.audience.js', () => ({ favoriteAudience: vi.fn() }));
import {
  detectFavoriteMilestones,
  enqueueFavoriteChanges,
  type WatchedCompetitor,
} from '../favorites.notifications.js';

function runner(overrides: Partial<WatchedCompetitor> = {}): WatchedCompetitor {
  return {
    id: 1,
    firstname: 'Test',
    lastname: 'Runner',
    status: 'Inactive',
    startTime: new Date('2026-11-13T10:00:00Z'),
    finishTime: null,
    time: null,
    favorites: [{ userId: 7 }, { userId: 8 }],
    punches: [],
    splits: [],
    class: {
      eventId: 'event',
      resultListMode: 'Default',
      event: { name: 'Race', published: true },
      course: { courseControls: [{ control: { code: '31' } }] },
    },
    ...overrides,
  };
}
const kinds = (before: WatchedCompetitor, after: WatchedCompetitor) =>
  detectFavoriteMilestones(before, after).map((change) => change.kind);

describe('favorite milestones', () => {
  it('respects categories configured without result times', () => {
    const before = runner({
      status: 'Active',
      class: { ...runner().class, resultListMode: 'UnorderedNoTimes' },
    });
    expect(
      detectFavoriteMilestones(
        before,
        runner({ ...before, time: 300, splits: [{ controlCode: 31, time: 60 }] }),
      ),
    ).toEqual([]);
  });
  it('ignores unchanged snapshots and never labels a scheduled start as observed', () => {
    expect(kinds(runner(), runner())).toEqual([]);
    const scheduled = runner({ startTime: new Date('2026-11-13T10:05:00Z') });
    expect(kinds(runner(), scheduled)).toEqual(['COMPETITOR_RESULT_CHANGED']);
    expect(
      kinds(
        runner({ status: 'NotCompeting' }),
        runner({ status: 'NotCompeting', punches: [{ controlCode: 0, appliedSource: 'SRR' }] }),
      ),
    ).toContain('COMPETITOR_STARTED');
  });
  it('observes actual start punches even when the result status remains inactive', () => {
    expect(
      kinds(runner(), runner({ punches: [{ controlCode: 0, appliedSource: 'SRR' }] })),
    ).toEqual(['COMPETITOR_STARTED']);
  });
  it('includes public radios and corrections, without disclosing non-radio controls', () => {
    const before = runner({ status: 'Active' });
    const after = runner({
      status: 'Active',
      splits: [
        { controlCode: 31, time: 300 },
        { controlCode: 32, time: 400 },
      ],
    });
    expect(detectFavoriteMilestones(before, after)).toEqual([
      { kind: 'COMPETITOR_RADIO', controlCode: 31, splitTime: 300 },
    ]);
    expect(
      detectFavoriteMilestones(
        after,
        runner({ ...after, splits: [{ controlCode: 31, time: 299 }] }),
      ),
    ).toEqual([{ kind: 'COMPETITOR_RADIO', controlCode: 31, splitTime: 299 }]);
  });
  it('does not invent chip readout from an imported OK status', () => {
    const before = runner({
      status: 'Finished',
      time: 600,
      finishTime: new Date('2026-11-13T10:10:00Z'),
    });
    expect(kinds(before, runner({ ...before, status: 'OK' }))).toEqual([
      'COMPETITOR_RESULT_CHANGED',
    ]);
    expect(
      kinds(
        before,
        runner({
          ...before,
          status: 'OK',
          punches: [{ controlCode: -1, appliedSource: 'READOUT' }],
        }),
      ),
    ).toEqual(['COMPETITOR_READOUT']);
  });
  it('reports a finish and later timing/status corrections', () => {
    const running = runner({ status: 'Active' });
    const finished = runner({ status: 'Finished', time: 600 });
    expect(kinds(running, finished)).toEqual(['COMPETITOR_FINISHED']);
    expect(kinds(finished, runner({ ...finished, time: 601 }))).toEqual([
      'COMPETITOR_RESULT_CHANGED',
    ]);
  });
  it('handles repeated controls deterministically and records removed public times', () => {
    const before = runner({ status: 'Active', splits: [{ controlCode: 31, time: 300 }] });
    const after = runner({
      ...before,
      splits: [
        { controlCode: 31, time: 300 },
        { controlCode: 31, time: 900 },
      ],
    });
    expect(detectFavoriteMilestones(before, after)).toEqual([
      { kind: 'COMPETITOR_RADIO', controlCode: 31, splitTime: 900 },
    ]);
    expect(detectFavoriteMilestones(after, before)).toEqual([
      { kind: 'COMPETITOR_RADIO', controlCode: 31, splitTime: null },
    ]);
  });
});

describe('transactional fan-out', () => {
  it('rechecks the active audience under the recipient lock before inserting messages', async () => {
    const tx = db([runner({ status: 'Active', favorites: [{ userId: 7 }] })]);
    vi.mocked(favoriteAudience)
      .mockReset()
      .mockResolvedValueOnce([{ competitorId: 1, userId: 7, athleteFollowId: 'follow' }])
      .mockResolvedValueOnce([]);
    await enqueueFavoriteChanges(tx as never, 'event', [runner()]);
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.userNotification.createMany).not.toHaveBeenCalled();
  });
  function db(after: WatchedCompetitor[]) {
    const tx = {
      competitor: { findMany: vi.fn().mockResolvedValue(after) },
      $queryRaw: vi.fn().mockResolvedValue([{ id: 7 }]),
      userNotification: { createMany: vi.fn() },
    };
    vi.mocked(favoriteAudience).mockResolvedValue(
      after.flatMap((row) =>
        row.favorites.map((member) => ({
          competitorId: row.id,
          userId: member.userId,
          athleteFollowId: member.athleteFollowId ?? null,
        })),
      ),
    );
    return tx;
  }
  it('only delivers to users who followed before and still follow after the write', async () => {
    const tx = db([runner({ status: 'Active', favorites: [{ userId: 7 }, { userId: 9 }] })]);
    await enqueueFavoriteChanges(tx as never, 'event', [runner()]);
    expect(tx.userNotification.createMany).toHaveBeenCalledTimes(1);
    expect(tx.userNotification.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ userId: 7, competitorId: 1, kind: 'COMPETITOR_STARTED' })],
      skipDuplicates: true,
    });
  });
  it('does not replay history on initial subscription or publish unpublished event changes', async () => {
    const tx = db([runner({ status: 'Active' })]);
    await enqueueFavoriteChanges(tx as never, 'event', []);
    expect(tx.competitor.findMany).not.toHaveBeenCalled();
    tx.competitor.findMany.mockResolvedValue([
      runner({
        status: 'Active',
        class: { ...runner().class, event: { name: 'Race', published: false } },
      }),
    ]);
    await enqueueFavoriteChanges(tx as never, 'event', [runner()]);
    expect(tx.userNotification.createMany).not.toHaveBeenCalled();
  });
  it('serializes recipient erasure and skips deleted accounts', async () => {
    const tx = db([runner({ status: 'Active' })]);
    tx.$queryRaw.mockResolvedValue([]);
    await enqueueFavoriteChanges(tx as never, 'event', [runner()]);
    expect(tx.userNotification.createMany).not.toHaveBeenCalled();
  });
});
