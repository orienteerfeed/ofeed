import { coordinateWinnerAnnouncements } from './leader';

export interface Winner {
  eventId: string;
  classId: number;
  className: string;
  /** Class-level gender config: 'M' men, 'F' women, 'B' both */
  classSex?: 'B' | 'M' | 'F' | null | undefined;
  name: string;
}

export const WINNER_UPDATED_SUBSCRIPTION = `
  subscription WinnerUpdated($eventId: String!) {
    winnerUpdated(eventId: $eventId) {
      eventId
      classId
      className
      classSex
      name
    }
  }
`;

/**
 * Resolves the winner's gender for Czech verb inflection, best signal first:
 * 1. the class `sex` attribute (configurable per class)
 * 2. the class name prefix (D/W = women, H/M = men)
 * 3. the surname ending (Czech/Slovak feminine -ová/-á), for mixed classes
 * Unknown falls back to masculine.
 */
export const isFemaleWinner = (winner: Winner): boolean => {
  if (winner.classSex === 'F') return true;
  if (winner.classSex === 'M') return false;

  const className = winner.className.trim();
  if (!/^HDR/i.test(className)) {
    if (/^D|^[FW]\d/i.test(className)) return true;
    if (/^H|^M\d/i.test(className)) return false;
  }

  // Mixed/unconfigured class - name is the only remaining signal.
  // Server sends "lastname firstname".
  const lastname = winner.name.trim().split(/\s+/)[0] ?? '';
  return /(ová|ova|á)$/i.test(lastname);
};

const CZECH_LETTERS: Record<string, string> = {
  A: 'á',
  B: 'bé',
  C: 'cé',
  D: 'dé',
  E: 'é',
  F: 'ef',
  G: 'gé',
  H: 'há',
  I: 'í',
  J: 'jé',
  K: 'ká',
  L: 'el',
  M: 'em',
  N: 'en',
  O: 'ó',
  P: 'pé',
  Q: 'kvé',
  R: 'er',
  S: 'es',
  T: 'té',
  U: 'ú',
  V: 'vé',
  W: 'dvojité vé',
  X: 'iks',
  Y: 'ypsilon',
  Z: 'zet',
};

/**
 * Makes a class name speakable: "H45C" -> "há 45 cé", so the voice reads the
 * number as a whole and spells short letter codes; words like "Open" stay.
 */
export const speakClassName = (className: string): string =>
  (className.match(/\d+|\p{L}+/gu) ?? [className])
    .map(part =>
      // Spell codes (H, DE, HDR), keep short words like "Dět" readable.
      /^(\p{L}{1,2}|\p{Lu}{3})$/u.test(part)
        ? [...part.toUpperCase()].map(letter => CZECH_LETTERS[letter] ?? letter).join(' ')
        : part
    )
    .join(' ');

/**
 * Builds the Czech announcement, inflected by the winner's gender.
 */
export const buildAnnouncement = (winner: Winner): string =>
  `Změna pořadí v kategorii ${speakClassName(winner.className)}, do vedení se dostal${
    isFemaleWinner(winner) ? 'a' : ''
  } ${winner.name}`;

/**
 * Plays gong sound and speaks winner announcement. Returns a function that
 * cancels it if it has not finished yet.
 */
export const announceWinner = (winner: Winner): (() => void) => {
  if (!('speechSynthesis' in window)) {
    console.warn('⚠️ Speech synthesis is not supported in this browser.');
    return () => {};
  }

  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Play gong sound; announce even if autoplay blocks it
  const gongSound = new Audio(new URL('./chime.mp3', import.meta.url).href);
  gongSound
    .play()
    .catch(error => console.warn('⚠️ Error playing gong:', error))
    .finally(() => {
      if (cancelled) return;
      // After short delay, start voice announcement
      timer = setTimeout(() => {
        const message = new SpeechSynthesisUtterance(buildAnnouncement(winner));
        message.lang = 'cs-CZ'; // Czech language setting
        message.rate = 1; // Speech rate
        message.pitch = 1; // Voice pitch
        message.onerror = event => {
          // 'not-allowed': the page has had no user interaction yet.
          if (event.error !== 'canceled' && event.error !== 'interrupted')
            console.warn('⚠️ Announcement not spoken:', event.error);
        };
        speechSynthesis.speak(message);
      }, 1000); // 1 second delay after gong
    });
  return () => {
    cancelled = true;
    clearTimeout(timer);
    gongSound.pause();
  };
};

/**
 * Joins an announcer election for each eligible class. `announce` speaks only in the
 * elected tab, so call this only while sound is enabled - a muted tab must
 * not hold the election and silence the others.
 */
export const startWinnerCommentator = (
  eventId: string,
  categoryNames: readonly string[]
): { announce: (winner: Winner) => void; stop: () => void } => {
  const activeCategories = new Set<string>();
  // ponytail: never pruned, one tiny entry per announcement until stop().
  const pending = new Set<() => void>();
  const leave = [...new Set(categoryNames)].map(className =>
    coordinateWinnerAnnouncements(JSON.stringify([eventId, className]), active => {
      if (active) activeCategories.add(className);
      else activeCategories.delete(className);
    })
  );
  return {
    announce: winner => {
      if (winner.eventId === eventId && activeCategories.has(winner.className))
        pending.add(announceWinner(winner));
    },
    // Muting must also silence gongs and speech already queued.
    stop: () => {
      leave.forEach(stop => stop());
      if (pending.size === 0) return;
      pending.forEach(cancel => cancel());
      pending.clear();
      window.speechSynthesis?.cancel();
    },
  };
};
