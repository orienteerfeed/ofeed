import { createFileRoute } from '@tanstack/react-router';

import { requireAdminOrForbidden } from '@/lib/guards';
import { AdminUsersPage } from '@/pages';

export const Route = createFileRoute('/admin/users')({
  beforeLoad: async () => requireAdminOrForbidden(),
  component: RouteComponent,
});

function RouteComponent() {
  return <AdminUsersPage />;
}
