import { createFileRoute } from '@tanstack/react-router';
import { requireAuth } from '@/lib/guards';
import { NotificationsPage } from '@/pages/Notifications/NotificationsPage';

export const Route = createFileRoute('/notifications')({
  beforeLoad: ({ location }) => requireAuth({ location }),
  component: NotificationsPage,
});
