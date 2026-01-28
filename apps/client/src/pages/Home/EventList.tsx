import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn, formatDate, formatDateTime } from '@/lib/utils';
import { Event, EventFilter } from '@/types/event';
import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { TFunction } from 'i18next';
import { LayoutGrid, List, Loader2 } from 'lucide-react';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { Button } from '../../components/atoms';
import { EventCard } from './EventCard';
import { EventTableRow } from './EventTableRow';

interface EventListProps {
  t: TFunction;
  filter: EventFilter;
}

interface GraphQLEvent {
  id: string;
  name: string;
  organizer: string;
  date: string; // timestamp as a string
  location: string;
  country: {
    countryCode: string;
    countryName: string;
  };
  sport: {
    id: number;
    name: string;
  };
  timezone: string;
  zeroTime: string; // timestamp as a string
  classes: {
    id: number;
    name: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

interface EventsData {
  events: {
    edges: {
      node: GraphQLEvent;
      cursor: string;
    }[];
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
  };
}

interface EventsVariables {
  filter: string | null;
  first: number;
  after?: string | null;
}

type ViewMode = 'card' | 'list';

const EVENTS_QUERY = gql`
  query Events($filter: EventFilter, $first: Int!, $after: String) {
    events(input: { filter: $filter, first: $first, after: $after }) {
      edges {
        node {
          id
          name
          organizer
          date
          location
          country {
            countryCode
            countryName
          }
          sport {
            id
            name
          }
          timezone
          zeroTime
          classes {
            id
            name
          }
          createdAt
          updatedAt
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// Function for obtaining event status based on date
const getEventStatus = (
  dateTimestamp: string
): 'upcoming' | 'ongoing' | 'past' => {
  const eventDate = new Date(dateTimestamp);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const eventDay = new Date(eventDate);
  eventDay.setHours(0, 0, 0, 0);

  if (eventDay.getTime() === today.getTime()) return 'ongoing';
  if (eventDay.getTime() > today.getTime()) return 'upcoming';
  return 'past';
};

const convertGraphQLEventToEvent = (graphqlEvent: GraphQLEvent): Event => {
  const slug = graphqlEvent.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

  // Formatting data from a timestamp using formatDate from utils
  const formattedDate = formatDate(graphqlEvent.date);

  // Determining the status of an event
  const status = getEventStatus(graphqlEvent.date);

  return {
    id: graphqlEvent.id,
    slug,
    name: graphqlEvent.name,
    date: formattedDate,
    description: `${graphqlEvent.organizer} pořádá ${graphqlEvent.name} v ${graphqlEvent.location}`,
    organizer: graphqlEvent.organizer,
    location: graphqlEvent.location,
    country: {
      countryCode: graphqlEvent.country.countryCode,
      countryName: graphqlEvent.country.countryName,
    },
    latitude: 0,
    longitude: 0,
    sportId: graphqlEvent.sport.id,
    sport: graphqlEvent.sport,
    discipline: 'middle',
    zeroTime: formatDateTime(graphqlEvent.zeroTime),
    classes: graphqlEvent.classes,
    maxParticipants: 0,
    currentParticipants: 0,
    status,
    createdAt: formatDateTime(graphqlEvent.createdAt),
    updatedAt: formatDateTime(graphqlEvent.updatedAt),
    publishedAt: formatDateTime(graphqlEvent.createdAt),
    relay: false,
    ranking: false,
    published: true,
    authorId: 0,
    user: null,
  };
};

function mapFilterToGraphQL(filter: EventFilter): string | null {
  switch (filter) {
    case 'ongoing':
      return 'TODAY';
    case 'upcoming':
      return 'UPCOMING';
    case 'recent':
      return 'RECENT';
    case 'all':
    default:
      return null;
  }
}

export const EventList: React.FC<EventListProps> = ({ t, filter }) => {
  const VIEW_MODE_KEY = 'homeEventsViewMode';
  // Sentinel for infinite scroll - FIX: larger threshold and rootMargin
  const { ref, inView } = useInView({
    threshold: 0.8, // Must be visible 80% of the sentinel
    triggerOnce: false,
    rootMargin: '50px', // Larger margin - loads earlier, but only when we're close to the end
  });

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const stored = localStorage.getItem(VIEW_MODE_KEY);
      if (stored === 'card' || stored === 'list') {
        return stored;
      }
    } catch {
      // ignore storage errors
    }
    return 'card';
  });
  const [loadedEvents, setLoadedEvents] = useState<Event[]>([]);
  const [endCursor, setEndCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Controlling concurrent loading
  const loadingRef = useRef(false);
  const lastLoadTimeRef = useRef(0);

  // Scroll anchor and position restoration
  const anchorIdRef = useRef<string | null>(null);
  const prevScrollTopRef = useRef(0);
  const restoringRef = useRef(false);

  // Checking whether the user has scrolled down far enough
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const graphqlFilter = mapFilterToGraphQL(filter);

  const { data, loading, error, fetchMore } = useQuery<
    EventsData,
    EventsVariables
  >(EVENTS_QUERY, {
    variables: { filter: graphqlFilter, first: 12, after: null },
    notifyOnNetworkStatusChange: true,
    fetchPolicy: 'network-only',
  });

  // Responds to filter change – resets status
  useEffect(() => {
    setLoadedEvents([]);
    setEndCursor(null);
    setHasMore(true);
    setIsLoadingMore(false);
    loadingRef.current = false;
    restoringRef.current = false;
    anchorIdRef.current = null;
  }, [filter]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {
      // ignore storage errors
    }
  }, [viewMode]);

  // Processes data from GraphQL - the main logic for loading data
  useEffect(() => {
    if (!data?.events) return;

    const newEvents = data.events.edges.map(edge =>
      convertGraphQLEventToEvent(edge.node)
    );

    setLoadedEvents(prev => {
      // If endCursor is null, this is the first read - replace completely
      if (!endCursor) {
        return newEvents;
      }

      // Otherwise add new events and remove duplicates
      const existingIds = new Set(prev.map(e => e.id));
      const uniqueNewEvents = newEvents.filter(e => !existingIds.has(e.id));

      if (uniqueNewEvents.length === 0) return prev;
      return [...prev, ...uniqueNewEvents];
    });

    setEndCursor(data.events.pageInfo.endCursor);
    setHasMore(data.events.pageInfo.hasNextPage);
  }, [data, endCursor]);

  // After adding new events, return view to the last old item
  useLayoutEffect(() => {
    if (!restoringRef.current) return;

    const anchorId = anchorIdRef.current;
    if (!anchorId) {
      restoringRef.current = false;
      return;
    }

    const el = document.querySelector<HTMLElement>(
      `[data-event-id="${anchorId}"]`
    );
    if (el) {
      el.scrollIntoView({
        block: 'start',
        inline: 'nearest',
        behavior: 'auto',
      });
      window.scrollBy({ top: -8, left: 0, behavior: 'auto' });
    } else {
      window.scrollTo({ top: prevScrollTopRef.current, behavior: 'auto' });
    }

    restoringRef.current = false;
    anchorIdRef.current = null;
  }, [loadedEvents.length]);

  // Manual scroll position check for better UX
  useEffect(() => {
    const checkScrollPosition = () => {
      if (!hasMore || isLoadingMore || loadingRef.current || !endCursor) return;

      const scrollContainer =
        scrollContainerRef.current || document.documentElement;
      const scrollTop = scrollContainer.scrollTop;
      const scrollHeight = scrollContainer.scrollHeight;
      const clientHeight = scrollContainer.clientHeight;

      // Load only when the user is near the end (within 20% of the end)
      const scrollRatio = (scrollTop + clientHeight) / scrollHeight;

      if (scrollRatio > 0.8 && inView) {
        void handleLoadMore();
      }
    };

    // Add event listener for scroll
    const scrollElement = scrollContainerRef.current || window;
    scrollElement.addEventListener('scroll', checkScrollPosition);

    return () => {
      scrollElement.removeEventListener('scroll', checkScrollPosition);
    };
  }, [hasMore, isLoadingMore, endCursor, inView]);

  // Trigger loading more pages when scrolling down - FIX: added more conditions
  useEffect(() => {
    const timeSinceLastLoad = Date.now() - lastLoadTimeRef.current;
    const minTimeBetweenLoads = 250;

    // Stricter conditions for loading
    const shouldLoadMore =
      inView &&
      hasMore &&
      !loading &&
      !isLoadingMore &&
      !loadingRef.current &&
      endCursor &&
      timeSinceLastLoad >= minTimeBetweenLoads &&
      // Additional check - whether we are really low enough
      window.innerHeight + window.scrollY >= document.body.offsetHeight - 1000;

    if (shouldLoadMore) {
      void handleLoadMore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, hasMore, loading, isLoadingMore, endCursor]);

  const handleLoadMore = async () => {
    const timeSinceLastLoad = Date.now() - lastLoadTimeRef.current;
    const minTimeBetweenLoads = 250;

    if (
      !hasMore ||
      loading ||
      isLoadingMore ||
      loadingRef.current ||
      !endCursor ||
      timeSinceLastLoad < minTimeBetweenLoads
    ) {
      return;
    }

    // Record position for scroll recovery
    const last = loadedEvents[loadedEvents.length - 1];
    anchorIdRef.current = last ? last.id : null;
    prevScrollTopRef.current =
      window.scrollY || document.documentElement.scrollTop;
    restoringRef.current = true;

    loadingRef.current = true;
    setIsLoadingMore(true);
    lastLoadTimeRef.current = Date.now();

    try {
      await fetchMore({
        variables: {
          filter: graphqlFilter,
          first: 12,
          after: endCursor,
        },
        updateQuery: (previousResult, { fetchMoreResult }) => {
          if (!fetchMoreResult) return previousResult;

          return {
            events: {
              ...fetchMoreResult.events,
              edges: [
                ...previousResult.events.edges,
                ...fetchMoreResult.events.edges,
              ],
            },
          };
        },
      });
    } catch (err) {
      console.error('Error loading more events:', err);
      restoringRef.current = false;
    } finally {
      setTimeout(() => {
        setIsLoadingMore(false);
        loadingRef.current = false;
      }, 300);
    }
  };

  if (loading && loadedEvents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p className="text-muted-foreground">
          {t('Pages.Home.Infinite.LoadingInitial')}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center py-8">
        <p className="text-destructive">
          {t('Pages.Home.Infinite.LoadError', { message: error.message })}
        </p>
      </div>
    );
  }

  return (
    <div ref={scrollContainerRef} className="space-y-6">
      {/* Display switch */}
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">
          {t('Pages.Home.Infinite.EventsCount', {
            count: loadedEvents.length,
          })}
          {hasMore && ` • ${t('Pages.Home.Infinite.LoadingMoreInline')}`}
        </div>
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'card' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('card')}
            className="gap-2"
          >
            <LayoutGrid className="w-4 h-4" />
            <span className="hidden sm:inline">
              {t('Pages.Event.Tabs.Cards')}
            </span>
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('list')}
            className="gap-2"
          >
            <List className="w-4 h-4" />
            <span className="hidden sm:inline">
              {t('Pages.Event.Tabs.List')}
            </span>
          </Button>
        </div>
      </div>

      {/*List of events */}
      {viewMode === 'card' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loadedEvents.map((event, index) => (
            <div
              key={event.id}
              data-event-id={event.id}
              className={cn(
                'animate-in fade-in-0',
                index >= loadedEvents.length - 12 && 'duration-500'
              )}
              style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
            >
              <EventCard event={event} />
            </div>
          ))}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">
                  {t('Pages.Event.Tables.Name')}
                </TableHead>
                <TableHead className="w-[120px]">
                  {t('Pages.Event.Tables.Date')}
                </TableHead>
                <TableHead className="w-[150px]">
                  {t('Pages.Event.Tables.Location')}
                </TableHead>
                <TableHead className="w-[100px]">
                  {t('Pages.Event.Tables.Country')}
                </TableHead>
                <TableHead className="w-[100px]">
                  {t('Pages.Event.Tables.Sport')}
                </TableHead>
                <TableHead className="w-[100px]">
                  {t('Pages.Event.Tables.Status')}
                </TableHead>
                <TableHead className="w-[100px]">
                  {t('Pages.Event.Tables.Entries')}
                </TableHead>
                <TableHead className="w-[120px] text-right">
                  {t('Pages.Event.Tables.Actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadedEvents.map((event, index) => (
                <EventTableRow
                  key={event.id}
                  t={t}
                  event={event}
                  className={cn(
                    'animate-in fade-in-0',
                    index >= loadedEvents.length - 12 && 'duration-300'
                  )}
                  style={{ animationDelay: `${Math.min(index * 20, 200)}ms` }}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Sentinel for infinite scroll - FIX: increased height and better positioning */}
      {hasMore && (
        <div
          ref={ref}
          className="flex flex-col items-center justify-center py-10 text-muted-foreground"
        >
          {isLoadingMore ? (
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t('Pages.Home.Infinite.LoadingMore')}</span>
            </div>
          ) : (
            <div className="text-center text-sm">
              <span>{t('Pages.Home.Infinite.ScrollMore')}</span>
            </div>
          )}
        </div>
      )}

      {/* End of list */}
      {!hasMore && loadedEvents.length > 0 && (
        <div className="flex flex-col items-center justify-center gap-1 py-10 text-muted-foreground">
          <p className="text-sm font-medium">
            {t('Pages.Home.Infinite.AllLoaded')}
          </p>
          <p className="text-xs">
            {t('Pages.Home.Infinite.FoundCount', {
              count: loadedEvents.length,
            })}
          </p>
        </div>
      )}

      {/* Empty state */}
      {loadedEvents.length === 0 && !loading && (
        <div className="text-center py-12 space-y-2 text-muted-foreground">
          <p className="text-sm font-medium">
            {t('Pages.Home.Infinite.NoEvents')}
          </p>
          <p className="text-xs">{t('Pages.Home.Infinite.NoEventsHint')}</p>
        </div>
      )}
    </div>
  );
};
