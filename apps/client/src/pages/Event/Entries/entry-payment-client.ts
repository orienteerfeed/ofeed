import type { QueryClient } from '@tanstack/react-query';
import { getDeviceMetadata } from '@/stores/auth/session-manager';

export const entryPaymentsKey = (eventId: string, entryId: string) =>
  ['events', eventId, 'entries', entryId, 'payments'] as const;
export const paymentInsightsKey = (eventId: string) =>
  ['events', eventId, 'insights', 'payments'] as const;

export function getEntryPaymentDeviceId() {
  return (
    window.localStorage
      .getItem('orienteerfeed:entry-payments:device-id')
      ?.trim() || getDeviceMetadata().deviceId
  );
}

/** Refresh the shared receipt/report caches after either a GraphQL or REST write. */
export async function refreshEntryPaymentQueries(
  client: QueryClient,
  eventId: string,
  entryId: string
) {
  await Promise.all([
    client.invalidateQueries({ queryKey: entryPaymentsKey(eventId, entryId) }),
    client.invalidateQueries({ queryKey: paymentInsightsKey(eventId) }),
  ]);
}
