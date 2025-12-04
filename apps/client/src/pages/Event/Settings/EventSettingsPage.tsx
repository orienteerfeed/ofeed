import { config } from '@/config';
import {
  formatDate,
  formatDateForInput,
  formatDateTimeForInput,
} from '@/lib/utils';
import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackLink } from '../../../components/molecules';
import { DragDropFile } from '../../../components/organisms';
import { useAuth } from '../../../hooks/useAuth';
import { ENDPOINTS } from '../../../lib/api/endpoints';
import { NotAuthorizedPage } from '../../../pages';
import { MainPageLayout } from '../../../templates/MainPageLayout';
import { Event, EventFormData } from '../../../types';
import { DangerZoneCard } from './DangerZoneCard';
import { EventInfoCard } from './EventInfoCard';
import { EventLinkCard } from './EventLinkCard';
import { EventPasswordCard } from './EventPasswordCard';
import { EventVisibilityCard } from './EventVisibilityCard';
import { QrCodeCredentialsCard } from './QrCodeCredentialsCard';

interface EventData {
  event: Event;
}

// GraphQL query
export const GET_EVENT = gql`
  query Event($eventId: String!) {
    event(id: $eventId) {
      id
      name
      organizer
      location
      latitude
      longitude
      country {
        countryCode
      }
      sportId
      date
      timezone
      zeroTime
      ranking
      coefRanking
      startMode
      relay
      hundredthPrecision
      published
      authorId
      classes {
        id
        name
      }
      eventPassword {
        password
        expiresAt
      }
    }
  }
`;

export const EventSettingsPage = () => {
  const { t } = useTranslation();
  const { eventId } = useParams({ from: '/events/$eventId/settings' });
  const { user } = useAuth();

  const [password, setPassword] = useState<string>('');

  const { loading, error, data } = useQuery<EventData>(GET_EVENT, {
    variables: { eventId },
  });

  const apiEventsEndpoint = new URL(ENDPOINTS.events(), config.BASE_API_URL)
    .href;

  useEffect(() => {
    if (data?.event?.eventPassword?.password) {
      setPassword(data.event.eventPassword.password);
    }
  }, [data]);

  // Create initialData for EventInfoCard
  const initialData: Partial<EventFormData> | null = data?.event
    ? {
        id: data.event.id,
        name: data.event.name,
        sportId: data.event.sportId,
        date: formatDateForInput(data.event.date),
        timezone: data.event.timezone || 'Europe/Prague',
        organizer: data.event.organizer,
        location: data.event.location,
        latitude: data.event.latitude,
        longitude: data.event.longitude,
        countryCode: data.event.country?.countryCode || '',
        zeroTime: formatDateTimeForInput(data.event.zeroTime ?? ''),
        ranking: data.event.ranking || false,
        coefRanking: data.event.coefRanking,
        relay: data.event.relay || false,
        hundredthPrecision: data.event.hundredthPrecision || false,
        published: data.event.published || false,
      }
    : null;

  if (loading) {
    return (
      <MainPageLayout t={t}>
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </MainPageLayout>
    );
  }

  if (error) {
    return (
      <MainPageLayout t={t}>
        <div className="flex items-center justify-center py-8">
          <div className="text-center text-destructive">
            <p>Error: {error.message}</p>
          </div>
        </div>
      </MainPageLayout>
    );
  }

  if (!data?.event || user?.id !== data.event.authorId) {
    return <NotAuthorizedPage />;
  }

  return (
    <MainPageLayout t={t}>
      <div className="container mx-auto px-4 py-6">
        <div className="grid items-start gap-8">
          <BackLink to={`/events/${eventId}`} />

          <DragDropFile eventId={eventId} />

          <div className="columns-1 md:columns-2 xl:columns-3 gap-6 space-y-6">
            {/* Left Column */}
            <div className="break-inside-avoid">
              <EventInfoCard t={t} initialData={initialData} />
            </div>
            {/* Middle Column */}
            <div className="break-inside-avoid">
              <EventPasswordCard
                t={t}
                eventId={initialData?.id || ''}
                eventData={data.event}
                password={data.event.eventPassword?.password}
                expiresAt={data.event.eventPassword?.expiresAt}
                onPasswordUpdate={setPassword}
              />
            </div>

            {password && (
              <div className="break-inside-avoid">
                <QrCodeCredentialsCard
                  t={t}
                  eventId={eventId}
                  eventPassword={password}
                  eventName={data.event.name}
                  eventDate={formatDate(data.event.date)}
                  apiEventsEndpoint={apiEventsEndpoint}
                  apiBaseUrl={config.BASE_API_URL}
                />
              </div>
            )}

            {/* Right Column */}
            <div className="break-inside-avoid">
              <EventVisibilityCard
                t={t}
                eventId={eventId}
                isPublished={data.event.published}
              />
            </div>
            <div className="break-inside-avoid">
              <EventLinkCard
                t={t}
                eventId={initialData?.id || ''}
                eventName={data.event.name}
                eventLocation={data.event.location}
                eventDateFormatted={formatDate(data.event.date)}
              />
            </div>
            <div className="break-inside-avoid">
              <DangerZoneCard t={t} eventId={eventId} />
            </div>
          </div>
        </div>
      </div>
    </MainPageLayout>
  );
};
