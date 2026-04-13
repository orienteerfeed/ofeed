import { RouterProvider, createRouter } from '@tanstack/react-router';
import 'flag-icons/css/flag-icons.min.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet/dist/leaflet.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n/i18n.ts';
import './index.css';
import { routeTree } from './routeTree.gen';

// Create router instance
const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

// Register router for TypeScript
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
