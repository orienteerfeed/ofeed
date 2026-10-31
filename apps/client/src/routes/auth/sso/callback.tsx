import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { SsoCallbackPage } from '../../../pages';

export const Route = createFileRoute('/auth/sso/callback')({
  validateSearch: z.object({
    status: z.enum(['ok', 'error']).catch('error'),
    mode: z.enum(['login', 'link']).catch('login'),
    reason: z.string().max(64).optional().catch(undefined),
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const search = Route.useSearch();
  return <SsoCallbackPage {...search} />;
}
