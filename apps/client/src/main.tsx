import { RouterProvider, createRouter } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n/i18n.ts';
import 'flag-icons/css/flag-icons.min.css';
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
