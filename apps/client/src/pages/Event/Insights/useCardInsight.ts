import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import type { EventCardInsight } from '@repo/shared';

export const EVENT_CARD_INSIGHT = gql`
  query EventCardInsight($eventId: String!) {
    eventCardInsight(eventId: $eventId) {
      missingCards {
        ...CardInsightRow
      }
      duplicateCards {
        card
        competitors {
          ...CardInsightRow
        }
      }
    }
  }
  fragment CardInsightRow on CardInsightCompetitor {
    id
    firstname
    lastname
    registration
    bibNumber
    classId
    className
    organisation
    card
  }
`;

export function useCardInsight(eventId: string) {
  return useQuery<{ eventCardInsight: EventCardInsight }>(EVENT_CARD_INSIGHT, {
    variables: { eventId },
    skip: !eventId,
    fetchPolicy: 'network-only',
    notifyOnNetworkStatusChange: true,
  });
}
