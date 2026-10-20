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

/**
 * Builds the Czech announcement, inflected by the winner's gender.
 */
export const buildAnnouncement = (winner: Winner): string =>
  `Změna pořadí v kategorii ${winner.className}, do vedení se dostal${
    isFemaleWinner(winner) ? 'a' : ''
  } ${winner.name}`;

/**
 * Plays gong sound and speaks winner announcement
 */
export const announceWinner = (winner: Winner): void => {
  if (!('speechSynthesis' in window)) {
    console.warn('⚠️ Speech synthesis is not supported in this browser.');
    return;
  }

  // Play gong sound; announce even if autoplay blocks it
  const gongSound = new Audio(new URL('./chime.mp3', import.meta.url).href);
  gongSound
    .play()
    .catch(error => console.warn('⚠️ Error playing gong:', error))
    .finally(() => {
      // After short delay, start voice announcement
      setTimeout(() => {
        const message = new SpeechSynthesisUtterance(buildAnnouncement(winner));
        message.lang = 'cs-CZ'; // Czech language setting
        message.rate = 1; // Speech rate
        message.pitch = 1; // Voice pitch
        speechSynthesis.speak(message);
      }, 1000); // 1 second delay after gong
    });
};

/**
 * Joins the announcer election for an event. `announce` speaks only in the
 * elected tab, so call this only while sound is enabled - a muted tab must
 * not hold the election and silence the others.
 */
export const startWinnerCommentator = (
  eventId: string
): { announce: (winner: Winner) => void; stop: () => void } => {
  let isAnnouncer = false;
  const stop = coordinateWinnerAnnouncements(eventId, active => {
    isAnnouncer = active;
  });
  return {
    announce: winner => {
      if (isAnnouncer) announceWinner(winner);
    },
    stop,
  };
};
