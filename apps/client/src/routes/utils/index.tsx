import { createFileRoute } from '@tanstack/react-router';
import { requireAuth } from '../../lib/guards';
import { UtilsLandingPage } from '../../pages';

export const Route = createFileRoute('/utils/')({
  beforeLoad: async ({ location }) => requireAuth({ location }),
  component: RouteComponent,
});

function RouteComponent() {
  return <UtilsLandingPage />;
}
