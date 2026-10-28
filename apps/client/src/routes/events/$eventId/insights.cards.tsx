import { createFileRoute } from '@tanstack/react-router';
import { EventCardInsightPage } from '@/pages/Event/Insights/EventCardInsightPage';

export const Route = createFileRoute('/events/$eventId/insights/cards')({
  component: CardInsightRoute,
});

function CardInsightRoute() {
  const { eventId } = Route.useParams();
  return <EventCardInsightPage key={eventId} />;
}
