import { createFileRoute } from '@tanstack/react-router';
import { EventSettingsPage } from '../../../pages';
import { requireEventAccess } from '../../_guards';

export const Route = createFileRoute('/events/$eventId/settings')({
  beforeLoad: async ({ location, params }) => {
    return await requireEventAccess({ location, params });
  },
  component: RouteComponent,
});

function RouteComponent() {
  return <EventSettingsPage />;
}
