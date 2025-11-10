import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Event } from '@/types/event';
import { Link } from '@tanstack/react-router';
import { t } from 'i18next';
import { Calendar, MapPin } from 'lucide-react';
import { Button, CountryFlag } from '../../components/atoms';

interface EventCardProps {
  event: Event;
}

type EventStatus = 'ongoing' | 'upcoming' | 'past';

export const EventCard = ({ event }: EventCardProps) => {
  const statusColors: Record<EventStatus, string> = {
    ongoing: 'bg-primary text-primary-foreground',
    upcoming: 'bg-secondary text-secondary-foreground',
    past: 'bg-muted text-muted-foreground',
  };

  const statusLabels: Record<EventStatus, string> = {
    ongoing: 'Ongoing',
    upcoming: 'Upcoming',
    past: 'Past',
  };

  const getRandomEventPlaceholder = () => {
    const randomNum = Math.floor(Math.random() * 5) + 1; // 1-5
    return `/images/placeholders/placeholder-event-${String(randomNum).padStart(2, '0')}.png`;
  };

  return (
    <Card className="overflow-hidden border-border bg-card group hover:shadow-lg transition-shadow duration-300">
      <Link
        to="/events/$eventId"
        params={{ eventId: event.id }}
        className="block"
      >
        <div className="relative aspect-[3/2] overflow-hidden">
          <img
            src={event.featuredImage || getRandomEventPlaceholder()}
            alt={event.name}
            className="object-cover w-full h-full transition-transform duration-300 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

          {/* Status Badge */}
          <Badge
            className={cn(
              'absolute top-4 left-4 font-mono text-xs',
              statusColors[event.status]
            )}
          >
            {t(
              `Pages.Event.Tabs.${statusLabels[event.status]}` as
                | 'Pages.Event.Tabs.Past'
                | 'Pages.Event.Tabs.Today'
                | 'Pages.Event.Tabs.Upcoming'
            )}
          </Badge>

          {/* User Entry & Country Flag */}
          <div className="absolute top-4 right-4 flex items-center gap-2">
            {/* Pokud máte userEntry v Event typu, odkomentujte: */}
            {/* {event.userEntry && (
              <Badge className="bg-accent text-accent-foreground font-mono text-xs">
                REGISTERED
              </Badge>
            )} */}
            <CountryFlag
              countryCode={event.country.countryCode.toLowerCase()}
              className="w-8 h-6 shadow-lg rounded"
            />
          </div>

          {/* Event Info Overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6">
            <div className="flex items-center gap-2 text-white text-xs md:text-sm mb-2">
              <Calendar className="w-4 h-4" />
              <span className="font-mono">{event.date}</span>
            </div>
            <h3 className="text-2xl md:text-3xl font-bold text-white mb-2 tracking-tight line-clamp-2">
              {event.name}
            </h3>
            <div className="flex items-center gap-2 text-white text-sm">
              <MapPin className="w-4 h-4" />
              <span className="line-clamp-1">
                {event.location}, {event.country.countryName}
              </span>
            </div>
          </div>
        </div>
      </Link>

      {/* Action Buttons */}
      <CardContent className="p-4 flex gap-2">
        <Button asChild variant="outline" className="flex-1 bg-transparent">
          <Link
            to="/events/$eventId"
            params={{ eventId: event.id }}
            search={{ tab: 'results' }}
          >
            {t('View', { ns: 'common' })} {t('Pages.Event.Tabs.Results')}
          </Link>
        </Button>
        <Button asChild variant="default" className="flex-1">
          <Link
            to="/events/$eventId"
            params={{ eventId: event.id }}
            search={{ tab: 'info' }}
          >
            {t('View', { ns: 'common' })} {t('Pages.Event.Tabs.Detail')}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
};
