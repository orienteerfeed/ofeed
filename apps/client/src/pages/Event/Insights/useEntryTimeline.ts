import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import type { EventEntryTimeline } from '@repo/shared';

export const EVENT_ENTRY_TIMELINE = gql`
  query EventEntryTimeline($eventId: String!) {
    eventEntryTimeline(eventId: $eventId) {
      eventName
      location
      startAt
      orders {
        id
        receivedAt
        status
        paymentReference
        paymentMethod
        currency
        totalAmount
        receivedAmount
        outstandingAmount
        legacyPaid
        paid
        promoCode
        promoDiscountAmount
        items {
          id
          classId
          className
          firstname
          lastname
          organisation
          card
          cardRental
          amount
        }
      }
      timezone
      entriesOpenOn
      entriesCloseOn
      eventOn
      days {
        date
        classId
        className
        entries
        lateEntries
      }
    }
  }
`;

export function useEntryTimeline(eventId: string) {
  return useQuery<{ eventEntryTimeline: EventEntryTimeline }>(
    EVENT_ENTRY_TIMELINE,
    {
      variables: { eventId },
      skip: !eventId,
      fetchPolicy: 'network-only',
      notifyOnNetworkStatusChange: true,
    }
  );
}
