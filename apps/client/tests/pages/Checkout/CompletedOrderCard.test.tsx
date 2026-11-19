import type { EntryOrder, PaymentMethodType } from '@repo/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CompletedOrderCard } from '@/pages/Checkout/CheckoutPage';
import { EntryPaymentSection } from '@/pages/Event/Entries/EntryPaymentSection';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'cs' } }),
}));
vi.mock('@/pages/Checkout/QrPaymentInstructions', () => ({
  QrPaymentInstructions: () => <p>QR payment request</p>,
}));

const qrPayment = {
  bankAccountIban: 'CZ6508000000192000145399',
  bankAccountName: 'Test club',
  amount: 0,
  currency: 'CZK',
  paymentReference: '2674805125',
  constantSymbol: '0308',
  recipientMessage: 'Test',
  payload: 'SPD*1.0*AM:0.00',
};

function makeOrder(
  paymentMethod: PaymentMethodType,
  totalAmount = 0
): EntryOrder {
  return {
    id: 'entry-1',
    eventId: 'event-1',
    status: 'RECEIVED',
    paid: totalAmount === 0,
    paymentMethod,
    paymentReference: '2674805125',
    userId: null,
    contactEmail: 'test@example.test',
    contactFirstname: 'Test',
    contactLastname: 'Runner',
    totalAmount,
    currency: 'CZK',
    createdAt: new Date(),
    items: [],
    detailAccessToken: 'test-token',
    paymentUrl: 'https://pay.example.test',
    qrPayment,
  };
}

describe('free order confirmation', () => {
  it.each([
    'QR_PAYMENT',
    'CASH',
    'CUSTOM_PAYMENT_LINK',
    'OFEED_PAYMENT',
  ] as const)(
    'confirms a free %s checkout without requesting payment even with stale instructions',
    paymentMethod => {
      render(
        <CompletedOrderCard
          completedOrder={{
            eventName: 'Test event',
            order: makeOrder(paymentMethod),
          }}
        />
      );
      expect(screen.getByRole('status')).toHaveTextContent(
        'Pages.Checkout.NoPaymentRequired'
      );
      expect(screen.queryByText('QR payment request')).not.toBeInTheDocument();
      expect(
        screen.queryByText('Pages.Checkout.CashPayment.Title')
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(document.querySelector('canvas, svg')).toBeNull();
    }
  );

  it('keeps QR payment instructions for a positive total', () => {
    render(
      <CompletedOrderCard
        completedOrder={{
          eventName: 'Test event',
          order: makeOrder('QR_PAYMENT', 100),
        }}
      />
    );
    expect(screen.getByText('QR payment request')).toBeInTheDocument();
    expect(
      screen.queryByText('Pages.Checkout.NoPaymentRequired')
    ).not.toBeInTheDocument();
  });

  it.each([
    'QR_PAYMENT',
    'CASH',
    'CUSTOM_PAYMENT_LINK',
    'OFEED_PAYMENT',
  ] as const)(
    'shows no payment request in a free %s entry detail',
    paymentMethod => {
      render(
        <EntryPaymentSection
          eventName="Test event"
          paymentMethod={paymentMethod}
          totalAmount={0}
          currency="CZK"
          qrPayment={qrPayment}
        />
      );
      expect(screen.getByRole('status')).toHaveTextContent(
        'Pages.Checkout.NoPaymentRequired'
      );
      expect(document.querySelector('canvas')).toBeNull();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    }
  );
});
