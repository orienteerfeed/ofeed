import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { EventEntryOrderDetailPage } from '../../../pages';
import { requireEventAccess } from '../../../lib/guards';

// Trailing underscore on `entries_` un-nests this route from `entries.tsx`
// (the orders list page, which has no <Outlet /> to render a child into).
// The resolved URL is still /events/$eventId/entries/$entryId.
export const Route = createFileRoute('/events/$eventId/entries_/$entryId')({
  validateSearch: z.object({
    access: z.string().min(1).optional(),
  }),
  beforeLoad: async ({ location, params, search }) => {
    if (search.access) return;
    return await requireEventAccess({ location, params });
  },
  component: RouteComponent,
});

function RouteComponent() {
  return <EventEntryOrderDetailPage />;
}
