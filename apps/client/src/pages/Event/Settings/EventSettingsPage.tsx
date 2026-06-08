import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackLink, Tabs } from '../../../components/molecules';
import { useAuth } from '../../../hooks/useAuth';
import { NotAuthorizedPage } from '../../../pages';
import { MainPageLayout } from '../../../templates/MainPageLayout';
import { Event, EventFormData, StartMode } from '../../../types';
import { ClassesSettingsTab } from './ClassesSettingsTab';
import { EventVisibilityCard } from './EventVisibilityCard';
import { GeneralSettingsTab } from './GeneralSettingsTab';

interface EventData {
  event: Event;
}

// GraphQL query
export const GET_EVENT = gql`
  query Event($eventId: String!) {
    event(id: $eventId) {
      id
      slug
      name
      organizer
      location
      latitude
      longitude
      country {
        countryCode
        countryName
      }
      sportId
      date
      timezone
      discipline
      externalSource
      externalEventId
      entriesOpenAt
      entriesCloseAt
      splitPublicationMode
      splitPublicationAt
      resultsOfficialAt
      resultsOfficialManuallySetAt
      ranking
      coefRanking
      eventFormat
      defaultStartMode
      currency
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
      meosEventBindings {
        id
      }
    }
  }
`;

export const EventSettingsPage = () => {
  const { t } = useTranslation();
  const { eventId } = useParams({ from: '/events/$eventId/settings' });
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { tab?: string };
  const activeTab = search.tab === 'classes' ? 'classes' : 'general';

  const [password, setPassword] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState<string | undefined>(undefined);

  const { loading, error, data, refetch } = useQuery<EventData>(GET_EVENT, {
    variables: { eventId },
  });

  const handleTabChange = (tabValue: string) => {
    navigate({
      to: `/events/${eventId}/settings`,
      search: { tab: tabValue },
      replace: true,
    });
  };

  useEffect(() => {
    if (data?.event?.eventPassword) {
      setPassword(data.event.eventPassword.password ?? '');
      setExpiresAt(data.event.eventPassword.expiresAt ?? undefined);
    } else {
      setPassword('');
      setExpiresAt(undefined);
    }
  }, [
    data?.event?.eventPassword?.password,
    data?.event?.eventPassword?.expiresAt,
  ]);

  const handleEventDataDeleted = () => {
    setPassword('');
    setExpiresAt(undefined);
  };

  // Create initialData for EventInfoCard
  const initialData: Partial<EventFormData> | null = data?.event
    ? {
        id: data.event.id,
        name: data.event.name,
        sportId: data.event.sportId,
        date: data.event.date ? data.event.date.slice(0, 10) : '',
        timezone: data.event.timezone || 'Europe/Prague',
        organizer: data.event.organizer,
        location: data.event.location,
        latitude: data.event.latitude,
        longitude: data.event.longitude,
        countryCode: data.event.country?.countryCode || '',
        zeroTime: data.event.date
          ? new Date(data.event.date).toISOString().slice(11, 19)
          : '',
        discipline: data.event.discipline,
        defaultStartMode:
          (data.event.defaultStartMode as StartMode | undefined) ?? 'StartList',
        currency: data.event.currency ?? '',
        ranking: data.event.ranking || false,
        coefRanking: data.event.coefRanking,
        relay: data.event.relay || false,
        hundredthPrecision: data.event.hundredthPrecision || false,
        published: data.event.published || false,
        ...(data.event.externalSource
          ? { externalSource: data.event.externalSource }
          : {}),
        ...(data.event.externalEventId
          ? { externalEventId: data.event.externalEventId }
          : {}),
      }
    : null;

  if (loading && !data) {
    return (
      <MainPageLayout t={t}>
        <div className="min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-muted-foreground">
              {t('Pages.Event.Settings.Loading')}
            </p>
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

  const hasEventOwnerAccess =
    !!data?.event && (user?.id === data.event.authorId || isAdmin());

  if (!data?.event || !hasEventOwnerAccess) {
    return <NotAuthorizedPage />;
  }

  return (
    <MainPageLayout t={t}>
      <div className="container mx-auto px-4 py-6">
        <div className="grid items-start gap-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <BackLink to={`/events/${eventId}`} />
            <div className="sm:ml-auto">
              <EventVisibilityCard
                t={t}
                eventId={eventId}
                isPublished={data.event.published}
                onUpdated={async () => {
                  await refetch();
                }}
              />
            </div>
          </div>

          <Tabs
            tabs={[
              {
                value: 'general',
                label: t('Pages.Event.Settings.Tabs.General'),
              },
              {
                value: 'classes',
                label: t('Pages.Event.Settings.Tabs.Classes'),
              },
            ]}
            value={activeTab}
            onValueChange={handleTabChange}
            className="space-y-6"
            listClassName="grid w-full grid-cols-2 max-w-md"
          >
            <GeneralSettingsTab
              key="general"
              t={t}
              eventId={eventId}
              event={data.event}
              initialData={initialData}
              password={password}
              expiresAt={expiresAt}
              onPasswordUpdate={setPassword}
              onEventDataDeleted={handleEventDataDeleted}
              refetch={refetch}
            />
            <ClassesSettingsTab
              key="classes"
              t={t}
              eventId={eventId}
              isRelay={data.event.relay ?? false}
              timezone={data.event.timezone || 'UTC'}
            />
          </Tabs>
        </div>
      </div>
    </MainPageLayout>
  );
};
