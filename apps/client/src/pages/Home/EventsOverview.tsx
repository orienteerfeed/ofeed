import { config } from '@/config';
import { useQuery } from '@apollo/client/react';
import { TFunction } from 'i18next';
import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import { useInView } from 'react-intersection-observer';
import {
  EventCollection,
  EventListEmptyState,
  EventListEndState,
  EventListErrorState,
  EventListInitialLoadingState,
  EventListPaginationState,
  EventViewModeSwitcher,
} from './EventListDisplay';
import {
  appendUniqueEvents,
  mapGraphQLEventsToHomeEvents,
  mergeUniqueEvents,
} from './eventListUtils';
import {
  EVENTS_QUERY,
  type EventsData,
  type EventsVariables,
} from './eventsGql';
import type { HomeEventListItem } from './types';
import { useEventListViewMode } from './useEventListViewMode';

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

  const [viewMode, setViewMode] = useEventListViewMode(mapViewEnabled);

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
  const {
    data: todayData,
    loading: todayLoading,
    error: todayError,
  } = useQuery<
    EventsData,
    EventsVariables
  >(EVENTS_QUERY, {
    variables: { filter: 'TODAY', first: 50, after: null },
    fetchPolicy: 'network-only',
  });

  // Upcoming: first 8 as preview
  const {
    data: upcomingData,
    loading: upcomingLoading,
    error: upcomingError,
  } = useQuery<
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
    error: recentError,
    fetchMore,
  } = useQuery<EventsData, EventsVariables>(EVENTS_QUERY, {
    variables: { filter: 'RECENT', first: 8, after: null },
    fetchPolicy: 'network-only',
    notifyOnNetworkStatusChange: true,
  });

  // Process recent data (initial load and fetchMore updates)
  useEffect(() => {
    if (!recentData?.events) return;

    const newEvents = mapGraphQLEventsToHomeEvents(recentData.events);

    setRecentEvents(prev => {
      if (!recentEndCursor) return newEvents;
      return appendUniqueEvents(prev, newEvents);
    });

    setRecentEndCursor(recentData.events.pageInfo.endCursor);
    setRecentHasMore(recentData.events.pageInfo.hasNextPage);
    recentEndCursorRef.current = recentData.events.pageInfo.endCursor;
    recentHasMoreRef.current = recentData.events.pageInfo.hasNextPage;
  }, [recentData, recentEndCursor]);

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

  const todayEvents = mapGraphQLEventsToHomeEvents(todayData?.events);
  const upcomingEvents = mapGraphQLEventsToHomeEvents(upcomingData?.events);

  // Flat merged list: today → upcoming → recent (deduplicated)
  const allEvents = mergeUniqueEvents([
    ...todayEvents,
    ...upcomingEvents,
    ...recentEvents,
  ]);

  const isInitialLoading =
    (todayLoading && todayEvents.length === 0) ||
    (upcomingLoading && upcomingEvents.length === 0) ||
    (recentLoading && recentEvents.length === 0);

  const error = todayError ?? upcomingError ?? recentError;
  const showAllLink = allEvents.length > 0;

  if (error) {
    return <EventListErrorState message={error.message} t={t} />;
  }

  return (
    <div className="space-y-4">
      {/* Toolbar: "see all" links left, view mode switcher right — matches EventList layout */}
      <div className="flex justify-between items-center">
        <div className="flex gap-4">
          {showAllLink && (
            <button
              onClick={() => onTabChange('all')}
              className="text-xs font-mono text-muted-foreground hover:underline cursor-pointer"
            >
              {t('Pages.Event.Overview.SeeAll')} →
            </button>
          )}
        </div>

        <EventViewModeSwitcher
          mapViewEnabled={mapViewEnabled}
          onViewModeChange={setViewMode}
          t={t}
          viewMode={viewMode}
        />
      </div>

      {/* Initial loading spinner */}
      {isInitialLoading && allEvents.length === 0 && (
        <EventListInitialLoadingState t={t} />
      )}

      {/* Events: card / list / map */}
      <EventCollection
        events={allEvents}
        mapViewEnabled={mapViewEnabled}
        t={t}
        viewMode={viewMode}
      />

      {/* Infinite scroll sentinel */}
      {recentHasMore && viewMode !== 'map' && (
        <EventListPaginationState
          isLoadingMore={isLoadingMore}
          sentinelRef={sentinelRef}
          t={t}
        />
      )}

      {/* End of list */}
      {!recentHasMore && allEvents.length > 0 && viewMode !== 'map' && (
        <EventListEndState count={allEvents.length} t={t} />
      )}

      {/* Empty state */}
      {allEvents.length === 0 && !isInitialLoading && (
        <EventListEmptyState t={t} />
      )}
    </div>
  );
};
