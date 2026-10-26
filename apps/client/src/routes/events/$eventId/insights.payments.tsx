import { createFileRoute } from '@tanstack/react-router';
import { EventPaymentInsightPage } from '@/pages/Event/Insights/EventPaymentInsightPage';

export const Route = createFileRoute('/events/$eventId/insights/payments')({
  component: EventPaymentInsightPage,
});
