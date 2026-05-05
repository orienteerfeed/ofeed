import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { config } from '@/config';
import { cn } from '@/lib/utils';
import { useQuery } from '@apollo/client/react';
import { TFunction } from 'i18next';
import { LayoutGrid, List, Loader2, Map } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import { useInView } from 'react-intersection-observer';
import { Button } from '../../components/atoms';
import { EventCard } from './EventCard';
import { EventMapView } from './EventMapView';
import { EventTableRow } from './EventTableRow';
import {
  EVENTS_QUERY,
  convertGraphQLEventToHomeEvent,
  type EventsData,
  type EventsVariables,
} from './eventsGql';
import type { HomeEventListItem } from './types';

const VIEW_MODE_KEY = 'homeEventsViewMode';
const DEFAULT_VIEW_MODE: Exclude<ViewMode, 'map'> = 'card';

type ViewMode = 'card' | 'list' | 'map';

function isViewMode(value: string | null): value is ViewMode {
  return value === 'card' || value === 'list' || value === 'map';
}

function resolveInitialViewMode(mapViewEnabled: boolean): ViewMode {
  try {
    const stored = localStorage.getItem(VIEW_MODE_KEY);
    if (isViewMode(stored)) {
      if (!mapViewEnabled && stored === 'map') return DEFAULT_VIEW_MODE;
      return stored;
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_VIEW_MODE;
}

interface EventsOverviewProps {
  t: TFunction;
  onTabChange: (tab: string) => void;
}

export const EventsOverview: FC<EventsOverviewProps> = ({ t, onTabChange }) => {
  const mapViewEnabled = config.ENABLE_MAP_VIEW;

  const { ref: sentinelRef, inView } = useInView({
    threshold: 0.8,
    triggerOnce: false,
    rootMargin: '50px',
  });

  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    resolveInitialViewMode(mapViewEnabled)
  );

  // Persisted recent events for infinite scroll
  const [recentEvents, setRecentEvents] = useState<HomeEventListItem[]>([]);
  const [recentEndCursor, setRecentEndCursor] = useState<string | null>(null);
  const [recentHasMore, setRecentHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadingRef = useRef(false);
  const lastLoadTimeRef = useRef(0);
  const recentEndCursorRef = useRef<string | null>(null);
  const recentHasMoreRef = useRef(true);

  // Today: up to 50 (today events are typically few)
  const { data: todayData, loading: todayLoading } = useQuery<
    EventsData,
    EventsVariables
  >(EVENTS_QUERY, {
    variables: { filter: 'TODAY', first: 50, after: null },
    fetchPolicy: 'network-only',
  });

  // Upcoming: first 8 as preview
  const { data: upcomingData, loading: upcomingLoading } = useQuery<
    EventsData,
    EventsVariables
  >(EVENTS_QUERY, {
    variables: { filter: 'UPCOMING', first: 8, after: null },
    fetchPolicy: 'network-only',
  });

  // Recent: initial 8, then infinite scroll to the past
  const {
    data: recentData,
    loading: recentLoading,
    fetchMore,
  } = useQuery<EventsData, EventsVariables>(EVENTS_QUERY, {
    variables: { filter: 'RECENT', first: 8, after: null },
    fetchPolicy: 'network-only',
    notifyOnNetworkStatusChange: true,
  });

  // Process recent data (initial load and fetchMore updates)
  useEffect(() => {
    if (!recentData?.events) return;

    const newEvents = recentData.events.edges.map(e =>
      convertGraphQLEventToHomeEvent(e.node)
    );

    setRecentEvents(prev => {
      if (!recentEndCursor) return newEvents;
      const existingIds = new Set(prev.map(e => e.id));
      const unique = newEvents.filter(e => !existingIds.has(e.id));
      return unique.length === 0 ? prev : [...prev, ...unique];
    });

    setRecentEndCursor(recentData.events.pageInfo.endCursor);
    setRecentHasMore(recentData.events.pageInfo.hasNextPage);
    recentEndCursorRef.current = recentData.events.pageInfo.endCursor;
    recentHasMoreRef.current = recentData.events.pageInfo.hasNextPage;
  }, [recentData, recentEndCursor]);

  useEffect(() => {
    if (!mapViewEnabled && viewMode === 'map') setViewMode(DEFAULT_VIEW_MODE);
  }, [mapViewEnabled, viewMode]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {
      // ignore storage errors
    }
  }, [viewMode]);

  const fetchMoreRecent = useCallback(async () => {
    const cursor = recentEndCursorRef.current;
    if (!cursor) return;

    loadingRef.current = true;
    setIsLoadingMore(true);
    lastLoadTimeRef.current = Date.now();

    try {
      await fetchMore({
        variables: { filter: 'RECENT', first: 12, after: cursor },
        updateQuery: (prev, { fetchMoreResult }) => {
          if (!fetchMoreResult) return prev;
          return {
            events: {
              ...fetchMoreResult.events,
              edges: [...prev.events.edges, ...fetchMoreResult.events.edges],
            },
          };
        },
      });
    } catch (err) {
      console.error('Error loading more events:', err);
    } finally {
      loadingRef.current = false;
      setIsLoadingMore(false);
    }
  }, [fetchMore]);

  // Infinite scroll trigger (list/card modes)
  useEffect(() => {
    if (viewMode === 'map') return;

    const timeSinceLastLoad = Date.now() - lastLoadTimeRef.current;
    const shouldLoad =
      inView &&
      recentHasMore &&
      !recentLoading &&
      !isLoadingMore &&
      !loadingRef.current &&
      recentEndCursor &&
      timeSinceLastLoad >= 250 &&
      window.innerHeight + window.scrollY >= document.body.offsetHeight - 1000;

    if (shouldLoad) void fetchMoreRecent();
  }, [
    inView,
    recentHasMore,
    recentLoading,
    isLoadingMore,
    recentEndCursor,
    viewMode,
    fetchMoreRecent,
  ]);

  // Map mode: preload all pages so every marker is visible
  useEffect(() => {
    if (
      viewMode !== 'map' ||
      recentLoading ||
      loadingRef.current ||
      !recentHasMoreRef.current ||
      !recentEndCursorRef.current
    )
      return;

    void fetchMoreRecent();
  }, [viewMode, recentLoading, fetchMoreRecent]);

  const todayEvents =
    todayData?.events.edges.map(e => convertGraphQLEventToHomeEvent(e.node)) ??
    [];
  const upcomingEvents =
    upcomingData?.events.edges.map(e =>
      convertGraphQLEventToHomeEvent(e.node)
    ) ?? [];

  // Flat merged list: today → upcoming → recent (deduplicated)
  const allEvents = [...todayEvents, ...upcomingEvents, ...recentEvents].filter(
    (event, idx, self) => self.findIndex(e => e.id === event.id) === idx
  );

  const isInitialLoading =
    (todayLoading && todayEvents.length === 0) ||
    (upcomingLoading && upcomingEvents.length === 0) ||
    (recentLoading && recentEvents.length === 0);

  const showUpcomingLink = upcomingEvents.length > 0;
  const showRecentLink = recentEvents.length > 0;

  return (
    <div className="space-y-4">
      {/* Toolbar: "see all" links left, view mode switcher right — matches EventList layout */}
      <div className="flex justify-between items-center">
        <div className="flex gap-4">
          {showUpcomingLink && (
            <button
              onClick={() => onTabChange('upcoming')}
              className="text-xs font-mono text-muted-foreground hover:underline cursror-pointer"
            >
              {t('Pages.Event.Overview.SeeAll')}{' '}
              {t('Pages.Event.Tabs.Upcoming').toLowerCase()} →
            </button>
          )}
          {showRecentLink && (
            <button
              onClick={() => onTabChange('recent')}
              className="text-xs font-mono text-muted-foreground hover:underline cursor-pointer"
            >
              {t('Pages.Event.Overview.SeeAll')}{' '}
              {t('Pages.Event.Tabs.Recent').toLowerCase()} →
            </button>
          )}
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
          {mapViewEnabled && (
            <Button
              variant={viewMode === 'map' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('map')}
              className="gap-2"
            >
              <Map className="w-4 h-4" />
              <span className="hidden sm:inline">
                {t('Pages.Event.Tabs.Map', { defaultValue: 'Map' })}
              </span>
            </Button>
          )}
        </div>
      </div>

      {/* Initial loading spinner */}
      {isInitialLoading && allEvents.length === 0 && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Events: card / list / map */}
      {viewMode === 'card' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {allEvents.map((event, index) => (
            <div
              key={event.id}
              data-event-id={event.id}
              className={cn(
                'animate-in fade-in-0',
                index >= allEvents.length - 12 && 'duration-500'
              )}
              style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
            >
              <EventCard event={event} />
            </div>
          ))}
        </div>
      ) : viewMode === 'list' ? (
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
              {allEvents.map((event, index) => (
                <EventTableRow
                  key={event.id}
                  t={t}
                  event={event}
                  className={cn(
                    'animate-in fade-in-0',
                    index >= allEvents.length - 12 && 'duration-300'
                  )}
                  style={{ animationDelay: `${Math.min(index * 20, 200)}ms` }}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      ) : mapViewEnabled ? (
        <EventMapView events={allEvents} t={t} />
      ) : null}

      {/* Infinite scroll sentinel */}
      {recentHasMore && viewMode !== 'map' && (
        <div
          ref={sentinelRef}
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
      {!recentHasMore && allEvents.length > 0 && viewMode !== 'map' && (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
          <p className="text-sm font-mono font-medium">
            {t('Pages.Home.Infinite.AllLoaded')}
          </p>
          <p className="text-xs font-mono">
            {t('Pages.Home.Infinite.FoundCount', { count: allEvents.length })}
          </p>
        </div>
      )}

      {/* Empty state */}
      {allEvents.length === 0 && !isInitialLoading && (
        <div className="text-center py-12 space-y-1 text-muted-foreground">
          <p className="text-sm font-mono font-medium">
            {t('Pages.Home.Infinite.NoEvents')}
          </p>
          <p className="text-xs font-mono">
            {t('Pages.Home.Infinite.NoEventsHint')}
          </p>
        </div>
      )}
    </div>
  );
};
