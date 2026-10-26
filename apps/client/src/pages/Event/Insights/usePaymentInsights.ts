import { useQuery } from '@tanstack/react-query';
import { entryPaymentInsightSchema } from '@repo/shared';
import { useApi } from '@/hooks/useApi';
import { ENDPOINTS } from '@/lib/api/endpoints';

export function usePaymentInsights(eventId: string) {
  const api = useApi();
  return useQuery({
    queryKey: ['events', eventId, 'insights', 'payments'],
    queryFn: async () => {
      const response = await api.get<{ data: unknown }>(
        ENDPOINTS.eventPaymentInsights(eventId)
      );
      return entryPaymentInsightSchema.array().parse(response.data);
    },
    enabled: !!eventId,
  });
}
