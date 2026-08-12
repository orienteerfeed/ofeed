import { createFileRoute } from '@tanstack/react-router';
import { requireAuth } from '../../lib/guards';
import { ControlDescriptionsPage } from '../../pages';

export const Route = createFileRoute('/utils/control-descriptions')({
  beforeLoad: async ({ location }) => requireAuth({ location }),
  component: RouteComponent,
});

function RouteComponent() {
  return <ControlDescriptionsPage />;
}
