import { useQuery } from '@tanstack/react-query';
import { entryPaymentInsightSchema } from '@repo/shared';
import { useApi } from '@/hooks/useApi';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { paymentInsightsKey } from '../Entries/entry-payment-client';

export function usePaymentInsights(eventId: string) {
  const api = useApi();
  return useQuery({
    queryKey: paymentInsightsKey(eventId),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const response = await api.get<{ data: unknown }>(
        ENDPOINTS.eventPaymentInsights(eventId)
      );
      return entryPaymentInsightSchema.array().parse(response.data);
    },
    enabled: !!eventId,
  });
}
