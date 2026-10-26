import { gql } from '@apollo/client';
import { useSubscription } from '@apollo/client/react';
import {
  startWinnerCommentator,
  WINNER_UPDATED_SUBSCRIPTION,
  type Winner,
} from '@repo/commentator';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  getNotificationSettings,
  subscribeNotificationSettings,
} from '../../lib/notificationSettings';

// Types
interface WinnerUpdatedData {
  winnerUpdated: Winner;
}

interface WinnerNotificationProps {
  eventId: string;
  categoryNames: readonly string[];
}

const WINNER_UPDATED = gql(WINNER_UPDATED_SUBSCRIPTION);

export const WinnerNotification: React.FC<WinnerNotificationProps> = ({
  eventId,
  categoryNames,
}) => {
  const sound = useSyncExternalStore(
    subscribeNotificationSettings,
    () => getNotificationSettings().general.sound
  );
  const commentator = useRef<ReturnType<typeof startWinnerCommentator> | null>(
    null
  );
  const categoryKey = JSON.stringify([...new Set(categoryNames)].sort());
  // Only tabs with sound on join the election, so a muted tab can't win it.
  useEffect(() => {
    if (!sound || !eventId) return;
    const current = startWinnerCommentator(
      eventId,
      JSON.parse(categoryKey) as string[]
    );
    commentator.current = current;
    return () => {
      current.stop();
      commentator.current = null;
    };
  }, [eventId, sound, categoryKey]);

  const { data, error } = useSubscription<WinnerUpdatedData>(WINNER_UPDATED, {
    variables: { eventId },
    skip: !eventId,
  });

  // Handle winner updates
  useEffect(() => {
    if (data?.winnerUpdated) {
      // Respect user settings
      if (getNotificationSettings().general.push) {
        sendNotification(data.winnerUpdated);
      }
      // One eligible tab per class announces, including in the background.
      commentator.current?.announce(data.winnerUpdated);
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
