import { createFileRoute } from '@tanstack/react-router';

import { requireAdminOrForbidden } from '@/lib/guards';
import { AdminDashboardPage } from '@/pages';

export const Route = createFileRoute('/admin/')({
  beforeLoad: async () => requireAdminOrForbidden(),
  component: RouteComponent,
});

function RouteComponent() {
  return <AdminDashboardPage />;
}
