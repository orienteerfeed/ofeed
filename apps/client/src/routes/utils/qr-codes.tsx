import { createFileRoute } from '@tanstack/react-router';
import { requireAuth } from '../../lib/guards';
import { QrCodeGeneratorPage } from '../../pages';

export const Route = createFileRoute('/utils/qr-codes')({
  beforeLoad: async ({ location }) => requireAuth({ location }),
  component: RouteComponent,
});

function RouteComponent() {
  return <QrCodeGeneratorPage />;
}
