import { Banknote, CreditCard, Plus, ReceiptText } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/atoms';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDate, formatDateTime } from '@/lib/date';
import { toast } from '@/utils';

import { formatEntryFee } from './EntryClassCard';
import { useEntryPayments, useRecordEntryPayment } from './entries.hooks';

const DEVICE_ID_KEY = 'orienteerfeed:entry-payments:device-id';

function currentLocalDateTime() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

type Props = {
  eventId: string;
  entryId: string;
  totalAmount: number;
  currency: string;
  canRecord: boolean;
  onRecorded: () => Promise<unknown>;
};

export function EntryPaymentLedger({
  eventId,
  entryId,
  totalAmount,
  currency,
  canRecord,
  onRecorded,
}: Props) {
  const { t, i18n } = useTranslation();
  const { data: payments = [], isLoading } = useEntryPayments(eventId, entryId);
  const record = useRecordEntryPayment();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<'CASH' | 'QR'>('CASH');
  const [amount, setAmount] = useState('');
  const [paidAt, setPaidAt] = useState(currentLocalDateTime);
  const [deviceId, setDeviceId] = useState(
    () => window.localStorage.getItem(DEVICE_ID_KEY) ?? ''
  );
  const received = useMemo(
    () => payments.reduce((sum, payment) => sum + payment.amount, 0),
    [payments]
  );
  const balance = totalAmount - received;
  const state =
    received === 0
      ? 'Unpaid'
      : balance > 0
        ? 'Partial'
        : balance < 0
          ? 'Overpaid'
          : 'Paid';

  const reset = () => {
    setMethod('CASH');
    setAmount(Math.max(balance, 0).toFixed(2));
    setPaidAt(currentLocalDateTime());
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0 ||
      !deviceId.trim()
    )
      return;
    try {
      window.localStorage.setItem(DEVICE_ID_KEY, deviceId.trim());
      await record.mutateAsync({
        eventId,
        entryId,
        payment: {
          clientPaymentId: crypto.randomUUID(),
          method,
          amount: numericAmount,
          currency,
          paidAt: new Date(paidAt).toISOString(),
          deviceId: deviceId.trim(),
        },
      });
      await onRecorded();
      setOpen(false);
      reset();
      toast({
        title: t('Pages.Event.EntriesManage.PaymentLedger.Recorded'),
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        ...(error instanceof Error ? { description: error.message } : {}),
        variant: 'error',
      });
    }
  };
  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5" />
            {t('Pages.Event.EntriesManage.PaymentLedger.Title')}
          </CardTitle>
          {canRecord && (
            <Button
              size="sm"
              onClick={() => {
                reset();
                setOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              {t('Pages.Event.EntriesManage.PaymentLedger.Record')}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <div className="text-muted-foreground">
                {t('Pages.Event.EntriesManage.PaymentLedger.Received')}
              </div>
              <strong>
                {formatEntryFee(received, currency, i18n.language)}
              </strong>
            </div>
            <div>
              <div className="text-muted-foreground">
                {t('Pages.Event.EntriesManage.PaymentLedger.Balance')}
              </div>
              <strong>
                {formatEntryFee(Math.abs(balance), currency, i18n.language)}
              </strong>
            </div>
            <div>
              <div className="text-muted-foreground">
                {t('Pages.Event.EntriesManage.PaymentLedger.State')}
              </div>
              <strong>
                {t(`Pages.Event.EntriesManage.PaymentLedger.${state}`)}
              </strong>
            </div>
          </div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">
              {t('Loading', { ns: 'common' })}
            </p>
          ) : payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('Pages.Event.EntriesManage.PaymentLedger.Empty')}
            </p>
          ) : (
            <div className="divide-y rounded-md border">
              {payments.map(payment => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between gap-3 p-3 text-sm"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      {payment.method === 'CASH' ? (
                        <Banknote className="h-4 w-4" />
                      ) : (
                        <CreditCard className="h-4 w-4" />
                      )}
                      {t(
                        `Pages.Event.EntriesManage.PaymentLedger.Methods.${payment.method}`
                      )}
                    </div>
                    <div className="text-muted-foreground">
                      {payment.bookingDate
                        ? formatDate(payment.bookingDate)
                        : formatDateTime(payment.paidAt)}{' '}
                      · {payment.deviceId}
                    </div>
                  </div>
                  <strong>
                    {formatEntryFee(
                      payment.amount,
                      payment.currency,
                      i18n.language
                    )}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>
                {t('Pages.Event.EntriesManage.PaymentLedger.DialogTitle')}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="payment-method">
                  {t('Pages.Event.EntriesManage.PaymentLedger.Method')}
                </Label>
                <select
                  id="payment-method"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={method}
                  onChange={e => setMethod(e.target.value as 'CASH' | 'QR')}
                >
                  <option value="CASH">
                    {t('Pages.Event.EntriesManage.PaymentLedger.Methods.CASH')}
                  </option>
                  <option value="QR">
                    {t('Pages.Event.EntriesManage.PaymentLedger.Methods.QR')}
                  </option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment-amount">
                  {t('Pages.Event.EntriesManage.PaymentLedger.Amount')}
                </Label>
                <Input
                  id="payment-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment-time">
                  {t('Pages.Event.EntriesManage.PaymentLedger.PaidAt')}
                </Label>
                <Input
                  id="payment-time"
                  type="datetime-local"
                  value={paidAt}
                  onChange={e => setPaidAt(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment-device">
                  {t('Pages.Event.EntriesManage.PaymentLedger.Device')}
                </Label>
                <Input
                  id="payment-device"
                  maxLength={191}
                  value={deviceId}
                  onChange={e => setDeviceId(e.target.value)}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={record.isPending}>
                {t('Pages.Event.EntriesManage.PaymentLedger.Confirm')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
