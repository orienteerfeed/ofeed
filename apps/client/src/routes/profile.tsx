import { createFileRoute } from '@tanstack/react-router';
import { ProfilePage } from '../pages';
import { requireAuth } from '../lib/guards';

export const Route = createFileRoute('/profile')({
  beforeLoad: async ({ location }) => {
    return await requireAuth({ location });
  },
  component: RouteComponent,
});

function RouteComponent() {
  return <ProfilePage />;
}
