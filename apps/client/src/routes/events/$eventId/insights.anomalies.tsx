import { createFileRoute } from '@tanstack/react-router';
import { EventAnomalyInsightPage } from '@/pages/Event/Insights/EventAnomalyInsightPage';

export const Route = createFileRoute('/events/$eventId/insights/anomalies')({
  component: AnomalyInsightRoute,
});
function AnomalyInsightRoute() {
  const { eventId } = Route.useParams();
  return <EventAnomalyInsightPage key={eventId} />;
}
