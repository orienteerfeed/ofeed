import { createFileRoute } from '@tanstack/react-router';
import { ResetPasswordPage } from '../../../pages';

export const Route = createFileRoute('/auth/reset-password/$token')({
  component: RouteComponent,
});

function RouteComponent() {
  return <ResetPasswordPage />;
}
