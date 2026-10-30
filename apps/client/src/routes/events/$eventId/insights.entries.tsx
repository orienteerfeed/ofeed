import { createFileRoute } from '@tanstack/react-router';
import { EventEntryInsightPage } from '@/pages/Event/Insights/EventEntryInsightPage';

export const Route = createFileRoute('/events/$eventId/insights/entries')({
  component: EntryInsightRoute,
});

function EntryInsightRoute() {
  const { eventId } = Route.useParams();
  return <EventEntryInsightPage key={eventId} />;
}
