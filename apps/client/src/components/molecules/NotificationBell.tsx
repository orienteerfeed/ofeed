import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { Bell, CheckCheck } from 'lucide-react';
import React from 'react';
import {
  useMarkAllAsRead,
  useMarkAsRead,
  useNotifications,
} from '../../hooks/useNotifications';
import { Button } from '../atoms';
import type { Notification } from '@/types/notification';

interface NotificationBellProps {
  className?: string;
}

const NotificationItem: React.FC<{ notification: Notification }> = ({
  notification,
}) => {
  const markAsRead = useMarkAsRead();

  const handleClick = () => {
    if (!notification.read) {
      markAsRead.mutate(notification.id);
    }
  };

  const getNotificationIcon = (type: string): React.ReactElement => {
    const baseClasses = 'h-4 w-4';
    switch (type) {
      case 'error':
        return (
          <div className={cn(baseClasses, 'bg-destructive rounded-full')} />
        );
      case 'warning':
        return (
          <div className={cn(baseClasses, 'bg-yellow-500 rounded-full')} />
        );
      case 'success':
        return <div className={cn(baseClasses, 'bg-green-500 rounded-full')} />;
      default:
        return <div className={cn(baseClasses, 'bg-blue-500 rounded-full')} />;
    }
  };

  return (
    <DropdownMenuItem
      className={cn(
        'flex items-start gap-3 p-3 cursor-pointer w-full',
        !notification.read && 'bg-muted/50'
      )}
      onClick={handleClick}
    >
      <div className="flex-shrink-0 mt-0.5">
        {getNotificationIcon(notification.type)}
      </div>
      <div className="flex-1 min-w-0 overflow-hidden">
        <p className="text-sm font-medium leading-none truncate">
          {notification.title}
        </p>
        <p className="text-sm text-muted-foreground mt-1 break-words line-clamp-2">
          {notification.message}
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          {new Date(notification.createdAt).toLocaleDateString()}
        </p>
      </div>
      {!notification.read && (
        <div className="flex-shrink-0 w-2 h-2 bg-primary rounded-full" />
      )}
    </DropdownMenuItem>
  );
};

export const NotificationBell: React.FC<NotificationBellProps> = ({
  className,
}) => {
  const { data, isLoading } = useNotifications();
  const markAllAsRead = useMarkAllAsRead();

  const unreadCount = data?.unreadCount || 0;
  const notifications = data?.notifications || [];

  const handleMarkAllAsRead = () => {
    if (unreadCount > 0) {
      markAllAsRead.mutate();
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('relative', className)}
          disabled={isLoading}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 h-2 w-2 bg-destructive rounded-full" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80 max-w-[calc(100vw-2rem)] overflow-hidden"
      >
        <div className="flex items-center justify-between p-2 w-full">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold">Notifications</h4>
            {unreadCount > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                {unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllAsRead}
              disabled={markAllAsRead.isPending}
            >
              <CheckCheck className="h-4 w-4 mr-1" />
              Mark all read
            </Button>
          )}
        </div>

        <DropdownMenuSeparator />

        <div className="overflow-y-auto max-h-96 [&::-webkit-scrollbar]:w-0 [&::-webkit-scrollbar]:hidden">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground w-full">
              No notifications
            </div>
          ) : (
            notifications.map(notification => (
              <React.Fragment key={notification.id}>
                <NotificationItem notification={notification} />
                <DropdownMenuSeparator />
              </React.Fragment>
            ))
          )}
        </div>

        {notifications.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="justify-center text-sm text-muted-foreground cursor-pointer w-full">
              View all notifications
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
