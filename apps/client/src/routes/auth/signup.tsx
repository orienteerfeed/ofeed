import { createFileRoute } from '@tanstack/react-router';
import { SignUpPage } from '../../pages';

export const Route = createFileRoute('/auth/signup')({
  component: RouteComponent,
});

function RouteComponent() {
  return <SignUpPage />;
}
