import { EventorIcon, OrisIcon } from '@/assets/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  formatDate,
  formatStoredUtcTimeForTimezone,
  getLocaleKey,
} from '@/lib/date';
import {
  buildExternalEventUrl,
  externalEventSystems,
  type ExternalEventSystemProvider,
} from '@/lib/paths/externalLinks';
import {
  hasDisplayableCourseClimb,
  hasDisplayableCourseLength,
} from '@/lib/course-info';
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

  const externalProvider: ExternalEventSystemProvider =
    event.externalSource === 'EVENTOR' ? 'EVENTOR' : 'ORIS';
  const externalEventUrl = buildExternalEventUrl(
    event.externalSource,
    event.externalEventId
  );
  const externalProviderLabel = externalEventSystems[externalProvider].label;
  const ExternalProviderLogo =
    externalProvider === 'EVENTOR' ? EventorIcon : OrisIcon;

  const getPrimaryBadgeVariant = (
    status: typeof event.statusSummary.primary
  ) => {
    switch (status) {
      case 'DONE':
        return 'default' as const;
      case 'LIVE':
        return 'destructive' as const;
      case 'UPCOMING':
      case 'DRAFT':
        return 'secondary' as const;
      default:
        return 'secondary' as const;
    }
  };

  const getPrimaryStatusText = (status: typeof event.statusSummary.primary) => {
    switch (status) {
      case 'DONE':
        return t('Pages.Event.Detail.StatusText.Primary.DONE');
      case 'LIVE':
        return t('Pages.Event.Detail.StatusText.Primary.LIVE');
      case 'UPCOMING':
        return t('Pages.Event.Detail.StatusText.Primary.UPCOMING');
      default:
        return t('Pages.Event.Detail.StatusText.Primary.DRAFT');
    }
  };

  const getStatusText = () => {
    if (
      event.statusSummary.results === 'UNOFFICIAL' ||
      event.statusSummary.results === 'OFFICIAL'
    ) {
      return t(
        `Pages.Event.Detail.Status.Results.${event.statusSummary.results}`,
        event.statusSummary.results === 'OFFICIAL'
          ? 'Final results'
          : 'Unofficial results'
      );
    }

    return getPrimaryStatusText(event.statusSummary.primary);
  };

  const getPrimaryStatusLabel = (
    status: typeof event.statusSummary.primary
  ) => {
    switch (status) {
      case 'DONE':
        return t('Pages.Event.Detail.Status.Primary.DONE');
      case 'LIVE':
        return t('Pages.Event.Detail.Status.Primary.LIVE');
      case 'UPCOMING':
        return t('Pages.Event.Detail.Status.Primary.UPCOMING');
      default:
        return t('Pages.Event.Detail.Status.Primary.DRAFT');
    }
  };

  const getResultsBadgeVariant = (
    status: typeof event.statusSummary.results
  ) => {
    switch (status) {
      case 'OFFICIAL':
        return 'default' as const;
      case 'LIVE':
        return 'outline' as const;
      case 'UNOFFICIAL':
        return 'outline' as const;
      default:
        return 'secondary' as const;
    }
  };

  const getEntriesBadgeVariant = (
    status: typeof event.statusSummary.entries
  ) => (status === 'OPEN' ? ('outline' as const) : ('secondary' as const));

  const officialResultsProvider =
    event.statusSummary.officialResultsSource === 'EVENTOR'
      ? 'EVENTOR'
      : event.statusSummary.officialResultsSource === 'ORIS'
        ? 'ORIS'
        : null;
  const showResultsBadge = event.statusSummary.results === 'LIVE';

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
                    {formatStoredUtcTimeForTimezone(
                      event.zeroTime,
                      event.date,
                      event.timezone || 'UTC'
                    )}
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
                    {sortedClasses.map(cls => {
                      const showLength = hasDisplayableCourseLength(cls.length);
                      const showClimb = hasDisplayableCourseClimb(cls);
                      const lengthLabel = showLength
                        ? ` • ${cls.length ?? 0}m`
                        : '';
                      const climbLabel = showClimb
                        ? ` • ${cls.climb ?? 0}m`
                        : '';

                      return (
                        <Link
                          key={cls.id}
                          to="/events/$eventId"
                          params={{ eventId: event.id }}
                          search={{ tab: 'results', class: cls.name }}
                          className="inline-block"
                        >
                          <Badge variant="secondary" className="cursor-pointer">
                            {cls.name}
                            {lengthLabel}
                            {climbLabel}
                          </Badge>
                        </Link>
                      );
                    })}
                  </div>
                </div>
                {(externalEventUrl ||
                  event.statusSummary.officialResultsUrl) && (
                  <div className="mt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {externalEventUrl && (
                        <Button
                          asChild
                          variant="outline"
                          className="px-3 [&_svg]:h-5 [&_svg]:w-auto"
                        >
                          <a
                            href={externalEventUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={t(
                              'Pages.Event.Detail.OpenInExternalSystem',
                              {
                                provider: externalProviderLabel,
                              }
                            )}
                            className="inline-flex items-center justify-center"
                          >
                            <ExternalProviderLogo />
                          </a>
                        </Button>
                      )}

                      {event.statusSummary.officialResultsUrl &&
                        officialResultsProvider && (
                          <Button asChild variant="outline">
                            <a
                              href={event.statusSummary.officialResultsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <span>
                                {t(
                                  'Pages.Event.Detail.OfficialResultsLink',
                                  'Official results'
                                )}
                              </span>
                            </a>
                          </Button>
                        )}
                    </div>
                  </div>
                )}
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
              variant={getPrimaryBadgeVariant(event.statusSummary.primary)}
              className="text-sm"
            >
              {getPrimaryStatusLabel(event.statusSummary.primary)}
            </Badge>
            {showResultsBadge && (
              <Badge
                variant={getResultsBadgeVariant(event.statusSummary.results)}
                className="text-sm"
              >
                {t(
                  `Pages.Event.Detail.Status.Results.${event.statusSummary.results}`
                )}
              </Badge>
            )}
            {event.statusSummary.entriesConfigured && (
              <Badge
                variant={getEntriesBadgeVariant(event.statusSummary.entries)}
                className="text-sm"
              >
                {t(
                  `Pages.Event.Detail.Status.Entries.${event.statusSummary.entries}`
                )}
              </Badge>
            )}
          </div>

          <div className="mt-2 text-sm text-muted-foreground">
            {getStatusText()}
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
