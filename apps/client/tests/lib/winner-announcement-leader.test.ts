import { afterEach, describe, expect, it, vi } from 'vitest';
import { coordinateWinnerAnnouncements } from '../../src/lib/winner-announcement-leader';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('winner announcement leadership', () => {
  it('recovers an expired lease in browsers without Web Locks', () => {
    vi.stubGlobal('navigator', {});
    vi.useFakeTimers();
    const key = 'ofeed:winner-announcer:event';
    localStorage.setItem(
      key,
      JSON.stringify({ owner: 'closed-tab', expires: Date.now() + 10000 })
    );
    const active = vi.fn();
    const stop = coordinateWinnerAnnouncements('event', active);
    try {
      expect(active).toHaveBeenLastCalledWith(false);
      vi.advanceTimersByTime(10000);
      expect(active).toHaveBeenLastCalledWith(true);
      stop();
      expect(localStorage.getItem(key)).toBeNull();
      expect(active).toHaveBeenLastCalledWith(false);
    } finally {
      stop();
      vi.useRealTimers();
    }
  });

  it('queues a follower and transfers ownership when the leader unmounts', async () => {
    // Model the browser lock queue shared by separate tabs.
    let queue = Promise.resolve();
    vi.stubGlobal('navigator', {
      locks: {
        request: vi.fn(
          (
            _name: string,
            options: { signal: AbortSignal },
            callback: () => Promise<void>
          ) => {
            queue = queue.then(async () => {
              if (options.signal.aborted)
                throw new DOMException('Aborted', 'AbortError');
              await callback();
            });
            return queue;
          }
        ),
      },
    });
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = coordinateWinnerAnnouncements('event', first);
    const stopSecond = coordinateWinnerAnnouncements('event', second);
    try {
      await vi.waitFor(() => expect(first).toHaveBeenLastCalledWith(true));
      expect(second).not.toHaveBeenCalledWith(true);
      stopFirst();
      await vi.waitFor(() => expect(second).toHaveBeenLastCalledWith(true));
      expect(first).toHaveBeenLastCalledWith(false);
    } finally {
      stopFirst();
      stopSecond();
    }
  });

  it('releases on pagehide and reacquires on pageshow', async () => {
    vi.stubGlobal('navigator', {
      locks: {
        request: vi.fn(
          async (
            _name: string,
            _options: unknown,
            callback: () => Promise<void>
          ) => callback()
        ),
      },
    });
    const active = vi.fn();
    const stop = coordinateWinnerAnnouncements('event', active);
    try {
      expect(active).toHaveBeenLastCalledWith(true);
      window.dispatchEvent(new Event('pagehide'));
      expect(active).toHaveBeenLastCalledWith(false);
      window.dispatchEvent(new Event('pageshow'));
      expect(active).toHaveBeenLastCalledWith(true);
    } finally {
      stop();
    }
  });
});
