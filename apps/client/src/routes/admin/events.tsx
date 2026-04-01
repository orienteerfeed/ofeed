import { createFileRoute } from '@tanstack/react-router';

import { requireAdminOrForbidden } from '@/lib/guards';
import { AdminEventsPage } from '@/pages';

export const Route = createFileRoute('/admin/events')({
  beforeLoad: async () => requireAdminOrForbidden(),
  component: RouteComponent,
});

function RouteComponent() {
  return <AdminEventsPage />;
}
