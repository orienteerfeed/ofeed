import { gql } from '@apollo/client';
import { useApolloClient, useSubscription } from '@apollo/client/react';
import { useEffect, useRef, useState } from 'react';
import { hasResultData, type LiveFeedRow } from './live-feed.utils';

const POLL_INTERVAL_MS = 60000;
const HIGHLIGHT_DURATION_MS = 10000;

const LIVE_FEED_FIELDS = gql`
  fragment LiveFeedFields on Competitor {
    id
    firstname
    lastname
    registration
    organisation
    organisationId
    status
    time
    finishTime
    updatedAt
    leg
    teamId
    class {
      id
      name
      resultListMode
    }
  }
`;

const RESULT_FEED = gql`
  query ResultFeedByEvent($eventId: String!) {
    resultFeedByEvent(eventId: $eventId) {
      ...LiveFeedFields
    }
  }
  ${LIVE_FEED_FIELDS}
`;

const COMPETITOR_UPDATED = gql`
  subscription CompetitorUpdatedFeed($eventId: String!) {
    competitorUpdated(eventId: $eventId) {
      ...LiveFeedFields
    }
  }
  ${LIVE_FEED_FIELDS}
`;

function applyUpdate(rows: Map<number, LiveFeedRow>, row: LiveFeedRow) {
  const previous = rows.get(row.id);
  if (previous && Date.parse(previous.updatedAt) > Date.parse(row.updatedAt))
    return;
  if (hasResultData(row.status)) rows.set(row.id, row);
  else rows.delete(row.id);
}

/** Mount once per event. Snapshots remove absent rows; live changes received
 * during a request are replayed so an older snapshot cannot undo them. */
export function useLiveResultFeed(eventId: string) {
  const client = useApolloClient();
  const [rows, setRows] = useState<ReadonlyMap<number, LiveFeedRow>>(new Map());
  const [highlighted, setHighlighted] = useState<ReadonlySet<number>>(
    new Set()
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();
  const pendingUpdates = useRef(new Map<number, LiveFeedRow>());
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    let active = true;
    let fetching = false;
    const highlightTimers = timers.current;

    const refresh = async () => {
      if (fetching) return;
      fetching = true;
      pendingUpdates.current.clear();
      try {
        // Keep snapshots independent of normalized subscription cache writes.
        const result = await client.query<{ resultFeedByEvent: LiveFeedRow[] }>(
          {
            query: RESULT_FEED,
            variables: { eventId },
            fetchPolicy: 'no-cache',
          }
        );
        if (!active) return;
        if (!result.data) throw new Error('Missing result feed snapshot');
        const next = new Map<number, LiveFeedRow>();
        for (const row of result.data.resultFeedByEvent) applyUpdate(next, row);
        for (const row of pendingUpdates.current.values())
          applyUpdate(next, row);
        setRows(next);
        setError(undefined);
      } catch (cause) {
        if (active)
          setError(cause instanceof Error ? cause : new Error(String(cause)));
      } finally {
        if (active) setLoading(false);
        fetching = false;
      }
    };

    void refresh();
    // IOF batch imports publish class-level events, so poll as a safety net.
    const pollTimer = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(pollTimer);
      for (const timer of highlightTimers.values()) clearTimeout(timer);
      highlightTimers.clear();
    };
  }, [client, eventId]);

  useSubscription<{ competitorUpdated: LiveFeedRow | null }>(
    COMPETITOR_UPDATED,
    {
      variables: { eventId },
      fetchPolicy: 'no-cache',
      ignoreResults: true,
      onData: ({ data }) => {
        const row = data.data?.competitorUpdated;
        if (!row) return;
        const previous = pendingUpdates.current.get(row.id);
        if (
          previous &&
          Date.parse(previous.updatedAt) > Date.parse(row.updatedAt)
        )
          return;
        pendingUpdates.current.set(row.id, row);
        setRows(previousRows => {
          const next = new Map(previousRows);
          applyUpdate(next, row);
          return next;
        });

        clearTimeout(timers.current.get(row.id));
        timers.current.delete(row.id);
        setHighlighted(previousIds => {
          const next = new Set(previousIds);
          if (hasResultData(row.status)) next.add(row.id);
          else next.delete(row.id);
          return next;
        });
        if (hasResultData(row.status)) {
          timers.current.set(
            row.id,
            setTimeout(() => {
              timers.current.delete(row.id);
              setHighlighted(previousIds => {
                const next = new Set(previousIds);
                next.delete(row.id);
                return next;
              });
            }, HIGHLIGHT_DURATION_MS)
          );
        }
      },
    }
  );

  return { rows, highlighted, loading, error };
}
