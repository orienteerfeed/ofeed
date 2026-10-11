import { MockedProvider } from '@apollo/client/testing/react';
import type { MockedResponse } from '@apollo/client/testing';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const routerMocks = vi.hoisted(() => ({
  blocked: false as boolean,
  reset: vi.fn(),
  proceed: vi.fn(),
  useBlocker: vi.fn((options: { disabled?: boolean }) =>
    !options.disabled && routerMocks.blocked
      ? {
          status: 'blocked' as const,
          reset: vi.fn(),
          proceed: vi.fn(),
        }
      : { status: 'idle' as const }
  ),
}));

const toastMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-router', () => ({
  useBlocker: routerMocks.useBlocker,
}));
vi.mock('@/utils', () => ({ toast: toastMock }));

import {
  EVENT_PAYMENT_METHODS,
  PaymentMethodsSettings,
  UPDATE_EVENT_PAYMENT_METHODS,
} from '@/pages/Event/Settings/PaymentMethodsSettings';

const translations: Record<string, string> = {
  'Pages.Event.Settings.Services.PaymentMethods.Title': 'Payment methods',
  'Pages.Event.Settings.Services.PaymentMethods.Methods.OFeedPayment.Title':
    'OFeed Payment',
  'Pages.Event.Settings.Services.PaymentMethods.Methods.CustomPaymentLink.Title':
    'Custom Payment Link',
  'Pages.Event.Settings.Services.PaymentMethods.Methods.QRPayment.Title':
    'QR Payment',
  'Pages.Event.Settings.Services.PaymentMethods.Methods.Cash.Title': 'Cash',
  'Pages.Event.Settings.Services.PaymentMethods.Methods.QRPayment.BankAccountName':
    'Account name',
  'Pages.Event.Settings.Services.PaymentMethods.Methods.QRPayment.BankAccountNamePlaceholder':
    'Organizer bank account',
  'Pages.Event.Settings.Services.PaymentMethods.Methods.QRPayment.BankAccountIban':
    'IBAN / bank account',
  'Pages.Event.Settings.Services.PaymentMethods.Methods.QRPayment.BankAccountIbanPlaceholder':
    'CZ6508000000192000145399',
  'Pages.Event.Settings.Services.PaymentMethods.CustomPaymentLink.Fields.DisplayName':
    'Payment method name',
  'Pages.Event.Settings.Services.PaymentMethods.CustomPaymentLink.Fields.PaymentLink':
    'Payment link',
  'Pages.Event.Settings.Services.PaymentMethods.CustomPaymentLink.DefaultDisplayName':
    'Online payment',
  'Pages.Event.Settings.Services.PaymentMethods.Validation.BankAccountRequired':
    'Bank account required',
  'Pages.Event.Settings.Services.PaymentMethods.Validation.DisplayNameRequired':
    'Payment method name is required.',
  'Pages.Event.Settings.Services.PaymentMethods.Validation.InvalidPaymentLink':
    'Enter an absolute HTTPS URL with a valid hostname and no spaces.',
  'Pages.Event.Settings.Services.PaymentMethods.Validation.UnknownVariables':
    'Unsupported payment link variable: {{variables}}.',
  'Pages.Event.Settings.Services.PaymentMethods.Actions.MoveUp': 'Move up',
  'Pages.Event.Settings.Services.PaymentMethods.Actions.MoveDown': 'Move down',
  'Pages.Event.Settings.Services.PaymentMethods.Save': 'Save payment methods',
  'Pages.Event.Settings.Services.PaymentMethods.Toast.Saved':
    'Payment methods have been saved.',
  'Pages.Event.Settings.Services.PaymentMethods.Toast.SaveError':
    'Payment methods could not be saved.',
  'Pages.Event.Settings.Services.PaymentMethods.Unsaved.Title':
    'Leave without saving payment methods?',
};

const t = ((key: string, options?: Record<string, string>) => {
  if (key === 'Pages.Event.Settings.Services.PaymentMethods.Actions.Toggle') {
    return `Toggle ${options?.name}`;
  }
  const value = translations[key] ?? key;
  return Object.entries(options ?? {}).reduce(
    (result, [name, replacement]) => result.replace(`{{${name}}}`, replacement),
    value
  );
}) as never;

type TestPaymentMethod = {
  type: string;
  enabled: boolean;
  position: number;
  displayName: string | null;
  paymentLinkTemplate: string | null;
  status: string;
};

const baseMethods: TestPaymentMethod[] = [
  {
    type: 'OFEED_PAYMENT',
    enabled: false,
    position: 0,
    displayName: null,
    paymentLinkTemplate: null,
    status: 'UNAVAILABLE',
  },
  {
    type: 'CUSTOM_PAYMENT_LINK',
    enabled: false,
    position: 1,
    displayName: null,
    paymentLinkTemplate: null,
    status: 'DISABLED',
  },
  {
    type: 'QR_PAYMENT',
    enabled: false,
    position: 2,
    displayName: null,
    paymentLinkTemplate: null,
    status: 'DISABLED',
  },
  {
    type: 'CASH',
    enabled: true,
    position: 3,
    displayName: null,
    paymentLinkTemplate: null,
    status: 'READY',
  },
];

function toMutationInput(method: TestPaymentMethod) {
  return {
    type: method.type,
    enabled: method.enabled,
    position: method.position,
    displayName: method.displayName,
    paymentLinkTemplate: method.paymentLinkTemplate,
  };
}

function queryMock(options?: { ofeed?: boolean; bankAccount?: string | null }) {
  const ofeed = options?.ofeed ?? false;
  const bankAccount = options?.bankAccount ?? null;
  return {
    request: {
      query: EVENT_PAYMENT_METHODS,
      variables: { eventId: 'event-1' },
    },
    result: {
      data: {
        eventPaymentMethods: {
          eventId: 'event-1',
          paymentMethods: baseMethods.map(method =>
            method.type === 'OFEED_PAYMENT'
              ? { ...method, status: ofeed ? 'DISABLED' : 'UNAVAILABLE' }
              : method
          ),
          paymentCapabilities: {
            ofeedPaymentAvailable: ofeed,
            qrPaymentAvailable: Boolean(bankAccount),
            bankAccountDisplay: bankAccount,
            bankAccountIban: bankAccount,
            bankAccountName: bankAccount ? 'Organizer account' : null,
          },
        },
      },
    },
  };
}

function renderSettings(mocks: MockedResponse[] = [queryMock()]) {
  return render(
    <MockedProvider mocks={mocks}>
      <PaymentMethodsSettings eventId="event-1" t={t} />
    </MockedProvider>
  );
}

async function loadSettings() {
  await screen.findByText('OFeed Payment');
}

describe('PaymentMethodsSettings', () => {
  beforeEach(() => {
    routerMocks.blocked = false;
    routerMocks.useBlocker.mockClear();
    toastMock.mockClear();
  });

  it('toggles every available method and only shows custom configuration while enabled', async () => {
    renderSettings([
      queryMock({ ofeed: true, bankAccount: 'CZ65 0800 0000 1920 0014 5399' }),
    ]);
    await loadSettings();

    const ofeed = screen.getByRole('switch', { name: 'Toggle OFeed Payment' });
    const custom = screen.getByRole('switch', {
      name: 'Toggle Custom Payment Link',
    });
    const qr = screen.getByRole('switch', { name: 'Toggle QR Payment' });
    const cash = screen.getByRole('switch', { name: 'Toggle Cash' });

    fireEvent.click(ofeed);
    fireEvent.click(custom);
    fireEvent.click(qr);
    fireEvent.click(cash);

    expect(ofeed).toBeChecked();
    expect(custom).toBeChecked();
    expect(qr).toBeChecked();
    expect(cash).not.toBeChecked();
    expect(screen.getByLabelText('Payment method name')).toHaveValue(
      'Online payment'
    );

    fireEvent.click(custom);
    expect(
      screen.queryByLabelText('Payment method name')
    ).not.toBeInTheDocument();
  });

  it('disables unavailable OFeed Payment and reports a missing QR bank account', async () => {
    renderSettings();
    await loadSettings();

    expect(
      screen.getByRole('switch', { name: 'Toggle OFeed Payment' })
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('switch', { name: 'Toggle QR Payment' }));
    expect(screen.getByText('Bank account required')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save payment methods' })
    ).toBeDisabled();
  });

  it('allows QR Payment after entering the organizer bank account', async () => {
    const enabledQrMethods = baseMethods.map(method =>
      method.type === 'QR_PAYMENT'
        ? { ...method, enabled: true, status: 'READY' }
        : method
    );
    renderSettings([
      queryMock(),
      {
        request: {
          query: UPDATE_EVENT_PAYMENT_METHODS,
          variables: {
            eventId: 'event-1',
            input: {
              paymentMethods: enabledQrMethods.map(toMutationInput),
              bankAccountName: 'Organizer account',
              bankAccountIban: 'CZ6508000000192000145399',
            },
          },
        },
        result: {
          data: {
            updateEventPaymentMethods: {
              eventId: 'event-1',
              paymentMethods: enabledQrMethods,
              paymentCapabilities: {
                ofeedPaymentAvailable: false,
                qrPaymentAvailable: true,
                bankAccountDisplay:
                  'Organizer account - CZ6508000000192000145399',
                bankAccountIban: 'CZ6508000000192000145399',
                bankAccountName: 'Organizer account',
              },
            },
          },
        },
      },
    ]);
    await loadSettings();

    fireEvent.click(screen.getByRole('switch', { name: 'Toggle QR Payment' }));
    fireEvent.change(screen.getByLabelText('Account name'), {
      target: { value: 'Organizer account' },
    });
    fireEvent.change(screen.getByLabelText('IBAN / bank account'), {
      target: { value: 'CZ6508000000192000145399' },
    });

    const save = screen.getByRole('button', { name: 'Save payment methods' });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Payment methods have been saved.',
        })
      )
    );
  });

  it('validates the custom name, HTTPS URL, and unknown variables', async () => {
    renderSettings();
    await loadSettings();
    fireEvent.click(
      screen.getByRole('switch', { name: 'Toggle Custom Payment Link' })
    );

    const name = screen.getByLabelText('Payment method name');
    const link = screen.getByLabelText('Payment link');
    fireEvent.change(name, { target: { value: '' } });
    fireEvent.change(link, {
      target: { value: 'http://pay.example/#amount#' },
    });
    expect(
      screen.getByText('Payment method name is required.')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Enter an absolute HTTPS URL with a valid hostname and no spaces.'
      )
    ).toBeInTheDocument();

    fireEvent.change(link, {
      target: { value: 'https://pay.example/#unknownvariable#' },
    });
    expect(
      screen.getByText('Unsupported payment link variable: #unknownvariable#.')
    ).toBeInTheDocument();
  });

  it('inserts a payment variable at the current cursor position', async () => {
    renderSettings();
    await loadSettings();
    fireEvent.click(
      screen.getByRole('switch', { name: 'Toggle Custom Payment Link' })
    );
    const link = screen.getByLabelText('Payment link') as HTMLInputElement;
    fireEvent.change(link, { target: { value: 'https://pay.example/path' } });
    link.focus();
    link.setSelectionRange(20, 20);

    fireEvent.click(screen.getByRole('button', { name: '#amount#' }));

    await waitFor(() =>
      expect(link).toHaveValue('https://pay.example/#amount#path')
    );
  });

  it('changes the customer-facing order with accessible move buttons', async () => {
    renderSettings();
    await loadSettings();
    const customTitle = screen.getByText('Custom Payment Link');
    const customCard = customTitle.closest('[class*="rounded-md"]');
    expect(customCard).not.toBeNull();
    fireEvent.click(
      within(customCard as HTMLElement).getByRole('button', { name: 'Move up' })
    );

    const ofeedTitle = screen.getByText('OFeed Payment');
    expect(
      customTitle.compareDocumentPosition(ofeedTitle) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('saves the complete configuration and shows the success toast', async () => {
    const savedMethods = baseMethods.map(method =>
      method.type === 'CUSTOM_PAYMENT_LINK'
        ? {
            ...method,
            enabled: true,
            displayName: 'Online payment',
            paymentLinkTemplate: 'https://pay.example/#amount#',
            status: 'READY',
          }
        : method
    );
    const updateMock = {
      request: {
        query: UPDATE_EVENT_PAYMENT_METHODS,
        variables: {
          eventId: 'event-1',
          input: {
            paymentMethods: savedMethods.map(toMutationInput),
            bankAccountName: null,
            bankAccountIban: null,
          },
        },
      },
      result: {
        data: {
          updateEventPaymentMethods: {
            eventId: 'event-1',
            paymentMethods: savedMethods,
            paymentCapabilities: {
              ofeedPaymentAvailable: false,
              qrPaymentAvailable: false,
              bankAccountDisplay: null,
              bankAccountIban: null,
              bankAccountName: null,
            },
          },
        },
      },
    };
    renderSettings([queryMock(), updateMock]);
    await loadSettings();
    fireEvent.click(
      screen.getByRole('switch', { name: 'Toggle Custom Payment Link' })
    );
    fireEvent.change(screen.getByLabelText('Payment link'), {
      target: { value: 'https://pay.example/#amount#' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save payment methods' })
    );

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Payment methods have been saved.',
        })
      )
    );
  });

  it('shows the standard error toast when saving fails', async () => {
    const methods = baseMethods.map(method =>
      method.type === 'CUSTOM_PAYMENT_LINK'
        ? {
            ...method,
            enabled: true,
            displayName: 'Online payment',
            paymentLinkTemplate: 'https://pay.example/#amount#',
          }
        : method
    );
    const updateMock = {
      request: {
        query: UPDATE_EVENT_PAYMENT_METHODS,
        variables: {
          eventId: 'event-1',
          input: {
            paymentMethods: methods.map(toMutationInput),
            bankAccountName: null,
            bankAccountIban: null,
          },
        },
      },
      error: new Error('save failed'),
    };
    renderSettings([queryMock(), updateMock]);
    await loadSettings();
    fireEvent.click(
      screen.getByRole('switch', { name: 'Toggle Custom Payment Link' })
    );
    fireEvent.change(screen.getByLabelText('Payment link'), {
      target: { value: 'https://pay.example/#amount#' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save payment methods' })
    );

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Payment methods could not be saved.',
        })
      )
    );
  });

  it('shows the existing confirmation dialog after an unsaved change', async () => {
    routerMocks.blocked = true;
    renderSettings();
    await loadSettings();
    fireEvent.click(
      screen.getByRole('switch', { name: 'Toggle Custom Payment Link' })
    );

    expect(
      await screen.findByText('Leave without saving payment methods?')
    ).toBeInTheDocument();
    expect(routerMocks.useBlocker).toHaveBeenLastCalledWith(
      expect.objectContaining({
        disabled: false,
        enableBeforeUnload: true,
        withResolver: true,
      })
    );
  });
});
