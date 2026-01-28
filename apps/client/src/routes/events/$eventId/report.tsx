import { createFileRoute } from '@tanstack/react-router';
import { EventReportPage } from '../../../pages';
import { requireEventAccess } from '../../_guards';

export const Route = createFileRoute('/events/$eventId/report')({
  beforeLoad: async ({ location, params }) => {
    return await requireEventAccess({ location, params });
  },
  component: RouteComponent,
});

function RouteComponent() {
  return <EventReportPage />;
}
