import {
  entryOrderSchema,
  availableEventPaymentMethodSchema,
  eventEntryAvailabilitySchema,
  eventEntryStatsSchema,
  type CreateEntryOrderInput,
  type EntryOrder,
  type AvailableEventPaymentMethod,
  type EventEntryAvailability,
  type EventEntryStats,
  createEntryPaymentInputSchema,
  entryPaymentRecordSchema,
  type CreateEntryPaymentInput,
  type EntryPaymentRecord,
} from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from '@/hooks/useApi';
import { ENDPOINTS } from '@/lib/api/endpoints';

interface EnvelopeData<T> {
  data: T;
}

export function useEntryPayments(
  eventId: string,
  entryId: string,
  enabled = true
) {
  const api = useApi();
  return useQuery<EntryPaymentRecord[]>({
    queryKey: ['events', eventId, 'entries', entryId, 'payments'],
    queryFn: async () => {
      const response = await api.get<EnvelopeData<unknown>>(
        ENDPOINTS.eventPayments(eventId, { entryId })
      );
      return entryPaymentRecordSchema.array().parse(response.data);
    },
    enabled: enabled && !!eventId && !!entryId,
  });
}

export function useRecordEntryPayment() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<
    EntryPaymentRecord,
    Error,
    { eventId: string; entryId: string; payment: CreateEntryPaymentInput }
  >({
    mutationFn: async ({ eventId, entryId, payment }) => {
      const input = createEntryPaymentInputSchema.parse(payment);
      const response = await api.post<EnvelopeData<unknown>>(
        ENDPOINTS.entryPayments(eventId, entryId),
        input
      );
      return entryPaymentRecordSchema.parse(response.data);
    },
    onSuccess: (_payment, { eventId, entryId }) => {
      queryClient.invalidateQueries({
        queryKey: ['events', eventId, 'entries', entryId, 'payments'],
      });
    },
  });
}

export function useEventEntryAvailability(eventId: string, enabled = true) {
  const api = useApi();
  return useQuery<EventEntryAvailability>({
    queryKey: ['events', eventId, 'entry-availability'],
    queryFn: async () => {
      const response = await api.get<EnvelopeData<unknown>>(
        ENDPOINTS.eventEntryAvailability(eventId),
        { skipAuth: true }
      );
      return eventEntryAvailabilitySchema.parse(response.data);
    },
    enabled: enabled && !!eventId,
  });
}

export function useEventEntryStats(eventId: string, enabled = true) {
  const api = useApi();
  return useQuery<EventEntryStats>({
    queryKey: ['events', eventId, 'entry-stats'],
    queryFn: async () => {
      const response = await api.get<EnvelopeData<unknown>>(
        ENDPOINTS.eventEntryStats(eventId),
        { skipAuth: true }
      );
      return eventEntryStatsSchema.parse(response.data);
    },
    enabled: enabled && !!eventId,
  });
}

export function useEventEntryPaymentMethods(eventId: string, enabled = true) {
  const api = useApi();
  return useQuery<AvailableEventPaymentMethod[]>({
    queryKey: ['events', eventId, 'entry-payment-methods'],
    queryFn: async () => {
      const response = await api.get<EnvelopeData<unknown>>(
        ENDPOINTS.eventEntryPaymentMethods(eventId),
        { skipAuth: true }
      );
      return availableEventPaymentMethodSchema.array().parse(response.data);
    },
    enabled: enabled && !!eventId,
  });
}

export interface CreateEntryOrderVariables {
  eventId: string;
  order: CreateEntryOrderInput;
  paymentLinkLanguage?: string;
}

export function useCreateEntryOrder() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation<EntryOrder, Error, CreateEntryOrderVariables>({
    mutationFn: async ({ eventId, order, paymentLinkLanguage }) => {
      const response = await api.post<EnvelopeData<unknown>>(
        ENDPOINTS.eventEntries(eventId),
        order,
        paymentLinkLanguage
          ? { headers: { 'Accept-Language': paymentLinkLanguage } }
          : undefined
      );
      return entryOrderSchema.parse(response.data);
    },
    onSuccess: (_data, { eventId }) => {
      queryClient.invalidateQueries({
        queryKey: ['events', eventId, 'entry-availability'],
      });
      queryClient.invalidateQueries({
        queryKey: ['events', eventId, 'entry-stats'],
      });
    },
  });
}
