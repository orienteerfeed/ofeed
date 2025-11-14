import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate, formatTimeToHms } from '@/lib/date';
import { Event } from '@/types/event';
import { Calendar, Clock, MapPin, Trophy, Users } from 'lucide-react';
import { CountryFlag } from '../../components/atoms';
import { Alert } from '../../components/organisms';

interface EventInfoViewProps {
  event: Event;
}

export function EventInfoView({ event }: EventInfoViewProps) {
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
        return 'Results are final';
      case 'live':
        return 'Event in progress';
      case 'upcoming':
        return 'Registration open';
      default:
        return '';
    }
  };

  // Determine event status based on date and published status
  const getEventStatus = (event: Event): string => {
    const now = new Date();
    const eventDate = new Date(parseInt(event.date, 10));

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
            Event Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4">
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <div className="text-sm text-muted-foreground">Date</div>
                <div className="font-medium">
                  {formatDate(new Date(parseInt(event.date, 10)))}
                </div>
                {event.zeroTime && (
                  <div className="text-sm text-muted-foreground mt-1">
                    Zero time:{' '}
                    {formatTimeToHms(new Date(parseInt(event.zeroTime, 10)))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <div className="text-sm text-muted-foreground">Location</div>
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

            {event.organizer && (
              <div className="flex items-start gap-3">
                <Users className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div>
                  <div className="text-sm text-muted-foreground">Organizer</div>
                  <div className="font-medium">{event.organizer}</div>
                </div>
              </div>
            )}

            <div className="flex items-start gap-3">
              <Users className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <div className="text-sm text-muted-foreground">Classes</div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {event.classes?.map(cls => (
                    <Badge key={cls.id} variant="secondary">
                      {cls.name}
                      {cls.length && ` • ${cls.length}m`}
                      {cls.climb && ` • ${cls.climb}m`}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {event.relay && (
              <div className="flex items-start gap-3">
                <Trophy className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div>
                  <div className="text-sm text-muted-foreground">Format</div>
                  <Badge variant="default" className="mt-1">
                    Relay Race
                  </Badge>
                </div>
              </div>
            )}

            {event.ranking && (
              <div className="flex items-start gap-3">
                <Trophy className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div>
                  <div className="text-sm text-muted-foreground">Ranking</div>
                  <div className="font-medium">{event.ranking}</div>
                  {event.coefRanking && (
                    <div className="text-sm text-muted-foreground">
                      Coefficient: {event.coefRanking}
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
            Event Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Badge
              variant={getStatusBadgeVariant(eventStatus)}
              className="text-sm"
            >
              {eventStatus.toUpperCase()}
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
              title="Event is not published yet"
            >
              This event is currently in draft mode and not visible to the
              public.
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Additional event details card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            Additional Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Sport:</span>
              <span className="ml-2 font-medium capitalize">
                {event.sport.name}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Event ID:</span>
              <span className="ml-2 font-medium font-mono">{event.id}</span>
            </div>
            {event.authorId && (
              <div>
                <span className="text-muted-foreground">Author:</span>
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
