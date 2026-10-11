import type { PaymentMethodType, QrPaymentInstruction } from '@repo/shared';
import { Printer, QrCode, Share2, WalletCards } from 'lucide-react';
import { useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/atoms';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/utils';

import { formatEntryFee } from './EntryClassCard';

interface EntryPaymentSectionProps {
  eventName: string;
  paymentMethod: PaymentMethodType | null;
  totalAmount: number;
  currency: string;
  qrPayment: QrPaymentInstruction | null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, character => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return entities[character] ?? character;
  });
}

export function EntryPaymentSection({
  eventName,
  paymentMethod,
  totalAmount,
  currency,
  qrPayment,
}: EntryPaymentSectionProps) {
  const { t, i18n } = useTranslation();
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const paymentMethodName = paymentMethod
    ? t(`Pages.Checkout.PaymentMethods.Methods.${paymentMethod}`)
    : t('Pages.Event.EntriesManage.Detail.PaymentMethod.NotSpecified');
  const paymentRows: Array<[string, string]> = qrPayment
    ? [
        [
          t('Pages.Event.EntriesManage.Detail.Payment.Account'),
          qrPayment.bankAccountIban,
        ],
        [
          t('Pages.Event.EntriesManage.Detail.Payment.VariableSymbol'),
          qrPayment.paymentReference,
        ],
        [
          t('Pages.Event.EntriesManage.Detail.Payment.ConstantSymbol'),
          qrPayment.constantSymbol,
        ],
        [
          t('Pages.Event.EntriesManage.Detail.Payment.RecipientMessage'),
          qrPayment.recipientMessage,
        ],
      ]
    : [];

  const paymentText = [
    `${t('Pages.Event.EntriesManage.Detail.Payment.Title')}: ${eventName}`,
    ...paymentRows.map(([label, value]) => `${label}: ${value}`),
    `${t('Pages.Event.EntriesManage.Detail.Payment.Amount')}: ${formatEntryFee(
      totalAmount,
      currency,
      i18n.language
    )}`,
  ].join('\n');

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: t('Pages.Event.EntriesManage.Detail.Payment.Title'),
          text: paymentText,
        });
        return;
      }

      await navigator.clipboard.writeText(paymentText);
      toast({
        title: t('Pages.Event.EntriesManage.Detail.Payment.Copied'),
        variant: 'success',
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      toast({
        title: t('Pages.Event.EntriesManage.Detail.Payment.ShareError'),
        variant: 'error',
      });
    }
  };

  const handlePrint = () => {
    const canvas = qrCanvasRef.current;
    if (!canvas || !qrPayment) return;

    const rows = paymentRows
      .map(
        ([label, value]) =>
          `<div class="row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`
      )
      .join('');
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.opener = null;

    printWindow.document.write(`<!doctype html>
      <html><head><title>${escapeHtml(t('Pages.Event.EntriesManage.Detail.Payment.Title'))}</title>
      <style>
        body { color: #111; font-family: Arial, sans-serif; margin: 32px; }
        main { margin: 0 auto; max-width: 520px; text-align: center; }
        img { height: 220px; margin: 20px 0; width: 220px; }
        dl { margin: 0; text-align: left; }
        .row { border-top: 1px solid #ddd; display: grid; gap: 12px; grid-template-columns: 1fr 1.5fr; padding: 10px 0; }
        dt { color: #555; } dd { font-family: monospace; margin: 0; overflow-wrap: anywhere; text-align: right; }
      </style></head><body><main>
        <h1>${escapeHtml(t('Pages.Event.EntriesManage.Detail.Payment.Title'))}</h1>
        <p>${escapeHtml(eventName)}</p>
        <img src="${canvas.toDataURL('image/png')}" alt="" />
        <dl>${rows}<div class="row"><dt>${escapeHtml(
          t('Pages.Event.EntriesManage.Detail.Payment.Amount')
        )}</dt><dd>${escapeHtml(formatEntryFee(totalAmount, currency, i18n.language))}</dd></div></dl>
      </main></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <WalletCards className="h-5 w-5" />
          {t('Pages.Event.EntriesManage.Detail.Payment.Title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">
            {t('Pages.Event.EntriesManage.Detail.Payment.Method')}
          </span>
          <span className="font-medium">{paymentMethodName}</span>
        </div>
        {paymentMethod === 'QR_PAYMENT' ? (
          qrPayment ? (
            <>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div className="w-fit justify-self-center rounded-md bg-white p-2 sm:order-2 sm:justify-self-end">
                  <QRCodeCanvas
                    ref={qrCanvasRef}
                    value={qrPayment.payload}
                    size={112}
                    level="M"
                    marginSize={1}
                    aria-label={t(
                      'Pages.Event.EntriesManage.Detail.Payment.QrCodeAriaLabel'
                    )}
                  />
                </div>
                <dl className="divide-y rounded-md border text-sm sm:order-1">
                  {paymentRows.map(([label, value]) => (
                    <div
                      key={label}
                      className="grid gap-2 px-3 py-2 sm:grid-cols-2"
                    >
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="break-all font-mono text-right">
                        {value}
                      </dd>
                    </div>
                  ))}
                  <div className="grid gap-2 px-3 py-2 sm:grid-cols-2">
                    <dt className="text-muted-foreground">
                      {t('Pages.Event.EntriesManage.Detail.Payment.Amount')}
                    </dt>
                    <dd className="text-right font-semibold">
                      {formatEntryFee(totalAmount, currency, i18n.language)}
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button type="button" variant="outline" onClick={handlePrint}>
                  <Printer className="h-4 w-4" />
                  {t('Pages.Event.EntriesManage.Detail.Payment.Print')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleShare()}
                >
                  <Share2 className="h-4 w-4" />
                  {t('Pages.Event.EntriesManage.Detail.Payment.Share')}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t(
                'Pages.Event.EntriesManage.Detail.Payment.QrDetailsUnavailable'
              )}
            </p>
          )
        ) : (
          <div className="flex items-center gap-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
            <QrCode className="h-4 w-4 shrink-0" />
            {t('Pages.Event.EntriesManage.Detail.Payment.ReferenceOnly')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
