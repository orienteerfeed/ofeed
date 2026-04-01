import { createFileRoute } from '@tanstack/react-router';

import { requireAdminOrForbidden } from '@/lib/guards';
import { AdminCzechRankingPage } from '@/pages';

export const Route = createFileRoute('/admin/ranking/czech')({
  beforeLoad: async () => requireAdminOrForbidden(),
  component: RouteComponent,
});

function RouteComponent() {
  return <AdminCzechRankingPage />;
}
