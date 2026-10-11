import { MockedProvider } from '@apollo/client/testing/react';
import type {
  EventEntryAvailability,
  EntryAvailabilityClass,
} from '@repo/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

vi.mock('@/stores/cart', () => ({
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

describe('EntryFormDialog', () => {
  beforeEach(() => {
    addCartItemMock.mockClear();
    navigateMock.mockClear();
    authState.isAuthenticated = false;
    authState.user = null;
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
        })
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
        })
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
