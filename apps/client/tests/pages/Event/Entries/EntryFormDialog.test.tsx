import { MockedProvider } from '@apollo/client/testing/react';
import type {
  EventEntryAvailability,
  EntryAvailabilityClass,
} from '@repo/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const addCartItemMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({
  isAuthenticated: false,
  user: null as null | {
    id: number;
    firstname: string;
    lastname: string;
    email: string;
    organisation?: string | null;
  },
}));

vi.mock('@/stores/cart', async importOriginal => ({
  ...(await importOriginal<typeof import('@/stores/cart')>()),
  useAddCartItem: () => addCartItemMock,
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('@/hooks', () => ({
  useAuth: () => authState,
}));

// The registration autocomplete has its own focused tests. Keep these tests
// scoped to the GraphQL duplicate warnings instead of issuing an unhandled
// REST lookup whenever a complete registration number is entered.
vi.mock('@/pages/Event/Entries/registration.hooks', () => ({
  useRegistrationLookup: () => ({ data: undefined, isFetching: false }),
  useClubSearch: () => ({ data: undefined, isFetching: false }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (key: string, values?: Record<string, string>) => {
      const translations: Record<string, string> = {
        'Pages.Event.Entries.Form.Firstname': 'First name',
        'Pages.Event.Entries.Form.Lastname': 'Last name',
        'Pages.Event.Entries.Form.Registration': 'Registration',
        'Pages.Event.Entries.Form.RegistrationHelper': 'e.g. XXX9901',
        'Pages.Event.Entries.Form.BirthYear': 'Birth year',
        'Pages.Event.Entries.Form.Organisation': 'Organisation',
        'Pages.Event.Entries.Form.License': 'License',
        'Pages.Event.Entries.Form.Card': 'SI card number',
        'Pages.Event.Entries.Form.ClearForm': 'Clear form',
        'Pages.Event.Entries.Form.AddToCart': 'Add to cart',
        'Pages.Event.Entries.Form.Title': 'Entry',
        'Pages.Event.Entries.Form.StartTime': 'Start time',
        'Pages.Event.Entries.Form.StartTimePlaceholder': 'Select a start time',
        'Pages.Event.Entries.Form.DescriptionFree':
          'This class has no entry fee.',
        'Pages.Event.Entries.Form.Warnings.CardAlreadyUsed':
          'This SI card is already assigned to {{competitors}} in this event.',
        'Pages.Event.Entries.Form.Warnings.RegistrationAlreadyUsed':
          'This registration number is already entered as {{competitors}} in this event. You can continue, but check the registration before submitting.',
        'Operations.Cancel': 'Cancel',
      };
      const template = translations[key] ?? key;
      return Object.entries(values ?? {}).reduce(
        (result, [name, value]) => result.replace(`{{${name}}}`, value),
        template
      );
    },
  }),
}));

import {
  COMPETITORS_BY_CARD,
  COMPETITORS_BY_REGISTRATION,
  CURRENT_USER_ENTRY_PREFILL,
  EntryFormDialog,
} from '@/pages/Event/Entries/EntryFormDialog';
import { useCartStore, type CartEntryItem } from '@/stores/cart';

const entryClass = {
  id: 10,
  name: 'M21',
  sex: 'M',
  birthYearFrom: null,
  birthYearTo: null,
  maxNumberOfCompetitors: 100,
  competitorCount: 0,
  startMode: 'FreeStart',
  fee: null,
  availableCount: 100,
  isFull: false,
  slots: [],
} satisfies EntryAvailabilityClass;

const availability = {
  entriesOpenAt: null,
  entriesCloseAt: null,
  currency: { code: 'CZK', name: 'Czech koruna' },
  vatPayer: false,
  vatRate: null,
  defaultStartMode: 'FreeStart',
  entryActions: [],
  addOns: [],
  classes: [entryClass],
} satisfies EventEntryAvailability;

const SLOT_A = '2026-10-27T08:00:00.000Z';
const SLOT_B = '2026-10-27T08:02:00.000Z';
const intervalClass: EntryAvailabilityClass = {
  ...entryClass,
  startMode: 'StartList',
  slots: [SLOT_A, SLOT_B].map((startTime, index) => ({
    id: index + 1,
    startTime,
    bibNumber: null,
  })),
};
const heldSlot = {
  eventId: 'event-1',
  eventName: 'Test event',
  currencyCode: 'CZK',
  classId: 10,
  className: 'M21',
  firstname: 'Jan',
  lastname: 'Novak',
  startTime: SLOT_A,
  cardRental: false,
  fee: 0,
  cardRentalFee: null,
} satisfies Omit<CartEntryItem, 'id'>;

function renderIntervalForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MockedProvider>
        <EntryFormDialog
          open
          onOpenChange={vi.fn()}
          entryClass={intervalClass}
          availability={availability}
          eventId="event-1"
          eventName="Test event"
          eventSportId={1}
        />
      </MockedProvider>
    </QueryClientProvider>
  );
}

const slotSelect = () =>
  document.querySelector<HTMLSelectElement>('select[name="startTime"]')!;
const offeredSlots = () =>
  [...slotSelect().options].map(option => option.value).filter(Boolean);

describe('EntryFormDialog', () => {
  beforeEach(() => {
    addCartItemMock.mockReset();
    addCartItemMock.mockReturnValue(true);
    useCartStore.getState().clear();
    navigateMock.mockClear();
    authState.isAuthenticated = false;
    authState.user = null;
  });

  it('hides cart slots and offers them again after removing the cart item', async () => {
    useCartStore
      .getState()
      .addItem({ ...heldSlot, startTime: '2026-10-27T09:00:00+01:00' });
    renderIntervalForm();
    expect(offeredSlots()).toEqual([SLOT_B]);
    await act(async () => {
      useCartStore.getState().removeItem(useCartStore.getState().items[0]!.id);
    });
    expect(offeredSlots().sort()).toEqual([SLOT_A, SLOT_B]);
  });

  it('clears a selected time when another item in this cart claims it', async () => {
    renderIntervalForm();
    fireEvent.change(slotSelect(), { target: { value: SLOT_A } });
    expect(slotSelect()).toHaveValue(SLOT_A);
    await act(async () => {
      useCartStore.getState().addItem(heldSlot);
    });
    await waitFor(() => expect(slotSelect()).toHaveValue(''));
    expect(offeredSlots()).toEqual([SLOT_B]);
  });

  it('does not report success when the latest cart state rejects a stale slot', async () => {
    addCartItemMock.mockReturnValue(false);
    renderIntervalForm();
    for (const [name, value] of Object.entries({
      firstname: 'Jan',
      lastname: 'Novak',
      birthYear: '1995',
      card: '8123456',
    })) {
      fireEvent.change(document.querySelector(`input[name="${name}"]`)!, {
        target: { value },
      });
    }
    fireEvent.change(slotSelect(), { target: { value: SLOT_A } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));
    await waitFor(() =>
      expect(addCartItemMock).toHaveBeenCalledWith(
        expect.objectContaining({ startTime: SLOT_A }),
        { exclusiveStartSlot: true }
      )
    );
    expect(
      screen.queryByText('Pages.Event.Entries.Form.AddedTitle')
    ).not.toBeInTheDocument();
    expect(slotSelect()).toHaveValue('');
  });

  it('warns about an existing competitor with the same SI card without blocking add to cart', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MockedProvider
          mocks={[
            {
              request: {
                query: COMPETITORS_BY_CARD,
                variables: { eventId: 'event-1', card: 8123456 },
              },
              result: {
                data: {
                  competitorsByCard: [
                    {
                      id: 1,
                      firstname: 'Jana',
                      lastname: 'Novakova',
                      registration: 'ABC9955',
                      organisation: 'KOB Test',
                      card: 8123456,
                      class: { id: 11, name: 'D21' },
                    },
                  ],
                },
              },
            },
          ]}
        >
          <EntryFormDialog
            open
            onOpenChange={vi.fn()}
            entryClass={entryClass}
            availability={availability}
            eventId="event-1"
            eventName="Test event"
            eventSportId={1}
          />
        </MockedProvider>
      </QueryClientProvider>
    );
    const input = (name: string) =>
      document.querySelector<HTMLInputElement>(`input[name="${name}"]`);

    fireEvent.change(input('firstname')!, {
      target: { value: 'Petr' },
    });
    fireEvent.change(input('lastname')!, {
      target: { value: 'Novak' },
    });
    fireEvent.change(input('birthYear')!, {
      target: { value: '1995' },
    });
    fireEvent.change(input('card')!, {
      target: { value: '8123456' },
    });

    await waitFor(() => {
      expect(
        screen
          .getAllByRole('alert')
          .some(alert =>
            alert.textContent?.includes('Jana Novakova (ABC9955) - D21')
          )
      ).toBe(true);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));

    await waitFor(() => {
      expect(addCartItemMock).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'event-1',
          firstname: 'Petr',
          lastname: 'Novak',
          card: 8123456,
        }),
        { exclusiveStartSlot: false }
      );
    });
  });

  it('warns about an existing competitor with the same registration without blocking add to cart', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MockedProvider
          mocks={[
            {
              request: {
                query: COMPETITORS_BY_REGISTRATION,
                variables: { eventId: 'event-1', registration: 'ABC9955' },
              },
              result: {
                data: {
                  competitorsByRegistration: [
                    {
                      id: 1,
                      firstname: 'Jana',
                      lastname: 'Novakova',
                      registration: 'ABC9955',
                      organisation: 'KOB Test',
                      card: 8123456,
                      class: { id: 11, name: 'D21' },
                    },
                  ],
                },
              },
            },
            {
              request: {
                query: COMPETITORS_BY_CARD,
                variables: { eventId: 'event-1', card: 8123457 },
              },
              result: {
                data: {
                  competitorsByCard: [],
                },
              },
            },
          ]}
        >
          <EntryFormDialog
            open
            onOpenChange={vi.fn()}
            entryClass={entryClass}
            availability={availability}
            eventId="event-1"
            eventName="Test event"
            eventSportId={1}
          />
        </MockedProvider>
      </QueryClientProvider>
    );
    const input = (name: string) =>
      document.querySelector<HTMLInputElement>(`input[name="${name}"]`);

    fireEvent.change(input('firstname')!, {
      target: { value: 'Petr' },
    });
    fireEvent.change(input('lastname')!, {
      target: { value: 'Novak' },
    });
    fireEvent.change(input('registration')!, {
      target: { value: 'abc9955' },
    });
    fireEvent.change(input('card')!, {
      target: { value: '8123457' },
    });

    await waitFor(() => {
      expect(
        screen
          .getAllByRole('alert')
          .some(alert =>
            alert.textContent?.includes('Jana Novakova (ABC9955) - D21')
          )
      ).toBe(true);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));

    await waitFor(() => {
      expect(addCartItemMock).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'event-1',
          firstname: 'Petr',
          lastname: 'Novak',
          registration: 'ABC9955',
          card: 8123457,
        }),
        { exclusiveStartSlot: false }
      );
    });
  });

  it('clears entered values without closing the form', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MockedProvider>
          <EntryFormDialog
            open
            onOpenChange={vi.fn()}
            entryClass={entryClass}
            availability={availability}
            eventId="event-1"
            eventName="Test event"
            eventSportId={1}
          />
        </MockedProvider>
      </QueryClientProvider>
    );

    const input = (name: string) =>
      document.querySelector<HTMLInputElement>(`input[name="${name}"]`);

    fireEvent.change(input('firstname')!, { target: { value: 'Petr' } });
    fireEvent.change(input('lastname')!, { target: { value: 'Novak' } });

    fireEvent.click(screen.getByRole('button', { name: 'Clear form' }));

    expect(input('firstname')).toHaveValue('');
    expect(input('lastname')).toHaveValue('');
    expect(screen.getByText('Entry')).toBeInTheDocument();
  });

  it('prefills signed-in user name and default card for the event sport', async () => {
    authState.isAuthenticated = true;
    authState.user = {
      id: 5,
      firstname: 'Petr',
      lastname: 'Novak',
      email: 'petr@example.test',
      organisation: 'KOB Test',
    };

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MockedProvider
          mocks={[
            {
              request: {
                query: CURRENT_USER_ENTRY_PREFILL,
              },
              result: {
                data: {
                  currentUser: {
                    id: 5,
                    firstname: 'Petr',
                    lastname: 'Novak',
                    organisation: 'KOB Test',
                  },
                  currentUserCards: [
                    {
                      id: 1,
                      sportId: 99,
                      cardNumber: '9000001',
                      type: 'SPORTIDENT',
                      isDefault: true,
                    },
                    {
                      id: 2,
                      sportId: 1,
                      cardNumber: '8123456',
                      type: 'SPORTIDENT',
                      isDefault: true,
                    },
                  ],
                },
              },
            },
            {
              request: {
                query: COMPETITORS_BY_CARD,
                variables: { eventId: 'event-1', card: 8123456 },
              },
              result: {
                data: {
                  competitorsByCard: [],
                },
              },
            },
          ]}
        >
          <EntryFormDialog
            open
            onOpenChange={vi.fn()}
            entryClass={entryClass}
            availability={availability}
            eventId="event-1"
            eventName="Test event"
            eventSportId={1}
          />
        </MockedProvider>
      </QueryClientProvider>
    );

    const input = (name: string) =>
      document.querySelector<HTMLInputElement>(`input[name="${name}"]`);

    await waitFor(() => {
      expect(input('firstname')).toHaveValue('Petr');
      expect(input('lastname')).toHaveValue('Novak');
      expect(input('organisation')).toHaveValue('KOB Test');
      expect(input('card')).toHaveValue('8123456');
    });
  });
});
