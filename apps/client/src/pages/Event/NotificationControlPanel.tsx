import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Bell, BellOff, Volume2, VolumeX } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import {
  getNotificationSettings,
  saveNotificationSettings,
  type NotificationSettings,
} from '../../lib/notificationSettings';

export const NotificationControlPanel: React.FC = () => {
  const [settings, setSettings] = useState<NotificationSettings>(
    getNotificationSettings
  );

  useEffect(() => {
    saveNotificationSettings(settings);
  }, [settings]);

  const toggleSound = (): void => {
    setSettings(prev => ({
      ...prev,
      general: { ...prev.general, sound: !prev.general.sound },
    }));
  };

  const toggleNotifications = (): void => {
    setSettings(prev => ({
      ...prev,
      general: { ...prev.general, push: !prev.general.push },
    }));
  };

  return (
    <TooltipProvider>
      <div className="inline-flex items-center rounded-md border border-gray-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 p-1 h-8">
        {/* Sound Toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSound}
              className="rounded-sm hover:bg-gray-100 dark:hover:bg-zinc-800 transition-all h-6 w-6"
            >
              {settings.general.sound ? (
                <Volume2 className="h-3.5 w-3.5 text-foreground" />
              ) : (
                <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{settings.general.sound ? 'Disable sound' : 'Enable sound'}</p>
          </TooltipContent>
        </Tooltip>

        {/* Notification Toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleNotifications}
              className="rounded-sm hover:bg-gray-100 dark:hover:bg-zinc-800 transition-all h-6 w-6"
            >
              {settings.general.push ? (
                <Bell className="h-3.5 w-3.5 text-foreground" />
              ) : (
                <BellOff className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              {settings.general.push
                ? 'Disable notifications'
                : 'Enable notifications'}
            </p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
};
