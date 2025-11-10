import { createFileRoute } from '@tanstack/react-router';
import { MyEventsPage } from '../pages';
import { requireAuth } from './_guards';

export const Route = createFileRoute('/my-events')({
  beforeLoad: async ({ location }) => {
    return await requireAuth({ location });
  },
  component: RouteComponent,
});

function RouteComponent() {
  return <MyEventsPage />;
}
