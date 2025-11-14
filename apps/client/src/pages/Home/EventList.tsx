import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn, formatDate } from '@/lib/utils';
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
  date: string; // timestamp jako string
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
  zeroTime: string; // timestamp jako string
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

// Funkce pro získání statusu události na základě data
const getEventStatus = (
  dateTimestamp: string
): 'upcoming' | 'ongoing' | 'past' => {
  const eventDate = new Date(parseInt(dateTimestamp));
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

  // Formátování data z timestampu pomocí formatDate z utils
  const formattedDate = formatDate(new Date(parseInt(graphqlEvent.date, 10)));

  // Určení statusu události
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
    zeroTime: formatDate(parseInt(graphqlEvent.zeroTime)),
    classes: graphqlEvent.classes,
    maxParticipants: 0,
    currentParticipants: 0,
    status,
    createdAt: formatDate(parseInt(graphqlEvent.createdAt)),
    updatedAt: formatDate(parseInt(graphqlEvent.updatedAt)),
    publishedAt: formatDate(parseInt(graphqlEvent.createdAt)),
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
  // Sentinel pro infinite scroll - OPRAVA: větší threshold a rootMargin
  const { ref, inView } = useInView({
    threshold: 0.8, // Musí být vidět 80% sentinelu
    triggerOnce: false,
    rootMargin: '50px', // Větší margin - načte se dříve, ale až když jsme blízko konce
  });

  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [loadedEvents, setLoadedEvents] = useState<Event[]>([]);
  const [endCursor, setEndCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Řízení konkurenčního načítání
  const loadingRef = useRef(false);
  const lastLoadTimeRef = useRef(0);

  // Scroll kotva a obnova pozice
  const anchorIdRef = useRef<string | null>(null);
  const prevScrollTopRef = useRef(0);
  const restoringRef = useRef(false);

  // Sledování, zda uživatel doscrolloval dostatečně nízko
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

  // Reaguje na změnu filtru – resetuje stav
  useEffect(() => {
    setLoadedEvents([]);
    setEndCursor(null);
    setHasMore(true);
    setIsLoadingMore(false);
    loadingRef.current = false;
    restoringRef.current = false;
    anchorIdRef.current = null;
  }, [filter]);

  // Zpracuje data z GraphQL - hlavní logika pro načítání dat
  useEffect(() => {
    if (!data?.events) return;

    const newEvents = data.events.edges.map(edge =>
      convertGraphQLEventToEvent(edge.node)
    );

    setLoadedEvents(prev => {
      // Pokud je endCursor null, jedná se o první načtení - kompletně nahradit
      if (!endCursor) {
        return newEvents;
      }

      // Jinak přidat nové události a odstranit duplicity
      const existingIds = new Set(prev.map(e => e.id));
      const uniqueNewEvents = newEvents.filter(e => !existingIds.has(e.id));

      if (uniqueNewEvents.length === 0) return prev;
      return [...prev, ...uniqueNewEvents];
    });

    setEndCursor(data.events.pageInfo.endCursor);
    setHasMore(data.events.pageInfo.hasNextPage);
  }, [data, endCursor]);

  // Po přidání nových událostí vrať pohled na poslední starou položku
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

  // Manuální kontrola scroll pozice pro lepší UX
  useEffect(() => {
    const checkScrollPosition = () => {
      if (!hasMore || isLoadingMore || loadingRef.current || !endCursor) return;

      const scrollContainer =
        scrollContainerRef.current || document.documentElement;
      const scrollTop = scrollContainer.scrollTop;
      const scrollHeight = scrollContainer.scrollHeight;
      const clientHeight = scrollContainer.clientHeight;

      // Načítat pouze když je uživatel blízko konce (do 20% od konce)
      const scrollRatio = (scrollTop + clientHeight) / scrollHeight;

      if (scrollRatio > 0.8 && inView) {
        void handleLoadMore();
      }
    };

    // Přidat event listener pro scroll
    const scrollElement = scrollContainerRef.current || window;
    scrollElement.addEventListener('scroll', checkScrollPosition);

    return () => {
      scrollElement.removeEventListener('scroll', checkScrollPosition);
    };
  }, [hasMore, isLoadingMore, endCursor, inView]);

  // Trigger načítání další stránky při doscrollování dolů - OPRAVA: přidáno více podmínek
  useEffect(() => {
    const timeSinceLastLoad = Date.now() - lastLoadTimeRef.current;
    const minTimeBetweenLoads = 250;

    // Přísnější podmínky pro načítání
    const shouldLoadMore =
      inView &&
      hasMore &&
      !loading &&
      !isLoadingMore &&
      !loadingRef.current &&
      endCursor &&
      timeSinceLastLoad >= minTimeBetweenLoads &&
      // Dodatečná kontrola - zda jsme skutečně dost nízko
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

    // Zaznamenat pozici pro obnovení scrollu
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
        <p className="text-muted-foreground">Načítám události...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center py-8">
        <p className="text-destructive">
          Chyba při načítání událostí: {error.message}
        </p>
      </div>
    );
  }

  return (
    <div ref={scrollContainerRef} className="space-y-6">
      {/* Přepínač zobrazení */}
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">
          {loadedEvents.length} událostí
          {hasMore && ' • Načítají se další...'}
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

      {/* Výpis událostí */}
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

      {/* Sentinel pro infinite scroll - OPRAVA: větší výška a lepší pozice */}
      {hasMore && (
        <div
          ref={ref}
          className="flex justify-center items-center py-12 transition-opacity duration-300"
          style={{
            minHeight: '200px', // Větší výška pro lepší detekci
            marginBottom: '100px',
          }}
        >
          {isLoadingMore ? (
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-sm">Načítám další události...</span>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                Scrollujte dolů pro více událostí
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Zobrazí se, když budete blízko konce
              </p>
            </div>
          )}
        </div>
      )}

      {/* Konec seznamu */}
      {!hasMore && loadedEvents.length > 0 && (
        <div className="text-center text-muted-foreground py-12 border-t">
          <p className="text-lg">✓ Všechny události načteny</p>
          <p className="text-sm mt-2">
            Našli jste {loadedEvents.length} událostí
          </p>
        </div>
      )}

      {/* Prázdný stav */}
      {loadedEvents.length === 0 && !loading && (
        <div className="text-center py-12 space-y-3">
          <p className="text-muted-foreground">Žádné události nenalezeny</p>
          <p className="text-sm text-muted-foreground">
            Zkuste změnit filtr nebo se podívejte později.
          </p>
        </div>
      )}
    </div>
  );
};
