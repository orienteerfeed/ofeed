import { notFound, useNavigate } from '@tanstack/react-router';
import { Calendar, Loader2, MapPin, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, CountryFlag } from '../../components/atoms';
import { useAuth } from '../../hooks/useAuth';
import { useEvent } from '../../hooks/useEvent';
import { formatDateWithDay } from '../../lib/date';
import { MainPageLayout } from '../../templates/MainPageLayout';
import { EventDetailTabs } from './EventDetailTabs';
import { NotificationControlPanel } from './NotificationControlPanel';

interface EventPageProps {
  eventId: string;
  tab?: string | undefined;
}

export const EventPage = ({ eventId, tab }: EventPageProps) => {
  const { t } = useTranslation();
  const { event, loading, error } = useEvent(eventId);
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  console.log('Event ID:', eventId, 'Tab:', tab);

  // Check if current user is the event owner
  const isEventOwner =
    isAuthenticated && user && event && user.id === event.authorId;

  const handleSettingsClick = () => {
    navigate({ to: '/events/$eventId/settings', params: { eventId } });
  };

  if (loading) {
    return (
      <MainPageLayout t={t} pageName={t('Templates.Routes.Events')}>
        <div className="min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading event...</p>
          </div>
        </div>
      </MainPageLayout>
    );
  }

  if (error) {
    console.error('Error fetching event:', error);
    return (
      <MainPageLayout t={t} pageName={t('Templates.Routes.Events')}>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-destructive mb-2">
              Error loading event
            </h2>
            <p className="text-muted-foreground">
              {error.message || 'Failed to load event data'}
            </p>
          </div>
        </div>
      </MainPageLayout>
    );
  }

  // Handle not found
  if (!event) {
    throw notFound();
  }

  return (
    <MainPageLayout t={t} pageName={event.name}>
      {/* Event Header - Clean design without hero image */}
      <section className="container mx-auto px-4 pt-8 pb-6">
        {/* Header row with metadata and settings button */}
        <div className="flex justify-between items-start mb-4">
          {/* Event metadata */}
          <div className="flex items-center gap-3">
            <CountryFlag
              countryCode={event.country.countryCode}
              className="w-8 h-6 shadow-md"
            />
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span className="font-mono">
                  {formatDateWithDay(event.date)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                <span>
                  {event.location}, {event.country.countryName}
                </span>
              </div>
            </div>
          </div>
          <div className="inline-flex items-center gap-3">
            <NotificationControlPanel />
            {/* Settings button for event owner */}
            {isEventOwner && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSettingsClick}
                className="flex items-center gap-2"
              >
                <Settings className="w-4 h-4" />
                <span className="hidden sm:block">
                  {t('Settings', { ns: 'common' })}
                </span>
              </Button>
            )}
          </div>
        </div>

        {/* Event title and organizer */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">{event.name}</h1>
          {event.organizer && (
            <p className="text-lg text-muted-foreground">
              {t('Pages.Event.OrganizedBy')}: {event.organizer}
            </p>
          )}
        </div>

        {/* Event Stats */}
        {/* TODO: refactor needed
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="text-center p-4 bg-muted rounded-lg">
            <div className="text-2xl font-bold text-primary">
              {event.classes?.length || 0}
            </div>
            <div className="text-sm text-muted-foreground">
              {t('Pages.Event.Classes')}
            </div>
          </div>
          <div className="text-center p-4 bg-muted rounded-lg">
            <div className="text-2xl font-bold text-primary">
              {event.published ? 'Published' : 'Draft'}
            </div>
            <div className="text-sm text-muted-foreground">Status</div>
          </div>
          <div className="text-center p-4 bg-muted rounded-lg">
            <div className="text-2xl font-bold text-primary">
              {event.relay ? 'Relay' : 'Individual'}
            </div>
            <div className="text-sm text-muted-foreground">Format</div>
          </div>
          <div className="text-center p-4 bg-muted rounded-lg">
            <div className="text-2xl font-bold text-primary">
              {event.ranking || 'N/A'}
            </div>
            <div className="text-sm text-muted-foreground">Ranking</div>
          </div>
        </div> */}
      </section>

      {/* Event Detail Tabs */}
      <section className="container mx-auto px-4 pb-8">
        <EventDetailTabs t={t} event={event} defaultTab={tab} />
      </section>
    </MainPageLayout>
  );
};
