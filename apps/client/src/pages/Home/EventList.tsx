import { config } from '@/config';
import type { EventFilter } from '@/types/event';
import { useQuery } from '@apollo/client/react';
import { TFunction } from 'i18next';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FC,
} from 'react';
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
  mapFilterToGraphQL,
  mapGraphQLEventsToHomeEvents,
} from './eventListUtils';
import {
  EVENTS_QUERY,
  type EventsData,
  type EventsVariables,
} from './eventsGql';
import type { HomeEventListItem } from './types';
import { useEventListViewMode } from './useEventListViewMode';

interface EventListProps {
  t: TFunction;
  filter: EventFilter;
}

export const EventList: FC<EventListProps> = ({ t, filter }) => {
  const mapViewEnabled = config.ENABLE_MAP_VIEW;
  // Sentinel for infinite scroll - FIX: larger threshold and rootMargin
  const { ref, inView } = useInView({
    threshold: 0.8, // Must be visible 80% of the sentinel
    triggerOnce: false,
    rootMargin: '50px', // Larger margin - loads earlier, but only when we're close to the end
  });

  const [viewMode, setViewMode] = useEventListViewMode(mapViewEnabled);
  const [loadedEvents, setLoadedEvents] = useState<HomeEventListItem[]>([]);
  const [endCursor, setEndCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const endCursorRef = useRef<string | null>(null);
  const hasMoreRef = useRef(true);

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
    endCursorRef.current = null;
    hasMoreRef.current = true;
    loadingRef.current = false;
    restoringRef.current = false;
    anchorIdRef.current = null;
  }, [filter]);

  useEffect(() => {
    endCursorRef.current = endCursor;
  }, [endCursor]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  // Processes data from GraphQL - the main logic for loading data
  useEffect(() => {
    if (!data?.events) return;

    const newEvents = mapGraphQLEventsToHomeEvents(data.events);

    setLoadedEvents(prev => {
      // If endCursor is null, this is the first read - replace completely
      if (!endCursor) {
        return newEvents;
      }

      // Otherwise add new events and remove duplicates
      return appendUniqueEvents(prev, newEvents);
    });

    setEndCursor(data.events.pageInfo.endCursor);
    setHasMore(data.events.pageInfo.hasNextPage);
    endCursorRef.current = data.events.pageInfo.endCursor;
    hasMoreRef.current = data.events.pageInfo.hasNextPage;
  }, [data, endCursor]);

  const fetchMorePage = useCallback(
    async (
      cursor: string
    ): Promise<EventsData['events']['pageInfo'] | null> => {
      const result = await fetchMore({
        variables: {
          filter: graphqlFilter,
          first: 12,
          after: cursor,
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

      return result.data?.events?.pageInfo ?? null;
    },
    [fetchMore, graphqlFilter]
  );

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
    if (viewMode === 'map') {
      return;
    }

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
  }, [hasMore, isLoadingMore, endCursor, inView, viewMode]);

  // Trigger loading more pages when scrolling down - FIX: added more conditions
  useEffect(() => {
    const timeSinceLastLoad = Date.now() - lastLoadTimeRef.current;
    const minTimeBetweenLoads = 250;

    // Stricter conditions for loading
    const shouldLoadMore =
      viewMode !== 'map' &&
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
  }, [inView, hasMore, loading, isLoadingMore, endCursor, viewMode]);

  // In map mode, preload all pages so all event markers can be shown at once.
  useEffect(() => {
    if (
      viewMode !== 'map' ||
      loading ||
      Boolean(error) ||
      loadingRef.current ||
      !hasMoreRef.current ||
      !endCursorRef.current
    ) {
      return;
    }

    let cancelled = false;

    const loadAllEventsForMap = async () => {
      while (
        !cancelled &&
        hasMoreRef.current &&
        Boolean(endCursorRef.current) &&
        !loadingRef.current
      ) {
        const cursor = endCursorRef.current;
        if (!cursor) {
          break;
        }

        loadingRef.current = true;
        setIsLoadingMore(true);
        lastLoadTimeRef.current = Date.now();

        try {
          const pageInfo = await fetchMorePage(cursor);
          if (!pageInfo) {
            break;
          }

          hasMoreRef.current = pageInfo.hasNextPage;
          endCursorRef.current = pageInfo.endCursor;
          setHasMore(pageInfo.hasNextPage);
          setEndCursor(pageInfo.endCursor);
        } catch (err) {
          console.error('Error preloading events for map view:', err);
          break;
        } finally {
          loadingRef.current = false;
          setIsLoadingMore(false);
        }
      }
    };

    void loadAllEventsForMap();

    return () => {
      cancelled = true;
    };
  }, [viewMode, loading, error, fetchMorePage]);

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
      await fetchMorePage(endCursor);
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
    return <EventListInitialLoadingState showLabel t={t} />;
  }

  if (error) {
    return <EventListErrorState message={error.message} t={t} />;
  }

  return (
    <div ref={scrollContainerRef} className="space-y-6">
      {/* Display switch */}
      <div className="flex justify-between items-center">
        <div className="text-xs font-mono text-muted-foreground">
          {t('Pages.Home.Infinite.EventsCount', {
            count: loadedEvents.length,
          })}
          {hasMore && ` • ${t('Pages.Home.Infinite.LoadingMoreInline')}`}
        </div>
        <EventViewModeSwitcher
          mapViewEnabled={mapViewEnabled}
          onViewModeChange={setViewMode}
          t={t}
          viewMode={viewMode}
        />
      </div>

      {/*List of events */}
      <EventCollection
        events={loadedEvents}
        mapViewEnabled={mapViewEnabled}
        t={t}
        viewMode={viewMode}
      />

      {/* Sentinel for infinite scroll - FIX: increased height and better positioning */}
      {hasMore && (
        <EventListPaginationState
          isLoadingMore={isLoadingMore}
          sentinelRef={ref}
          t={t}
        />
      )}

      {/* End of list */}
      {!hasMore && loadedEvents.length > 0 && (
        <EventListEndState count={loadedEvents.length} t={t} />
      )}

      {/* Empty state */}
      {loadedEvents.length === 0 && !loading && <EventListEmptyState t={t} />}
    </div>
  );
};
