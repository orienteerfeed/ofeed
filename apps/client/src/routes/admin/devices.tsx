import { createFileRoute } from '@tanstack/react-router';
import { requireAdminOrForbidden } from '@/lib/guards';
import { AdminSystemDevicesPage } from '@/pages/Admin/AdminSystemDevicesPage';

export const Route = createFileRoute('/admin/devices')({
  beforeLoad: async () => requireAdminOrForbidden(),
  component: AdminSystemDevicesPage,
});
