import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { TFunction } from 'i18next';
import React from 'react';
import { EventPasswordForm } from './EventPasswordForm';

interface EventPasswordCardProps {
  t: TFunction;
  eventId: string;
  [key: string]: any; // For other props
}

export const EventPasswordCard: React.FC<EventPasswordCardProps> = ({
  t,
  eventId,
  ...otherProps
}) => {
  return (
    <Card className="w-full">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">
          {t('Pages.Event.Password.Card.Title')}
        </CardTitle>
        <CardDescription>
          {t('Pages.Event.Password.Card.Description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <EventPasswordForm t={t} eventId={eventId} {...otherProps} />
      </CardContent>
    </Card>
  );
};
