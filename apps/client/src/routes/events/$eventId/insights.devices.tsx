import { createFileRoute } from '@tanstack/react-router';
import { EventDeviceInsightPage } from '@/pages/Event/Insights/EventDeviceInsightPage';
export const Route = createFileRoute('/events/$eventId/insights/devices')({
  component: DeviceInsightRoute,
});
function DeviceInsightRoute() {
  const { eventId } = Route.useParams();
  return <EventDeviceInsightPage key={eventId} />;
}
