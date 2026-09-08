import { gql } from '@apollo/client';
import { useSubscription } from '@apollo/client/react';
import { useEffect } from 'react';
import { getNotificationSettings } from '../../lib/notificationSettings';

// Types
interface Winner {
  eventId: string;
  classId: number;
  className: string;
  name: string;
}

interface WinnerUpdatedData {
  winnerUpdated: Winner;
}

interface WinnerNotificationProps {
  eventId: string;
}

interface NotificationSettings {
  general: {
    push: boolean;
    sound: boolean;
  };
}

// GraphQL Subscription
const WINNER_UPDATED = gql`
  subscription WinnerUpdated($eventId: String!) {
    winnerUpdated(eventId: $eventId) {
      eventId
      classId
      className
      name
    }
  }
`;

export const WinnerNotification: React.FC<WinnerNotificationProps> = ({
  eventId,
}) => {
  const { data, error } = useSubscription<WinnerUpdatedData>(WINNER_UPDATED, {
    variables: { eventId },
    skip: !eventId,
  });

  // Handle winner updates
  useEffect(() => {
    if (data?.winnerUpdated) {
      // Load latest settings
      const settings: NotificationSettings = getNotificationSettings();
      // Respect user settings
      if (settings.general.push) {
        sendNotification(data.winnerUpdated);
      }
      // Only the visible tab announces, so background tabs don't talk over it
      if (settings.general.sound && !document.hidden) {
        playGongAndSpeak(data.winnerUpdated);
      }
    }
  }, [data]);

  if (error) {
    console.error('Subscription error:', error);
    return null;
  }

  return null; // No UI rendering needed
};

/**
 * Sends a push notification using the Web Notifications API
 */
const sendNotification = (winner: Winner): void => {
  if (!('Notification' in window)) {
    console.warn('This browser does not support system notifications.');
    return;
  }

  const options: NotificationOptions = {
    body: `${winner.name} is now leading ${winner.className}.`,
  };
  const title = '🏆 New Leader!';

  if (Notification.permission === 'granted') {
    new Notification(title, options);
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        new Notification(title, options);
      }
    });
  }
};

/**
 * Plays gong sound and speaks winner announcement
 */
const playGongAndSpeak = (winner: Winner): void => {
  if (!('speechSynthesis' in window)) {
    console.warn('⚠️ Speech synthesis is not supported in this browser.');
    return;
  }

  // Play gong sound; announce even if autoplay blocks it
  const gongSound = new Audio('/sounds/chime.mp3');
  gongSound
    .play()
    .catch(error => console.warn('⚠️ Error playing gong:', error))
    .finally(() => {
      // After short delay, start voice announcement
      setTimeout(() => {
        const message = new SpeechSynthesisUtterance(
          `Změna pořadí v kategorii ${winner.className}, do vedení se dostal ${winner.name}`
        );
        message.lang = 'cs-CZ'; // Czech language setting
        message.rate = 1; // Speech rate
        message.pitch = 1; // Voice pitch
        speechSynthesis.speak(message);
      }, 1000); // 1 second delay after gong
    });
};
