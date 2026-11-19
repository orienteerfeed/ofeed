import { MockedProvider } from '@apollo/client/testing/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  CheckoutPromoCode,
  ENTRY_PROMO_QUOTE,
  type PromoSelection,
} from '@/pages/Checkout/CheckoutPromoCode';
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
const items = [
  {
    classId: 1,
    firstname: 'Jan',
    lastname: 'Novak',
    birthYear: 1995,
    card: 123,
    cardRental: false,
  },
];
const changed = [...items, { ...items[0]!, firstname: 'Eva' }];
const onReady = vi.fn();
function Harness() {
  const [selection, setSelection] = useState<PromoSelection>();
  const [currentItems, setItems] = useState(items);
  return (
    <>
      <CheckoutPromoCode
        eventId="event"
        items={currentItems}
        selection={selection}
        onChange={(_eventId, next, quoteUpdate) => {
          onReady(next);
          setSelection(current =>
            quoteUpdate && current?.code !== next.code
              ? current
              : JSON.stringify(current) === JSON.stringify(next)
                ? current
                : next
          );
        }}
      />
      <button onClick={() => setItems(changed)}>change cart</button>
    </>
  );
}
const quote = (quoteItems = items, fail = false) => ({
  request: {
    query: ENTRY_PROMO_QUOTE,
    variables: { eventId: 'event', code: 'SUMMER', items: quoteItems },
  },
  ...(fail
    ? { error: new Error('PROMO_INVALID') }
    : {
        result: {
          data: {
            entryPromoQuote: {
              code: 'SUMMER',
              discountPercent: 20,
              subtotal: 100,
              eligibleAmount: 75,
              discountAmount: 15,
              totalAmount: 85,
              currency: 'CZK',
              excludedItems: 1,
            },
          },
        },
      }),
});
describe('checkout promo code', () => {
  it('previews the code, explains excluded items, refreshes after cart change and removes it', async () => {
    render(
      <MockedProvider mocks={[quote(), quote(changed)]}>
        <Harness />
      </MockedProvider>
    );
    fireEvent.change(screen.getByLabelText('PromoCodes.Code'), {
      target: { value: ' summer ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'PromoCodes.Apply' }));
    expect(await screen.findByText('SUMMER (20%)')).toBeInTheDocument();
    expect(screen.getByText('PromoCodes.Excluded')).toBeInTheDocument();
    await waitFor(() =>
      expect(onReady).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'SUMMER', ready: true })
      )
    );
    fireEvent.click(screen.getByText('change cart'));
    await waitFor(() =>
      expect(onReady).toHaveBeenCalledWith({
        code: 'SUMMER',
        ready: true,
        fingerprint: JSON.stringify(changed),
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'PromoCodes.Remove' }));
    await waitFor(() =>
      expect(screen.queryByText('SUMMER (20%)')).not.toBeInTheDocument()
    );
  });
  it('shows an explicit invalid-code error without a usable quote', async () => {
    render(
      <MockedProvider mocks={[quote(items, true)]}>
        <Harness />
      </MockedProvider>
    );
    fireEvent.change(screen.getByLabelText('PromoCodes.Code'), {
      target: { value: 'SUMMER' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'PromoCodes.Apply' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'PromoCodes.Invalid'
    );
    await waitFor(() =>
      expect(screen.queryByText('SUMMER (20%)')).not.toBeInTheDocument()
    );
  });
});
