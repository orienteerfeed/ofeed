import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate, formatTimeToHms, getLocaleKey } from '@/lib/date';
import { Event } from '@/types/event';
import { Link } from '@tanstack/react-router';
import { Calendar, Clock, MapPin, Trophy, Users } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { CountryFlag } from '../../components/atoms';
import { Alert } from '../../components/organisms';

interface EventInfoViewProps {
  event: Event;
}

export function EventInfoView({ event }: EventInfoViewProps) {
  const { t, i18n } = useTranslation();
  const localeKey = getLocaleKey(i18n.language);

  const sortedClasses = React.useMemo(() => {
    if (!event.classes) return [];
    return [...event.classes].sort((a, b) => a.name.localeCompare(b.name));
  }, [event.classes]);
  // Helper function to determine badge variant based on event status
  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'completed':
        return 'default' as const;
      case 'live':
        return 'destructive' as const;
      case 'upcoming':
        return 'secondary' as const;
      default:
        return 'secondary' as const;
    }
  };

  // Helper function to get status text
  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return t('Pages.Event.Detail.StatusText.Completed');
      case 'live':
        return t('Pages.Event.Detail.StatusText.Live');
      case 'upcoming':
        return t('Pages.Event.Detail.StatusText.Upcoming');
      default:
        return '';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return t('Pages.Event.Detail.Status.Completed');
      case 'live':
        return t('Pages.Event.Detail.Status.Live');
      case 'upcoming':
        return t('Pages.Event.Detail.Status.Upcoming');
      default:
        return t('Pages.Event.Detail.Status.Draft');
    }
  };

  // Determine event status based on date and published status
  const getEventStatus = (event: Event): string => {
    const now = new Date();
    const eventDate = new Date(event.date);

    if (!event.published) return 'draft';
    if (now > eventDate) return 'completed';
    if (now.toDateString() === eventDate.toDateString()) return 'live';
    return 'upcoming';
  };

  const eventStatus = getEventStatus(event);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" />
            {t('Pages.Event.Detail.EventInformation')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Main event details - responsive grid layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Date Section */}
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                <div className="text-sm text-muted-foreground">
                  {t('Pages.Event.Detail.Date')}
                </div>
                <div className="font-medium">
                  {formatDate(event.date, localeKey)}
                </div>
                {event.zeroTime && (
                  <div className="text-sm text-muted-foreground mt-1">
                    {t('Pages.Event.Detail.ZeroTime')}:{' '}
                    {formatTimeToHms(event.zeroTime)}
                  </div>
                )}
              </div>
            </div>

            {/* Location Section */}
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                <div className="text-sm text-muted-foreground">
                  {t('Pages.Event.Detail.Location')}
                </div>
                <div className="font-medium">{event.location}</div>
                <div className="flex items-center gap-2 mt-1">
                  <CountryFlag
                    countryCode={event.country.countryCode}
                    className="w-6 h-4"
                  />
                  <span className="text-sm text-muted-foreground">
                    {event.country.countryName}
                  </span>
                </div>
              </div>
            </div>

            {/* Organizer Section */}
            {event.organizer && (
              <div className="flex items-start gap-3">
                <Users className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <div className="text-sm text-muted-foreground">
                    {t('Pages.Event.Detail.Organizer')}
                  </div>
                  <div className="font-medium">{event.organizer}</div>
                </div>
              </div>
            )}
          </div>

          {/* Rest of the content remains in single column */}
          <div className="grid gap-4 mt-6">
            <div className="flex items-start gap-3">
              <Users className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <div className="text-sm text-muted-foreground">
                  {t('Pages.Event.Detail.Classes')}
                </div>
                <div className="mt-2">
                  <div className="flex flex-wrap gap-2 sm:hidden">
                    {sortedClasses.map(cls => (
                      <Link
                        key={cls.id}
                        to="/events/$eventId"
                        params={{ eventId: event.id }}
                        search={{ tab: 'results', class: cls.name }}
                        className="inline-block"
                      >
                        <Badge variant="secondary" className="cursor-pointer">
                          {cls.name}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                  <div className="hidden flex-wrap gap-2 sm:flex">
                    {sortedClasses.map(cls => (
                      <Link
                        key={cls.id}
                        to="/events/$eventId"
                        params={{ eventId: event.id }}
                        search={{ tab: 'results', class: cls.name }}
                        className="inline-block"
                      >
                        <Badge variant="secondary" className="cursor-pointer">
                          {cls.name}
                          {cls.length && ` • ${cls.length}m`}
                          {cls.climb && ` • ${cls.climb}m`}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {event.relay && (
              <div className="flex items-start gap-3">
                <Trophy className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div>
                  <div className="text-sm text-muted-foreground">
                    {t('Pages.Event.Detail.Format')}
                  </div>
                  <Badge variant="default" className="mt-1">
                    {t('Pages.Event.Detail.RelayRace')}
                  </Badge>
                </div>
              </div>
            )}

            {event.ranking && (
              <div className="flex items-start gap-3">
                <Trophy className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div>
                  <div className="text-sm text-muted-foreground">
                    {t('Pages.Event.Detail.Ranking')}
                  </div>
                  <div className="font-medium">{event.ranking}</div>
                  {event.coefRanking && (
                    <div className="text-sm text-muted-foreground">
                      {t('Pages.Event.Detail.Coefficient')}: {event.coefRanking}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            {t('Pages.Event.Detail.EventStatus')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Badge
              variant={getStatusBadgeVariant(eventStatus)}
              className="text-sm"
            >
              {getStatusLabel(eventStatus)}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {getStatusText(eventStatus)}
            </span>
          </div>

          {!event.published && (
            <Alert
              className="mt-2"
              severity="warning"
              variant="outlined"
              title={t('Pages.Event.Detail.Alert.UnpublishedTitle')}
            >
              {t('Pages.Event.Detail.Alert.UnpublishedDescription')}
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Additional event details card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            {t('Pages.Event.Detail.AdditionalDetails')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">
                {t('Pages.Event.Detail.Sport')}:
              </span>
              <span className="ml-2 font-medium capitalize">
                {event.sport.name}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">
                {t('Pages.Event.Detail.EventId')}:
              </span>
              <span className="ml-2 font-medium font-mono">{event.id}</span>
            </div>
            {event.authorId && (
              <div>
                <span className="text-muted-foreground">
                  {t('Pages.Event.Detail.Author')}:
                </span>
                <span className="ml-2 font-medium">
                  {event.user?.firstname} {event.user?.lastname}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
