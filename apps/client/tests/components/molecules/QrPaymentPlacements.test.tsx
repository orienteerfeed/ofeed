import type { QrPaymentInstruction } from '@repo/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QrPaymentInstructions } from '@/pages/Checkout/QrPaymentInstructions';
import { EntryPaymentSection } from '@/pages/Event/Entries/EntryPaymentSection';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'cs' } }),
}));
vi.mock('@/utils', () => ({ toast: vi.fn() }));
vi.mock('@/components/atoms', async () => ({
  ...(await import('@/components/ui/button')),
  ...(await import('@/components/ui/badge')),
}));
vi.mock('qrcode.react', async () => {
  const { forwardRef } = await import('react');
  return {
    QRCodeCanvas: forwardRef<HTMLCanvasElement, { value: string }>(
      ({ value }, ref) => (
        <canvas ref={ref} data-testid="payment-qr" data-payload={value} />
      )
    ),
  };
});
const payment: QrPaymentInstruction = {
  payload: 'SPD*1.0*ACC:CZ6508000000192000145399*AM:250.00*CC:CZK*X-VS:1234',
  bankAccountIban: 'CZ6508000000192000145399',
  bankAccountName: 'Test club',
  amount: 250,
  currency: 'CZK',
  paymentReference: '1234',
  constantSymbol: '0308',
  recipientMessage: 'Test',
};
afterEach(() => vi.restoreAllMocks());

describe('QR payment action placements', () => {
  it.each([
    ['CZ6508000000192000145399', '19-2000145399/0800'],
    ['CZ8020100000002201340123', '2201340123/2010'],
    ['DE89370400440532013000', null],
  ])(
    'shows a domestic account alongside %s when available',
    (iban, domestic) => {
      render(
        <EntryPaymentSection
          eventName="Test event"
          paymentMethod="QR_PAYMENT"
          totalAmount={250}
          currency="CZK"
          qrPayment={{ ...payment, bankAccountIban: iban }}
        />
      );
      expect(screen.getByText(iban)).toBeInTheDocument();
      if (domestic) expect(screen.getByText(domestic)).toBeInTheDocument();
      else
        expect(
          screen.queryByText('Pages.Event.EntriesManage.Detail.Payment.Account')
        ).not.toBeInTheDocument();
    }
  );

  it('includes both Czech account and IBAN in printed payment details', () => {
    const write = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/png;base64,test'
    );
    vi.spyOn(window, 'open').mockReturnValue({
      document: { write, close: vi.fn() },
      focus: vi.fn(),
      print: vi.fn(),
    } as unknown as Window);
    render(
      <EntryPaymentSection
        eventName="Test event"
        paymentMethod="QR_PAYMENT"
        totalAmount={250}
        currency="CZK"
        qrPayment={payment}
      />
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Pages.Event.EntriesManage.Detail.Payment.Print',
      })
    );
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('19-2000145399/0800')
    );
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining(payment.bankAccountIban)
    );
  });
  it.each(['checkout', 'entry-detail'])(
    'downloads the rendered payment QR in %s',
    placement => {
      vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
        'data:image/png;base64,iVBORw0KGgo='
      );
      const download = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => {});
      if (placement === 'checkout')
        render(<QrPaymentInstructions payment={payment} />);
      else
        render(
          <EntryPaymentSection
            eventName="Test event"
            paymentMethod="QR_PAYMENT"
            totalAmount={250}
            currency="CZK"
            qrPayment={payment}
          />
        );
      expect(screen.getByTestId('payment-qr')).toHaveAttribute(
        'data-payload',
        payment.payload
      );
      expect(
        screen.getByRole('button', { name: 'Pages.Checkout.QrPayment.ShareQr' })
      ).toBeEnabled();
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Pages.Checkout.QrPayment.DownloadQr',
        })
      );
      expect(download).toHaveBeenCalledOnce();
      expect(document.querySelector('a[href^="spayd:"]')).toBeNull();
    }
  );
});
