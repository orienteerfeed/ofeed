import { Notification, NotificationsResponse } from '@/types/notification';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// Mock data
const mockNotifications: Notification[] = [
  {
    id: '1',
    title: 'Coming Soon',
    message:
      'Notification feature will be available soon. We are working on it!',
    type: 'info',
    read: false,
    createdAt: new Date().toISOString(),
  },
];

const mockNotificationsResponse: NotificationsResponse = {
  notifications: mockNotifications,
  unreadCount: 1, // One unread notification
};

// Simulation of API call with delay
const fetchNotifications = async (): Promise<NotificationsResponse> => {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(mockNotificationsResponse);
    }, 500); // Simulates network latency
  });
};

const markAsRead = async (notificationId: string): Promise<void> => {
  return new Promise(resolve => {
    setTimeout(() => {
      console.log('Marked as read:', notificationId);
      resolve();
    }, 300);
  });
};

const markAllAsRead = async (): Promise<void> => {
  return new Promise(resolve => {
    setTimeout(() => {
      console.log('All notifications marked as read');
      resolve();
    }, 300);
  });
};

export const useNotifications = () => {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: fetchNotifications,
    // refetchInterval: 30000, // Commented out for mock data
  });
};

export const useMarkAsRead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markAsRead,
    onSuccess: () => {
      // Invalidate queries for data refresh
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
};

export const useMarkAllAsRead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markAllAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
};
