import { createFileRoute } from '@tanstack/react-router';

import { requireEventAccess } from '../../../lib/guards';
import { EventEntryOrderEditPage } from '../../../pages';

export const Route = createFileRoute(
  '/events/$eventId/entries_/$entryId_/edit'
)({
  beforeLoad: async ({ location, params }) =>
    await requireEventAccess({ location, params }),
  component: EventEntryOrderEditPage,
});
