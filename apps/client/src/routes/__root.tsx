import { AppProviders } from '@/providers';
import { createRootRoute, Outlet } from '@tanstack/react-router';

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: () => {
    return <p>vošukat karla found!</p>;
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
