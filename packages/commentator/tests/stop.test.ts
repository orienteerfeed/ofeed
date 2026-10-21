import { afterEach, expect, it, vi } from 'vitest';
import { startWinnerCommentator } from '../src';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('stop() silences an announcement that is already in progress', async () => {
  vi.useFakeTimers();
  const speak = vi.fn();
  const cancel = vi.fn();
  const pause = vi.fn();
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('speechSynthesis', { speak, cancel });
  vi.stubGlobal('SpeechSynthesisUtterance', class {});
  vi.stubGlobal(
    'Audio',
    class {
      play = () => Promise.resolve();
      pause = pause;
    }
  );

  const commentator = startWinnerCommentator('event');
  commentator.announce({ eventId: 'event', classId: 1, className: 'H21', name: 'Novák Jan' });
  await vi.advanceTimersByTimeAsync(0); // gong finished, speech scheduled
  commentator.stop();
  await vi.advanceTimersByTimeAsync(2000);

  expect(pause).toHaveBeenCalled();
  expect(cancel).toHaveBeenCalled();
  expect(speak).not.toHaveBeenCalled();
});
