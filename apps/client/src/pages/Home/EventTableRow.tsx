import { Badge } from '@/components/ui/badge';
import { TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils'; // Import formatDate
import { Link } from '@tanstack/react-router';
import { TFunction } from 'i18next';
import { Calendar, MapPin } from 'lucide-react';
import { Button, CountryFlag } from '../../components/atoms';
import { Event } from '../../types/event';

interface EventTableRowProps {
  t: TFunction;
  event: Event;
  className?: string;
  style?: React.CSSProperties;
}

type EventStatus = 'ongoing' | 'upcoming' | 'past';

export function EventTableRow({
  t,
  event,
  className,
  style,
}: EventTableRowProps) {
  const statusColors: Record<EventStatus, string> = {
    ongoing: 'bg-primary text-primary-foreground',
    upcoming: 'bg-secondary text-secondary-foreground',
    past: 'bg-muted text-muted-foreground',
  };

  const statusLabels: Record<EventStatus, string> = {
    ongoing: t('Pages.Event.Tabs.Ongoing').toUpperCase(),
    upcoming: t('Pages.Event.Tabs.Upcoming').toUpperCase(),
    past: t('Pages.Event.Tabs.Past').toUpperCase(),
  };

  return (
    <TableRow
      className={cn('hover:bg-muted/50 transition-colors', className)}
      style={style}
      data-event-id={event.id}
    >
      <TableCell className="font-medium">
        <Link
          to="/events/$eventId"
          params={{ eventId: event.id }}
          className="hover:underline transition-colors"
        >
          {event.name}
        </Link>
        {event.organizer && (
          <div className="text-sm text-muted-foreground mt-1">
            {event.organizer}
          </div>
        )}
      </TableCell>

      <TableCell>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <span className="font-mono text-sm">{event.date}</span>
        </div>
      </TableCell>

      <TableCell>
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm line-clamp-1">{event.location}</span>
        </div>
      </TableCell>

      <TableCell>
        <div className="flex items-center gap-2">
          <CountryFlag
            countryCode={event.country.countryCode.toLowerCase()}
            size="sm"
            className="shadow-sm"
          />
          <span className="text-sm">{event.country.countryName}</span>
        </div>
      </TableCell>

      <TableCell>
        <Badge className={cn('font-mono text-xs')}>{event.sport.name}</Badge>
      </TableCell>

      <TableCell>
        <Badge className={cn('font-mono text-xs', statusColors[event.status])}>
          {statusLabels[event.status]}
        </Badge>
      </TableCell>

      <TableCell>
        <Badge
          variant="outline"
          className={cn(
            'font-mono text-xs',
            event.status === 'past' &&
              'text-muted-foreground border-muted-foreground'
          )}
        >
          {event.status === 'past' ? 'CLOSED' : 'OPEN'}
        </Badge>
      </TableCell>

      <TableCell>
        <div className="flex gap-2 justify-end">
          <Button asChild variant="outline" size="sm">
            <Link
              to="/events/$eventId"
              params={{ eventId: event.id }}
              search={{ tab: 'results' }}
            >
              {t('Pages.Event.Tabs.Results')}
            </Link>
          </Button>
          <Button asChild variant="default" size="sm">
            <Link
              to="/events/$eventId"
              params={{ eventId: event.id }}
              search={{ tab: 'info' }}
            >
              {t('Pages.Event.Tabs.Detail')}
            </Link>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
