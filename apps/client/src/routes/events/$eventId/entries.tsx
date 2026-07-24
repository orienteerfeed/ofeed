import { createFileRoute } from '@tanstack/react-router';
import { EventEntriesManagePage } from '../../../pages';
import { requireEventAccess } from '../../../lib/guards';

export const Route = createFileRoute('/events/$eventId/entries')({
  beforeLoad: async ({ location, params }) => {
    return await requireEventAccess({ location, params });
  },
  component: RouteComponent,
});

function RouteComponent() {
  return <EventEntriesManagePage />;
}
