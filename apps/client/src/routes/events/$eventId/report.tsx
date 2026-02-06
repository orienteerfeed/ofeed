import { createFileRoute } from '@tanstack/react-router';
import { EventReportPage } from '../../../pages';
import { requireEventAccessOrForbidden } from '../../../lib/guards';

export const Route = createFileRoute('/events/$eventId/report')({
  beforeLoad: async ({ params }) => {
    return await requireEventAccessOrForbidden({ params });
  },
  component: RouteComponent,
});

function RouteComponent() {
  return <EventReportPage />;
}
