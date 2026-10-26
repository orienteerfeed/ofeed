import { createFileRoute } from '@tanstack/react-router';
import { EventInsightsPage } from '@/pages/Event/Insights/EventInsightsPage';

export const Route = createFileRoute('/events/$eventId/insights/')({
  component: EventInsightsPage,
});
