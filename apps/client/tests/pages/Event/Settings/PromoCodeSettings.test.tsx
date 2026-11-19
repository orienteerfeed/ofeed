import { MockedProvider } from '@apollo/client/testing/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  PromoCodeSettings,
  EVENT_PROMO_CODES,
  CREATE_PROMO_CODE,
  REVOKE_PROMO_CODE,
} from '@/pages/Event/Settings/PromoCodeSettings';
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
const promo = {
  id: 'p',
  code: 'SUMMER',
  discountPercent: 20,
  revokedAt: null,
  usageCount: 2,
};
const list = (
  codes: (
    typeof promo | (Omit<typeof promo, 'revokedAt'> & { revokedAt: string })
  )[]
) => ({
  request: { query: EVENT_PROMO_CODES, variables: { eventId: 'event' } },
  result: { data: { eventPromoCodes: codes } },
});
describe('promo settings', () => {
  it('creates a normalized code and revokes it after confirmation', async () => {
    const create = vi.fn(() => ({
      data: { createEventPromoCode: { message: 'OK' } },
    }));
    const revoke = vi.fn(() => ({
      data: { revokeEventPromoCode: { message: 'OK' } },
    }));
    render(
      <MockedProvider
        mocks={[
          list([]),
          {
            request: {
              query: CREATE_PROMO_CODE,
              variables: {
                eventId: 'event',
                code: 'SUMMER',
                discountPercent: 20,
              },
            },
            result: create,
          },
          list([promo]),
          {
            request: {
              query: REVOKE_PROMO_CODE,
              variables: { eventId: 'event', id: 'p' },
            },
            result: revoke,
          },
          list([{ ...promo, revokedAt: '2026-11-03T10:00:00Z' }]),
        ]}
      >
        <PromoCodeSettings eventId="event" />
      </MockedProvider>
    );
    await screen.findByText('PromoCodes.Empty');
    fireEvent.change(screen.getByLabelText('PromoCodes.Code'), {
      target: { value: 'summer' },
    });
    fireEvent.change(screen.getByLabelText('PromoCodes.Percent'), {
      target: { value: '20' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'PromoCodes.Create' }));
    await screen.findByText('SUMMER');
    expect(create).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'PromoCodes.Revoke' }));
    expect(
      screen.getByText('PromoCodes.RevokeDescription')
    ).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', {
      name: 'PromoCodes.Revoke',
    });
    fireEvent.click(buttons.at(-1)!);
    await waitFor(() => expect(revoke).toHaveBeenCalledOnce());
    expect(await screen.findByText('PromoCodes.Revoked')).toBeInTheDocument();
  });
  it('validates before sending configuration', async () => {
    render(
      <MockedProvider mocks={[list([])]}>
        <PromoCodeSettings eventId="event" />
      </MockedProvider>
    );
    await screen.findByText('PromoCodes.Empty');
    fireEvent.click(screen.getByRole('button', { name: 'PromoCodes.Create' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'PromoCodes.Validation'
    );
  });
});
