import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { gql } from '@apollo/client';
import { useLazyQuery } from '@apollo/client/react';
import { useNavigate } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate, formatDateWithDay } from '../../lib/date';
import { Button, CountryFlag, Input } from '../atoms';

// GraphQL query
const SEARCH_EVENTS = gql`
  query SearchEvents($query: String!) {
    searchEvents(query: $query) {
      id
      name
      organizer
      location
      country {
        countryName
        countryCode
      }
      date
      published
    }
  }
`;

interface SearchEventsQuery {
  searchEvents: Array<{
    id: string;
    name: string;
    organizer?: string;
    location: string;
    country: Country;
    date: string;
    published: boolean;
  }>;
}

interface SearchEventsVariables {
  query: string;
}

interface Country {
  countryName: string;
  countryCode: string;
  __typename?: string;
}

interface Event {
  id: string;
  name: string;
  organizer?: string;
  location: string;
  country: Country;
  date: string;
  published?: boolean;
  __typename?: string;
}

interface EventSearchDialogProps {
  events?: Event[];
}

export const EventSearchDialog = ({ events = [] }: EventSearchDialogProps) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Apollo Client lazy query
  const [searchEvents, { loading, data }] = useLazyQuery<
    SearchEventsQuery,
    SearchEventsVariables
  >(SEARCH_EVENTS, {
    fetchPolicy: 'cache-first',
  });

  // Global keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        setOpen(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Focus input when dialog opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [open]);

  // Close search when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  // Handle search with debounce
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    if (searchQuery.length > 2) {
      timeoutId = setTimeout(() => {
        searchEvents({ variables: { query: searchQuery } });
      }, 300);
    }
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [searchQuery, searchEvents]);

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setSearchQuery('');
    }
  };

  const handleEventClick = (eventId: string) => {
    setOpen(false);
    setSearchQuery('');
    navigate({ to: '/events/$eventId', params: { eventId } });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  // Data from GraphQL or fallback to props
  const searchResults = data?.searchEvents || [];
  const displayEvents = searchQuery.length > 2 ? searchResults : events;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Search className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent
        className="flex max-h-[80vh] max-w-2xl flex-col overflow-hidden p-0"
        ref={searchRef}
      >
        <DialogHeader className="border-b p-6 pb-4">
          <DialogTitle className="text-lg">
            {t('Molecules.EventSearchDialog.Title')}
          </DialogTitle>
        </DialogHeader>

        <div className="p-6 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              type="search"
              placeholder={t('Molecules.EventSearchDialog.Placeholder')}
              value={searchQuery}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              className="pl-11 pr-24 py-3 text-base"
              autoFocus
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <kbd className="inline-flex h-6 items-center gap-1 rounded border bg-muted px-2 font-mono text-xs font-medium text-muted-foreground">
                {navigator.userAgent.includes('Mac') ? '⌘' : 'Ctrl'}K
              </kbd>
            </div>
          </div>

          {/* Search hints */}
          {searchQuery.length === 0 && (
            <div className="mt-3 text-sm text-muted-foreground">
              {t('Molecules.EventSearchDialog.Hint')}
            </div>
          )}
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-6 pb-6">
          {searchQuery.length > 0 ? (
            loading ? (
                <div className="py-8 text-center text-muted-foreground">
                  <div className="flex items-center justify-center gap-3">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <span className="text-sm">
                      {t('Molecules.EventSearchDialog.Searching')}
                    </span>
                  </div>
                </div>
              ) : displayEvents.length > 0 ? (
                displayEvents.map((event: Event) => (
                <button
                  key={event.id}
                  onClick={() => handleEventClick(event.id)}
                  className="block w-full rounded-lg border border-border p-4 transition-colors hover:bg-accent text-left cursor-pointer group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-base font-semibold mb-2">
                        {event.name}
                      </div>
                      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                        <div>
                          {event.location}, {event.country.countryName} •{' '}
                          {formatDate(event.date)}
                        </div>
                        {event.organizer && (
                          <div>
                            {t('Molecules.EventSearchDialog.Organizer')}:{' '}
                            {event.organizer}
                          </div>
                        )}
                        {event.published === false && (
                          <span className="text-orange-500">
                            {t('Molecules.EventSearchDialog.Draft')}
                          </span>
                        )}
                      </div>
                    </div>
                    <CountryFlag
                      countryCode={event.country.countryCode}
                      className="flex-shrink-0 mt-1"
                    />
                  </div>
                </button>
              ))
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                <div className="text-base mb-2">
                  {t('Molecules.EventSearchDialog.NoEventsFound', {
                    query: searchQuery,
                  })}
                </div>
                <div className="text-sm">
                  {t('Molecules.EventSearchDialog.NoEventsHint')}
                </div>
              </div>
            )
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {events.length > 0 ? (
                <>
                  <div className="mb-6 text-lg font-medium">
                    {t('Molecules.EventSearchDialog.RecentEvents')}
                  </div>
                  <div className="space-y-4">
                    {events.map(event => (
                      <button
                        key={event.id}
                        onClick={() => handleEventClick(event.id)}
                        className="block w-full rounded-lg border border-border p-5 transition-colors hover:bg-accent text-left cursor-pointer group"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-base font-semibold mb-2">
                              {event.name}
                            </div>
                            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                              <div>
                                {event.location}, {event.country.countryName} •{' '}
                                {formatDateWithDay(event.date)}
                              </div>
                              {event.organizer && (
                                <div>
                                  {t('Molecules.EventSearchDialog.Organizer')}:{' '}
                                  {event.organizer}
                                </div>
                              )}
                            </div>
                          </div>
                          <CountryFlag
                            countryCode={event.country.countryCode}
                            className="flex-shrink-0 mt-1"
                          />
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <div className="text-base">
                    {t('Molecules.EventSearchDialog.StartTyping')}
                  </div>
                  <div className="text-sm">
                    {t('Molecules.EventSearchDialog.StartTypingHint')}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
