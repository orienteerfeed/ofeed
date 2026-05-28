import { createFileRoute } from '@tanstack/react-router';
import { VerifyEmailPage } from '../../../pages';

export const Route = createFileRoute('/auth/verify-email/$token')({
  component: RouteComponent,
});

function RouteComponent() {
  return <VerifyEmailPage />;
}
