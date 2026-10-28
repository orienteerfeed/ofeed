import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import type { EventAnomalyInsight } from '@repo/shared';

export const EVENT_ANOMALY_INSIGHT = gql`
  query EventAnomalyInsight($eventId: String!) {
    eventAnomalyInsight(eventId: $eventId) {
      competitors {
        id
        firstname
        lastname
        registration
        bibNumber
        classId
        className
        organisation
        card
        startMode
        startTime
        findings {
          type
          controlCode
          splitSeconds
          medianSeconds
          differenceSeconds
          referenceCount
          intervalSeconds
          phaseSeconds
          nearestStartTime
          punchTimes
        }
      }
      coverage {
        classId
        className
        type
        status
        evaluated
        total
      }
    }
  }
`;
export function useAnomalyInsight(eventId: string) {
  return useQuery<{ eventAnomalyInsight: EventAnomalyInsight }>(
    EVENT_ANOMALY_INSIGHT,
    {
      variables: { eventId },
      skip: !eventId,
      fetchPolicy: 'network-only',
      notifyOnNetworkStatusChange: true,
    }
  );
}
