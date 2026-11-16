import { useState } from 'react';
import { Bell } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useNotifications } from '@/hooks/useNotifications';
import { NotificationInbox } from './NotificationInbox';
import { cn } from '@/lib/utils';

export function NotificationBell({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data, loading, error, refetch } = useNotifications();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('relative', className)}
          aria-label={t('Notifications.BellLabel', {
            count: data?.unreadCount ?? 0,
          })}
        >
          <Bell className="h-5 w-5" />
          {!!data?.unreadCount && (
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] p-0">
        <div className="max-h-96 overflow-y-auto">
          <NotificationInbox
            data={data}
            loading={loading}
            failed={!!error}
            retry={() => {
              void refetch().catch(() => {});
            }}
            onSelect={() => setOpen(false)}
          />
        </div>
        <Link
          to="/notifications"
          className="block border-t p-3 text-center text-sm hover:bg-accent"
          onClick={() => setOpen(false)}
        >
          {t('Notifications.ViewAll')}
        </Link>
      </PopoverContent>
    </Popover>
  );
}
