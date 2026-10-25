import { createFileRoute, Outlet } from '@tanstack/react-router';
import { requireEventAccess } from '@/lib/guards';

export const Route = createFileRoute('/events/$eventId/insights')({
  beforeLoad: ({ location, params }) =>
    requireEventAccess({ location, params }),
  component: Outlet,
});
