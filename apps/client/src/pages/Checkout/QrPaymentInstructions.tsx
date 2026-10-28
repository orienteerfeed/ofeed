import type { EntryOrder } from '@repo/shared';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeCanvas } from 'qrcode.react';

import { QrPaymentActions } from '@/components/molecules/QrPaymentActions';

export function QrPaymentInstructions({
  payment,
}: {
  payment: NonNullable<EntryOrder['qrPayment']>;
}) {
  const { t } = useTranslation();
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const accountDisplay = [payment.bankAccountName, payment.bankAccountIban]
    .filter(Boolean)
    .join(' · ');

  return (
    <section
      className="space-y-4 border-t pt-4 text-center"
      aria-labelledby="qr-payment-title"
    >
      <div className="space-y-1">
        <h3 id="qr-payment-title" className="font-semibold">
          {t('Pages.Checkout.QrPayment.Title')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t('Pages.Checkout.QrPayment.Description')}
        </p>
      </div>
      <div className="inline-flex rounded-lg border bg-white p-3">
        <QRCodeCanvas
          ref={qrCanvasRef}
          marginSize={4}
          value={payment.payload}
          size={208}
          level="M"
          aria-label={t('Pages.Checkout.QrPayment.QrCodeAriaLabel')}
        />
      </div>
      {accountDisplay ? (
        <p className="text-sm text-muted-foreground">{accountDisplay}</p>
      ) : null}
      <QrPaymentActions canvasRef={qrCanvasRef} />
    </section>
  );
}
