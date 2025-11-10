import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { EventPage } from '../../../pages';

export const Route = createFileRoute('/events/$eventId/')({
  component: RouteComponent,
  validateSearch: z.object({
    tab: z.string().default('info'),
    sort: z.string().default('date'),
    class: z.string().optional(),
  }),
});

function RouteComponent() {
  const { eventId } = Route.useParams();
  const { tab } = Route.useSearch();

  return <EventPage eventId={eventId} tab={tab} />;
}
