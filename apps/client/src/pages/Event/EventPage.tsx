import { notFound, useNavigate } from '@tanstack/react-router';
import {
  Calendar,
  FileText,
  Loader2,
  MapPin,
  MonitorUp,
  MoreHorizontal,
  Settings,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, CountryFlag } from '../../components/atoms';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { useAuth } from '../../hooks/useAuth';
import { useEvent } from '../../hooks/useEvent';
import { formatDateWithDay, getLocaleKey } from '../../lib/date';
import { buildBoardEventUrl } from '../../lib/paths/externalLinks';
import PATHNAMES from '../../lib/paths/pathnames';
import { MainPageLayout } from '../../templates/MainPageLayout';
import { EventDetailTabs } from './EventDetailTabs';
import { NotificationControlPanel } from './NotificationControlPanel';

interface EventPageProps {
  eventId: string;
  tab?: string | undefined;
}

export const EventPage = ({ eventId, tab }: EventPageProps) => {
  const { t, i18n } = useTranslation();
  const { event, loading, error } = useEvent(eventId);
  const { user, isAuthenticated, isAdmin } = useAuth();
  const navigate = useNavigate();

  console.log('Event ID:', eventId, 'Tab:', tab);

  const hasEventOwnerAccess =
    isAuthenticated &&
    user &&
    event &&
    (user.id === event.authorId || isAdmin());

  const handleSettingsClick = () => {
    navigate(PATHNAMES.eventSettings(eventId));
  };
  const handleReportClick = () => {
    navigate(PATHNAMES.eventReport(eventId));
  };
  const boardEventUrl = event ? buildBoardEventUrl(event.id) : null;
  const handleBoardClick = () => {
    if (!boardEventUrl) {
      return;
    }

    window.open(boardEventUrl, '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return (
      <MainPageLayout t={t} pageName={t('Templates.Routes.Events')}>
        <div className="min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">
              {t('Pages.Event.Detail.Loading')}
            </p>
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
              {t('Pages.Event.Detail.ErrorTitle')}
            </h2>
            <p className="text-muted-foreground">
              {error.message || t('Pages.Event.Detail.ErrorDescription')}
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
      <section className="container mx-auto px-4 pt-5 pb-4 sm:pt-8 sm:pb-6">
        {/* Header row with metadata and settings button */}
        <div className="flex justify-between items-start gap-3 mb-4">
          {/* Event metadata */}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2 sm:items-start">
            <CountryFlag
              countryCode={event.country.countryCode}
              className="h-5 w-7 shrink-0 shadow-md sm:h-6 sm:w-8"
            />
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-tight text-muted-foreground sm:text-sm">
              <div className="flex min-w-0 items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                <span className="font-mono whitespace-nowrap">
                  {formatDateWithDay(event.date, getLocaleKey(i18n.language))}
                </span>
              </div>
              <div className="flex min-w-0 items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                <span className="min-w-0 truncate">
                  {event.location}, {event.country.countryName}
                </span>
              </div>
            </div>
          </div>
          <div className="hidden shrink-0 items-center gap-2 sm:inline-flex sm:gap-3">
            <NotificationControlPanel />
            {boardEventUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleBoardClick}
                className="flex items-center gap-2"
              >
                <MonitorUp className="w-4 h-4" />
                <span className="hidden sm:block">
                  {t('Pages.Event.Detail.OpenBoard')}
                </span>
              </Button>
            )}
            {/* Settings button for event owner or admin */}
            {hasEventOwnerAccess && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReportClick}
                  className="flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  <span className="hidden sm:block">
                    {t('Pages.Event.Detail.Report')}
                  </span>
                </Button>
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
              </>
            )}
          </div>
          <div className="inline-flex shrink-0 sm:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  aria-label={t('Common.OpenMenu', {
                    defaultValue: 'Open menu',
                  })}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <div className="flex px-2 py-1.5">
                  <NotificationControlPanel />
                </div>
                {(boardEventUrl || hasEventOwnerAccess) && (
                  <DropdownMenuSeparator />
                )}
                {boardEventUrl && (
                  <DropdownMenuItem onSelect={handleBoardClick}>
                    <MonitorUp className="h-4 w-4" />
                    {t('Pages.Event.Detail.OpenBoard')}
                  </DropdownMenuItem>
                )}
                {hasEventOwnerAccess && (
                  <>
                    <DropdownMenuItem onSelect={handleReportClick}>
                      <FileText className="h-4 w-4" />
                      {t('Pages.Event.Detail.Report')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={handleSettingsClick}>
                      <Settings className="h-4 w-4" />
                      {t('Settings', { ns: 'common' })}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Event title and organizer */}
        <div className="mb-6 sm:mb-8">
          <h1 className="mb-2 text-2xl font-bold leading-tight sm:text-3xl md:text-4xl">
            {event.name}
          </h1>
          {event.organizer && (
            <p className="text-base text-muted-foreground sm:text-lg">
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
