import { afterEach, expect, it, vi } from 'vitest';
import { startWinnerCommentator, type Winner } from '../src';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

it.each(['locks', 'lease'])(
  'announces disjoint classes and deduplicates overlapping tabs with %s',
  async mode => {
    const queues = new Map<string, Promise<void>>();
    vi.stubGlobal(
      'navigator',
      mode === 'lease'
        ? {}
        : {
            locks: {
              request: (
                key: string,
                options: { signal: AbortSignal },
                callback: () => Promise<void>
              ) => {
                const queue = (queues.get(key) ?? Promise.resolve()).then(async () => {
                  if (!options.signal.aborted) await callback();
                });
                queues.set(key, queue);
                return queue;
              },
            },
          }
    );
    const play = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      'Audio',
      class {
        play = play;
        pause = vi.fn();
      }
    );
    vi.stubGlobal('speechSynthesis', { speak: vi.fn(), cancel: vi.fn() });
    const first = startWinnerCommentator('event', ['H21']);
    const second = startWinnerCommentator('event', ['D21']);
    const overlapping = startWinnerCommentator('event', ['H21', 'D21']);
    // Allow the Web Locks callbacks to acquire their per-class locks.
    await Promise.resolve();
    const men: Winner = { eventId: 'event', classId: 1, className: 'H21', name: 'Novák Jan' };
    const women: Winner = { eventId: 'event', classId: 2, className: 'D21', name: 'Nováková Jana' };
    try {
      for (const commentator of [first, second, overlapping]) {
        commentator.announce(men);
        commentator.announce(women);
      }
      expect(play).toHaveBeenCalledTimes(2);
      second.announce({ ...women, eventId: 'other-event' });
      expect(play).toHaveBeenCalledTimes(2);
    } finally {
      first.stop();
      second.stop();
      overlapping.stop();
    }
  }
);
