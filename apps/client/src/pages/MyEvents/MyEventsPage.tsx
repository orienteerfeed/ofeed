import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { TFunction } from 'i18next';
import {
  Calendar,
  Eye,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, VisibilityBadge } from '../../components/atoms';
import { useApi } from '../../hooks';
import { MainPageLayout } from '../../templates';
import { EventForm } from '../Event/Settings/EventForm';

// Types based on your API response
interface Event {
  id: string;
  name: string;
  date: string;
  location: string;
  organizer: string;
  published: boolean;
  relay: boolean;
}

// The API returns { data: Event[] }
interface MyEventsResponse {
  data: Event[];
}

interface CreateEventDialogProps {
  t: TFunction;
}

// API function using apiClient
const useMyEvents = () => {
  const api = useApi();

  return useQuery<MyEventsResponse, Error>({
    queryKey: ['myEvents'],
    queryFn: () => api.get<MyEventsResponse>(ENDPOINTS.myEvents()),
  });
};

// Helper components
const EventTypeBadge = ({ isRelay }: { isRelay: boolean }) => {
  return (
    <Badge variant={isRelay ? 'default' : 'outline'}>
      {isRelay ? 'Relay' : 'Individual'}
    </Badge>
  );
};

const getEventStatus = (date: string): 'today' | 'upcoming' | 'past' => {
  const eventDate = new Date(date);
  const today = new Date();

  // Reset times to compare only dates
  const eventDateOnly = new Date(
    eventDate.getFullYear(),
    eventDate.getMonth(),
    eventDate.getDate()
  );
  const todayOnly = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  if (eventDateOnly.getTime() === todayOnly.getTime()) {
    return 'today';
  } else if (eventDateOnly > todayOnly) {
    return 'upcoming';
  } else {
    return 'past';
  }
};

const getStatusBadge = (status: 'today' | 'upcoming' | 'past') => {
  switch (status) {
    case 'today':
      return <Badge className="bg-green-500">Live</Badge>;
    case 'upcoming':
      return <Badge variant="secondary">Upcoming</Badge>;
    case 'past':
      return <Badge variant="outline">Completed</Badge>;
    default:
      return null;
  }
};

const TableFetchState = ({
  isLoading,
  error,
}: {
  isLoading: boolean;
  error: Error | null;
}) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span>Loading events...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-destructive">
        Error loading events: {error.message}
      </div>
    );
  }

  return (
    <div className="text-center py-8 text-muted-foreground">
      No events found
    </div>
  );
};

// Main components
const MyEventTable: React.FC<CreateEventDialogProps> = ({ t }) => {
  const { data, isLoading, error } = useMyEvents();
  console.log('API Response:', data);

  // Access events from data.data
  const events = data?.data || [];

  console.log('Events to render:', events);

  if (isLoading || error || events.length === 0) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Event Name</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Organizer</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Visibility</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell colSpan={8}>
              <TableFetchState isLoading={isLoading} error={error} />
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('Pages.Event.Tables.Name')}</TableHead>
          <TableHead>{t('Pages.Event.Tables.Date')}</TableHead>
          <TableHead>{t('Pages.Event.Tables.Location')}</TableHead>
          <TableHead>{t('Pages.Event.Tables.Organizer')}</TableHead>
          <TableHead>{t('Pages.Event.Tables.Format')}</TableHead>
          <TableHead>{t('Pages.Event.Tables.Status')}</TableHead>
          <TableHead>{t('Pages.Event.Tables.Visibility')}</TableHead>
          <TableHead className="text-right">
            {t('Pages.Event.Tables.Actions')}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event: Event) => {
          const status = getEventStatus(event.date);

          return (
            <TableRow
              key={event.id}
              className="cursor-pointer hover:bg-muted/50"
            >
              <TableCell className="font-medium">
                <Link
                  to="/events/$eventId"
                  params={{ eventId: event.id }}
                  className="hover:underline"
                >
                  {event.name}
                </Link>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  {new Date(event.date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </div>
              </TableCell>
              <TableCell>{event.location}</TableCell>
              <TableCell>{event.organizer}</TableCell>
              <TableCell>
                <EventTypeBadge isRelay={event.relay} />
              </TableCell>
              <TableCell>{getStatusBadge(status)}</TableCell>
              <TableCell>
                <VisibilityBadge isPublic={event.published} />
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={e => e.stopPropagation()}
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link
                        to="/events/$eventId"
                        params={{ eventId: event.id }}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View Event
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link
                        to="/events/$eventId/settings"
                        params={{ eventId: event.id }}
                      >
                        <Pencil className="w-4 h-4 mr-2" />
                        Edit Event
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive">
                      <Trash2 className="w-4 h-4 mr-2" />
                      {/* TODO: handleClick delete event */}
                      Delete Event
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};

const CreateEventDialog: React.FC<CreateEventDialogProps> = ({ t }) => {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          {t('Pages.Event.Operations.CreateEvent')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('Pages.Event.Operations.CreateEvent')}</DialogTitle>
          <DialogDescription>
            {t('Pages.Event.Operations.CreateDescription')}
          </DialogDescription>
        </DialogHeader>
        <EventForm
          t={t}
          renderSubmitButton={({ isSubmitting, canSubmit }) => (
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isSubmitting}
              >
                {t('Operations.Cancel', { ns: 'common' })}
              </Button>
              <Button
                type="submit"
                disabled={!canSubmit || isSubmitting}
                className="min-w-24"
              >
                {isSubmitting ? (
                  <>
                    <span className="animate-spin mr-2">⟳</span>
                    {t('Operations.Submitting', { ns: 'common' })}
                  </>
                ) : (
                  t('Operations.Create', { ns: 'common' })
                )}
              </Button>
            </div>
          )}
        />
      </DialogContent>
    </Dialog>
  );
};

// Main page component
export const MyEventsPage = () => {
  const { t } = useTranslation();

  return (
    <MainPageLayout t={t} pageName={t('Pages.Event.MyEvents')}>
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">
              {t('Pages.Event.MyEvents')}
            </h1>
            <p className="text-muted-foreground">
              {t('Pages.Event.MyEventsDescription')}
            </p>
          </div>
          <CreateEventDialog t={t} />
        </div>

        <div className="border rounded-lg">
          <MyEventTable t={t} />
        </div>
      </div>
    </MainPageLayout>
  );
};
