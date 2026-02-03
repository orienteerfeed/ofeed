import { AppProviders } from '@/providers';
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { NotAuthorizedPage, NotFoundPage } from '../pages';
import { ForbiddenError } from '../lib/guards';

export const Route = createRootRoute({
  component: RootComponent,
  errorComponent: ({ error }) => {
    const status =
      typeof error === 'object' && error !== null && 'status' in error
        ? (error as { status?: number }).status
        : undefined;
    if (error instanceof ForbiddenError || status === 403) {
      return <NotAuthorizedPage />;
    }
    // fallback for other errors
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Něco se pokazilo</h1>
        <pre className="mt-2 text-sm opacity-70">{String(error)}</pre>
      </div>
    );
  },
  notFoundComponent: () => {
    return <NotFoundPage />;
  },
});

function RootComponent() {
  return (
    <AppProviders>
      {/* Outlet renderuje aktuální stránku */}
      <Outlet />
    </AppProviders>
  );
}
