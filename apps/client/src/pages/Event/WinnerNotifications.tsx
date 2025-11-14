import { gql } from '@apollo/client';
import { useSubscription } from '@apollo/client/react';
import { useEffect, useState } from 'react';
import { getNotificationSettings } from '../../lib/notificationSettings';

// Types
interface Winner {
  eventId: string;
  classId: string;
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

  const [isMainTab, setIsMainTab] = useState<boolean>(false);

  // Handle tab storage for sound notifications
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'mainTab') {
        setIsMainTab(
          localStorage.getItem('mainTab') === sessionStorage.getItem('myTab')
        );
      }
    };

    // Each tab gets a unique ID
    sessionStorage.setItem('myTab', Date.now().toString());

    // First tab that sets "mainTab" becomes the main tab
    if (!localStorage.getItem('mainTab')) {
      localStorage.setItem('mainTab', sessionStorage.getItem('myTab')!);
      setIsMainTab(true);
    }

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Handle winner updates
  useEffect(() => {
    if (data?.winnerUpdated) {
      // Load latest settings
      const settings: NotificationSettings = getNotificationSettings();
      // Respect user settings
      if (settings.general.push) {
        sendNotification(data.winnerUpdated);
      }
      if (settings.general.sound && isMainTab) {
        playGongAndSpeak(data.winnerUpdated);
      }
    }
  }, [data, isMainTab]);

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

  if (Notification.permission === 'granted') {
    console.log(winner.name);
    console.log(Notification.permission);
    new Notification('🏆 New Winner!');
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        new Notification('🏆 New Winner!', {
          body: `🎉 ${winner.name} just won ${winner.className}!`,
        });
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

  // Play gong sound
  const gongSound = new Audio('/sounds/chime.mp3');
  gongSound
    .play()
    .then(() => {
      console.log('🔔 Gong played');

      // After short delay, start voice announcement
      setTimeout(() => {
        const message = new SpeechSynthesisUtterance(
          `Změna pořadí v kategorii ${winner.className}, do vedení se dostal ${winner.name}`
        );
        message.lang = 'cs-CZ'; // Czech language setting
        message.rate = 1; // Speech rate
        message.pitch = 1; // Voice pitch
        speechSynthesis.speak(message);
        console.log('🔊 Winner announcement played');
      }, 1000); // 1 second delay after gong
    })
    .catch(error => console.error('⚠️ Error playing gong:', error));
};
