import { MockedProvider } from '@apollo/client/testing/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  RegistrationFeeDiscountSettings,
  REGISTRATION_FEE_DISCOUNT_SETTINGS,
  UPDATE_REGISTRATION_FEE_DISCOUNTS,
} from '@/pages/Event/Settings/RegistrationFeeDiscountSettings';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/utils', () => ({ toast: vi.fn() }));
const key = (name: string) =>
  `Pages.Event.Settings.Services.RegistrationDiscounts.${name}`;
const settings = (
  rules: {
    pattern: string;
    discountPercent: number;
    allowPromoCode?: boolean;
  }[] = []
) => ({
  request: {
    query: REGISTRATION_FEE_DISCOUNT_SETTINGS,
    variables: { eventId: 'event-1' },
  },
  result: {
    data: {
      eventServiceSettings: {
        eventId: 'event-1',
        registrationFeeDiscounts: rules.map(rule => ({
          allowPromoCode: false,
          ...rule,
        })),
      },
    },
  },
});

describe('registration discount settings', () => {
  it('saves a free-entry rule and shows it after refetch', async () => {
    const rules = [
      { allowPromoCode: false, pattern: 'CHC*', discountPercent: 100 },
    ];
    const saved = vi.fn(() => ({
      data: { updateRegistrationFeeDiscounts: { message: 'Saved' } },
    }));
    render(
      <MockedProvider
        mocks={[
          settings(),
          {
            request: {
              query: UPDATE_REGISTRATION_FEE_DISCOUNTS,
              variables: { eventId: 'event-1', rules },
            },
            result: saved,
          },
          settings(rules),
        ]}
      >
        <RegistrationFeeDiscountSettings eventId="event-1" />
      </MockedProvider>
    );
    await screen.findByText(key('Empty'));
    fireEvent.click(screen.getByRole('button', { name: key('Add') }));
    fireEvent.change(screen.getByLabelText(key('Pattern')), {
      target: { value: 'CHC*' },
    });
    fireEvent.change(screen.getByLabelText(key('Percent')), {
      target: { value: '25' },
    });
    fireEvent.click(screen.getByRole('button', { name: key('Free') }));
    expect(screen.getByLabelText(key('Percent'))).toHaveValue(100);
    fireEvent.click(screen.getByRole('button', { name: key('Save') }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: key('Save') })).toBeDisabled()
    );
    expect(screen.getByLabelText(key('Pattern'))).toHaveValue('CHC*');
  });

  it('validates rules before saving', async () => {
    render(
      <MockedProvider mocks={[settings()]}>
        <RegistrationFeeDiscountSettings eventId="event-1" />
      </MockedProvider>
    );
    await screen.findByText(key('Empty'));
    fireEvent.click(screen.getByRole('button', { name: key('Add') }));
    fireEvent.change(screen.getByLabelText(key('Pattern')), {
      target: { value: 'CHC*' },
    });
    fireEvent.change(screen.getByLabelText(key('Percent')), {
      target: { value: '101' },
    });
    fireEvent.click(screen.getByRole('button', { name: key('Save') }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      key('Validation')
    );
  });

  it('removes the last rule and saves an empty list', async () => {
    const saved = vi.fn(() => ({
      data: { updateRegistrationFeeDiscounts: { message: 'Saved' } },
    }));
    render(
      <MockedProvider
        mocks={[
          settings([{ pattern: 'CHC*', discountPercent: 25 }]),
          {
            request: {
              query: UPDATE_REGISTRATION_FEE_DISCOUNTS,
              variables: { eventId: 'event-1', rules: [] },
            },
            result: saved,
          },
          settings(),
        ]}
      >
        <RegistrationFeeDiscountSettings eventId="event-1" />
      </MockedProvider>
    );
    await screen.findByDisplayValue('CHC*');
    fireEvent.click(screen.getByRole('button', { name: key('Remove') }));
    fireEvent.click(screen.getByRole('button', { name: key('Save') }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  });
});

it('allows the organizer to opt a registration rule into promo combinations', async () => {
  const rules = [
    { pattern: 'CHC*', discountPercent: 25, allowPromoCode: true },
  ];
  const saved = vi.fn(() => ({
    data: { updateRegistrationFeeDiscounts: { message: 'Saved' } },
  }));
  render(
    <MockedProvider
      mocks={[
        settings([{ pattern: 'CHC*', discountPercent: 25 }]),
        {
          request: {
            query: UPDATE_REGISTRATION_FEE_DISCOUNTS,
            variables: { eventId: 'event-1', rules },
          },
          result: saved,
        },
        settings(rules),
      ]}
    >
      <RegistrationFeeDiscountSettings eventId="event-1" />
    </MockedProvider>
  );
  await screen.findByDisplayValue('CHC*');
  const checkbox = screen.getByRole('checkbox', {
    name: 'PromoCodes.AllowCombination',
  });
  expect(checkbox).not.toBeChecked();
  fireEvent.click(checkbox);
  fireEvent.click(screen.getByRole('button', { name: key('Save') }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked());
});
