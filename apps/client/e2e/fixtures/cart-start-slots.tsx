// Real dialog and persisted cart; no backend or external timing service needed.
import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  Observable,
} from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import type { EventEntryAvailability } from '@repo/shared';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EntryFormDialog } from '../../src/pages/Event/Entries/EntryFormDialog';
import { useCartItems, useCartStore } from '../../src/stores/cart';
import i18n from '../../src/i18n/i18n';
import '../../src/index.css';

const entryClass = {
  id: 10,
  name: 'H21',
  sex: 'M' as const,
  birthYearFrom: null,
  birthYearTo: null,
  maxNumberOfCompetitors: 100,
  competitorCount: 0,
  startMode: 'StartList',
  fee: null,
  availableCount: 2,
  isFull: false,
  slots: ['2026-10-27T08:00:00.000Z', '2026-10-27T08:02:00.000Z'].map(
    (startTime, index) => ({ id: index + 1, startTime, bibNumber: null })
  ),
};
const availability: EventEntryAvailability = {
  entriesOpenAt: null,
  entriesCloseAt: null,
  currency: { code: 'CZK', name: 'Czech koruna' },
  vatPayer: false,
  vatRate: null,
  defaultStartMode: 'StartList',
  entryActions: [{ key: 'CARD_RENTAL', enabled: true, price: 0 }],
  addOns: [],
  classes: [entryClass],
};
const queryClient = new QueryClient();
const apollo = new ApolloClient({
  cache: new InMemoryCache(),
  link: new ApolloLink(
    () =>
      new Observable(observer => {
        observer.next({
          data: { competitorsByCard: [], competitorsByRegistration: [] },
        });
        observer.complete();
      })
  ),
});

declare global {
  interface Window {
    claimFirstCartSlot: () => void;
  }
}
window.claimFirstCartSlot = () => {
  useCartStore.getState().addItem(
    {
      eventId: 'fixture',
      eventName: 'Fixture event',
      currencyCode: 'CZK',
      classId: 10,
      className: 'H21',
      firstname: 'Other',
      lastname: 'Runner',
      cardRental: true,
      startTime: entryClass.slots[0]!.startTime,
      fee: 0,
      cardRentalFee: 0,
    },
    { exclusiveStartSlot: true }
  );
};

function Fixture() {
  const [open, setOpen] = useState(true);
  const items = useCartItems();
  return (
    <ApolloProvider client={apollo}>
      <QueryClientProvider client={queryClient}>
        <button onClick={() => setOpen(true)}>Open entry form</button>
        <button
          onClick={() => {
            if (items[0]) useCartStore.getState().removeItem(items[0].id);
          }}
        >
          Remove first item
        </button>
        <div data-testid="cart-count">{items.length}</div>
        <EntryFormDialog
          open={open}
          onOpenChange={setOpen}
          entryClass={entryClass}
          availability={availability}
          eventId="fixture"
          eventName="Fixture event"
          eventSportId={1}
        />
      </QueryClientProvider>
    </ApolloProvider>
  );
}
const root = createRootRoute();
const route = createRoute({
  getParentRoute: () => root,
  path: '/e2e/fixtures/cart-start-slots.html',
  component: Fixture,
});
const router = createRouter({ routeTree: root.addChildren([route]) });
void i18n
  .changeLanguage('en')
  .then(() =>
    createRoot(document.getElementById('root')!).render(
      <RouterProvider router={router} />
    )
  );
