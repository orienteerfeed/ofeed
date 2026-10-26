import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildWsClientOptions } from '@/providers/apolloClient';

type EventListeners = NonNullable<
  ReturnType<typeof buildWsClientOptions>['on']
>;

describe('buildWsClientOptions (resilient subscriptions)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reconnects indefinitely and pings to keep the socket alive', () => {
    const options = buildWsClientOptions(
      'wss://example.test/graphql',
      () => null
    );

    // A finite retry cap is what makes a backgrounded mobile tab error out:
    // the attempts are exhausted while the device sleeps and never recover.
    expect(options.retryAttempts).toBe(Number.POSITIVE_INFINITY);
    expect(options.keepAlive).toBeGreaterThan(0);
    expect(options.lazy).toBe(true);
  });

  it('retries on every non-fatal close event', () => {
    const options = buildWsClientOptions(
      'wss://example.test/graphql',
      () => null
    );

    expect(options.shouldRetry?.({ code: 1006 })).toBe(true);
  });

  it('force-closes a stale socket when a sent ping gets no pong', () => {
    const options = buildWsClientOptions(
      'wss://example.test/graphql',
      () => null
    );
    const on = options.on as EventListeners;

    const close = vi.fn();
    const socket = { readyState: 1, close } as unknown as WebSocket;

    on.connected?.(socket, undefined, false);
    // received === false means *we* sent the ping and now await the pong.
    on.ping?.(false, undefined);

    vi.advanceTimersByTime(5_000);

    expect(close).toHaveBeenCalledWith(4408, 'Request Timeout');
  });

  it('keeps a healthy socket open when the pong arrives in time', () => {
    const options = buildWsClientOptions(
      'wss://example.test/graphql',
      () => null
    );
    const on = options.on as EventListeners;

    const close = vi.fn();
    const socket = { readyState: 1, close } as unknown as WebSocket;

    on.connected?.(socket, undefined, false);
    on.ping?.(false, undefined);
    // received === true means the server answered our ping.
    on.pong?.(true, undefined);

    vi.advanceTimersByTime(5_000);

    expect(close).not.toHaveBeenCalled();
  });

  it('passes the bearer token through connectionParams when present', () => {
    const options = buildWsClientOptions(
      'wss://example.test/graphql',
      () => 'jwt-token'
    );

    const params =
      typeof options.connectionParams === 'function'
        ? options.connectionParams()
        : options.connectionParams;

    expect(params).toEqual({ Authorization: 'Bearer jwt-token' });
  });
});

it('awaits token renewal after a retryable authentication close before resubscribing', async () => {
  let token = 'expired';
  let finish!: () => void;
  const renew = vi.fn(
    () =>
      new Promise<string>(resolve => {
        finish = () => {
          token = 'renewed';
          resolve(token);
        };
      })
  );
  const options = buildWsClientOptions(
    'wss://example.test/graphql',
    () => token,
    renew
  );
  options.on?.closed?.({ code: 4403 });
  const params = (options.connectionParams as () => Promise<unknown>)();
  expect(renew).toHaveBeenCalledWith(true, 'expired');
  finish();
  expect(await params).toEqual({ Authorization: 'Bearer renewed' });
});

it('preserves the expired credential for a retryable server rejection when renewal is temporarily unavailable', async () => {
  const renew = vi.fn().mockRejectedValue(new TypeError('offline'));
  const options = buildWsClientOptions(
    'wss://example.test/graphql',
    () => 'expired',
    renew
  );
  options.on?.closed?.({ code: 4403 });
  await expect(
    (options.connectionParams as () => Promise<unknown>)()
  ).resolves.toEqual({ Authorization: 'Bearer expired' });
  await (options.connectionParams as () => Promise<unknown>)();
  expect(renew).toHaveBeenLastCalledWith(true, 'expired');
});
