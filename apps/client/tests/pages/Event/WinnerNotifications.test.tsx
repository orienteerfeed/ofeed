import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WinnerNotification } from '../../../src/pages/Event/WinnerNotifications';

const { subscription } = vi.hoisted(() => ({ subscription: vi.fn() }));
vi.mock('@apollo/client/react', () => ({ useSubscription: subscription }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('WinnerNotification sound', () => {
  it('announces in the background and only in the elected tab', async () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const play = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      'Audio',
      vi.fn(function () {
        return { play, pause: vi.fn() };
      })
    );
    vi.stubGlobal('speechSynthesis', { speak: vi.fn(), cancel: vi.fn() });
    // The first request owns the lock; the second waits for ownership.
    let owner: (() => Promise<void> | void) | undefined;
    vi.stubGlobal('navigator', {
      locks: {
        request: vi.fn(
          (
            _key: string,
            _options: unknown,
            callback: () => Promise<void> | void
          ) => {
            if (!owner) {
              owner = callback;
              return Promise.resolve(callback());
            }
            return new Promise(() => {});
          }
        ),
      },
    });
    localStorage.setItem(
      'notifications',
      JSON.stringify({ general: { sound: true, push: false } })
    );
    subscription.mockReturnValue({ data: undefined });
    const first = render(
      <WinnerNotification eventId="event" categoryNames={['D21']} />
    );
    const second = render(
      <WinnerNotification eventId="event" categoryNames={['D21']} />
    );
    subscription.mockReturnValue({
      data: {
        winnerUpdated: {
          eventId: 'event',
          classId: 1,
          className: 'D21',
          classSex: 'F',
          name: 'Nováková Jana',
        },
      },
    });
    // Keep the announcement timer pending so it cannot outlive this test.
    vi.useFakeTimers();
    try {
      await act(async () => {
        first.rerender(
          <WinnerNotification eventId="event" categoryNames={['D21']} />
        );
        second.rerender(
          <WinnerNotification eventId="event" categoryNames={['D21']} />
        );
      });
      expect(play).toHaveBeenCalledTimes(1);
    } finally {
      first.unmount();
      second.unmount();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('keeps a muted tab out of the announcer election', () => {
    const request = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal('navigator', { locks: { request } });
    localStorage.setItem(
      'notifications',
      JSON.stringify({ general: { sound: false, push: false } })
    );
    subscription.mockReturnValue({ data: undefined });
    const view = render(
      <WinnerNotification eventId="event" categoryNames={['D21']} />
    );
    try {
      expect(request).not.toHaveBeenCalled();
    } finally {
      view.unmount();
    }
  });
});
