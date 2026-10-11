import { createFileRoute } from '@tanstack/react-router';

import { requireAdminOrForbidden } from '@/lib/guards';
import { AdminRegistrationsPage } from '@/pages';

export const Route = createFileRoute('/admin/registrations')({
  beforeLoad: async () => requireAdminOrForbidden(),
  component: RouteComponent,
});

function RouteComponent() {
  return <AdminRegistrationsPage />;
}
