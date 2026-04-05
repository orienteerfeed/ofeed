import { createFileRoute } from '@tanstack/react-router';

import { requireAdminOrForbidden } from '@/lib/guards';
import { AdminSystemMessagesPage } from '@/pages';

export const Route = createFileRoute('/admin/system-messages')({
  beforeLoad: async () => requireAdminOrForbidden(),
  component: AdminSystemMessagesRoute,
});

function AdminSystemMessagesRoute() {
  return <AdminSystemMessagesPage />;
}
