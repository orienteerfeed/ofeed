import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { TFunction } from 'i18next';
import React from 'react';
import { EventFormData } from '../../../types';
import { EventForm } from './EventForm';

interface EventInfoCardProps {
  t: TFunction;
  initialData?: Partial<EventFormData> | null;
}

export const EventInfoCard: React.FC<EventInfoCardProps> = ({
  t,
  initialData = null,
}) => {
  return (
    <Card className="w-full">
      <CardHeader className="pb-4 space-y-2">
        <CardTitle className="text-xl font-bold tracking-tight">
          {t('Pages.Event.Card.Title')}
        </CardTitle>
        <CardDescription className="text-sm leading-relaxed text-muted-foreground">
          {t('Pages.Event.Card.Description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-2">
        <EventForm t={t} initialData={initialData} />
      </CardContent>
    </Card>
  );
};
