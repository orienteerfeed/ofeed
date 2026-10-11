import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  Observable,
} from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { act, renderHook } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type LiveFeedRow, rankFeedRows } from '@/pages/Event/live-feed.utils';
import { useLiveResultFeed } from '@/pages/Event/useLiveResultFeed';

const row = (
  id: number,
  overrides: Partial<LiveFeedRow> = {}
): LiveFeedRow & { __typename: 'Competitor' } => ({
  __typename: 'Competitor',
  id,
  firstname: 'Jan',
  lastname: `Runner ${id}`,
  status: 'OK',
  time: id * 100,
  updatedAt: '2026-10-11T10:00:00Z',
  class: { id: 1, name: 'H21' },
  ...overrides,
});

describe('useLiveResultFeed', () => {
  let client: ApolloClient;
  let requests: Array<{
    respond: (rows: LiveFeedRow[]) => void;
    fail: (error: Error) => void;
  }>;
  let publish: (row: LiveFeedRow) => void;
  let subscriptionClosed: boolean;

  beforeEach(() => {
    vi.useFakeTimers();
    requests = [];
    subscriptionClosed = false;
    client = new ApolloClient({
      cache: new InMemoryCache(),
      link: new ApolloLink(
        operation =>
          new Observable(observer => {
            if (operation.operationName === 'CompetitorUpdatedFeed') {
              publish = competitorUpdated =>
                observer.next({ data: { competitorUpdated } });
              return () => {
                subscriptionClosed = true;
              };
            }
            requests.push({
              respond: resultFeedByEvent => {
                observer.next({ data: { resultFeedByEvent } });
                observer.complete();
              },
              fail: error => observer.error(error),
            });
            return undefined;
          })
      ),
    });
  });

  afterEach(() => {
    client.stop();
    vi.useRealTimers();
  });

  const wrapper = ({ children }: PropsWithChildren) => (
    <ApolloProvider client={client}>{children}</ApolloProvider>
  );

  const respond = async (rows: LiveFeedRow[]) => {
    await act(async () => {
      requests.at(-1)!.respond(rows);
    });
  };
  const update = (value: LiveFeedRow) => act(() => publish(value));
  const advance = async (ms: number) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  };

  it('removes invalidated results immediately and recomputes the remaining ranks', async () => {
    const { result } = renderHook(() => useLiveResultFeed('event-1'), {
      wrapper,
    });
    await respond([row(1), row(2)]);
    expect(rankFeedRows([...result.current.rows.values()], false).get(2)).toBe(
      2
    );

    update(row(1, { status: 'Active', updatedAt: '2026-10-11T10:01:00Z' }));

    expect([...result.current.rows.keys()]).toEqual([2]);
    expect(result.current.highlighted.has(1)).toBe(false);
    expect(rankFeedRows([...result.current.rows.values()], false).get(2)).toBe(
      1
    );
  });

  it('reconciles deleted rows on polling, including an empty snapshot', async () => {
    const { result } = renderHook(() => useLiveResultFeed('event-1'), {
      wrapper,
    });
    await respond([row(1), row(2)]);
    await advance(60000);
    await respond([row(2)]);
    expect([...result.current.rows.keys()]).toEqual([2]);

    await advance(60000);
    await respond([]);
    expect(result.current.rows.size).toBe(0);
  });

  it('preserves new results, corrections and invalidations received during a request', async () => {
    const { result } = renderHook(() => useLiveResultFeed('event-1'), {
      wrapper,
    });
    await respond([row(1), row(2), row(4)]);
    await advance(60000);
    const updatedAt = '2026-10-11T10:01:00Z';
    update(row(1, { status: 'DidNotStart', updatedAt }));
    update(row(2, { time: 50, updatedAt }));
    update(row(3, { updatedAt }));
    // The older snapshot still includes runner 1, omits runner 3 and has the
    // previous time for runner 2. Runner 4 was deleted before the request.
    await respond([row(1), row(2)]);

    expect([...result.current.rows.keys()].sort()).toEqual([2, 3]);
    expect(result.current.rows.get(2)?.time).toBe(50);
    // A subsequent authoritative snapshot can remove the live additions too.
    await advance(60000);
    await respond([]);
    expect(result.current.rows.size).toBe(0);
  });

  it('preserves live updates received before the initial snapshot completes', async () => {
    const { result } = renderHook(() => useLiveResultFeed('event-1'), {
      wrapper,
    });
    update(row(1));
    await respond([]);
    expect(result.current.rows.has(1)).toBe(true);
  });

  it('does not overwrite a newer snapshot row with an older subscription message', async () => {
    const { result } = renderHook(() => useLiveResultFeed('event-1'), {
      wrapper,
    });
    await respond([row(1, { time: 42, updatedAt: '2026-10-11T10:02:00Z' })]);
    update(row(1, { status: 'Active', updatedAt: '2026-10-11T10:01:00Z' }));
    expect(result.current.rows.get(1)?.time).toBe(42);
  });

  it('expires highlights independently for consecutive competitors', async () => {
    const { result } = renderHook(() => useLiveResultFeed('event-1'), {
      wrapper,
    });
    await respond([]);
    update(row(1));
    await advance(2000);
    update(row(2));
    expect([...result.current.highlighted]).toEqual([1, 2]);

    await advance(8000);
    expect([...result.current.highlighted]).toEqual([2]);
    await advance(2000);
    expect(result.current.highlighted.size).toBe(0);
  });

  it('extends only the updated competitor highlight', async () => {
    const { result } = renderHook(() => useLiveResultFeed('event-1'), {
      wrapper,
    });
    await respond([]);
    update(row(1));
    await advance(5000);
    update(row(1, { updatedAt: '2026-10-11T10:01:00Z' }));
    await advance(5000);
    expect(result.current.highlighted.has(1)).toBe(true);
    await advance(5000);
    expect(result.current.highlighted.size).toBe(0);
  });

  it('keeps results on a failed poll and reconciles them after recovery', async () => {
    const { result } = renderHook(() => useLiveResultFeed('event-1'), {
      wrapper,
    });
    await respond([row(1)]);
    await advance(60000);
    await act(async () => {
      requests.at(-1)!.fail(new Error('offline'));
    });
    expect(result.current.rows.has(1)).toBe(true);
    expect(result.current.error?.message).toBe('offline');
    await advance(60000);
    await respond([]);
    expect(result.current.rows.size).toBe(0);
    expect(result.current.error).toBeUndefined();
  });

  it('does not overlap requests and cleans up polling, subscription and highlights', async () => {
    const { unmount } = renderHook(() => useLiveResultFeed('event-1'), {
      wrapper,
    });
    await advance(120000);
    expect(requests).toHaveLength(1);
    await respond([]);
    update(row(1));
    unmount();
    await advance(60000);
    expect(requests).toHaveLength(1);
    expect(subscriptionClosed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
