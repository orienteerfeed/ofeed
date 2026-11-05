import type en from '@/i18n/locales/en/translation.json';
import type { EntryReport } from './entry-report.utils';
export type EntryReportLabel = keyof typeof en.EntryReport;
export const reportMoney = (
  cents: number,
  currency: string,
  language: string
) =>
  new Intl.NumberFormat(language, { style: 'currency', currency }).format(
    cents / 100
  );
export function entryPaymentMethodName(
  method: string | null,
  t: (
    key:
      | 'EntryReport.Unknown'
      | `Pages.Checkout.PaymentMethods.Methods.${'CASH' | 'QR_PAYMENT' | 'OFEED_PAYMENT' | 'CUSTOM_PAYMENT_LINK'}`
  ) => string
) {
  if (
    method === 'CASH' ||
    method === 'QR_PAYMENT' ||
    method === 'OFEED_PAYMENT' ||
    method === 'CUSTOM_PAYMENT_LINK'
  )
    return t(`Pages.Checkout.PaymentMethods.Methods.${method}`);
  return t('EntryReport.Unknown');
}
export function entryReportExportSections(
  report: EntryReport,
  label: (key: EntryReportLabel) => string,
  language: string,
  timezone: string,
  methodName: (method: string | null) => string
): (string | number)[][][] {
  const time = (value: string) =>
    new Intl.DateTimeFormat(language, {
      timeZone: timezone,
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date(value));
  return [
    [
      [label('FinancialSummary')],
      [
        label('Currency'),
        label('OrderTotal'),
        label('Received'),
        label('Outstanding'),
        label('LegacyPaid'),
        label('PaidOrders'),
        label('UnpaidOrders'),
      ],
      ...report.currencies.map(c => [
        c.currency,
        c.total / 100,
        c.received / 100,
        c.outstanding / 100,
        c.legacyPaid / 100,
        c.paidOrders,
        c.unpaidOrders,
      ]),
    ],
    [
      [label('PaymentMethods')],
      [
        label('PaymentMethod'),
        label('Orders'),
        label('Currency'),
        label('OrderTotal'),
      ],
      ...report.methods.flatMap(m =>
        m.amounts.map(a => [
          methodName(m.method),
          m.orders,
          a.currency,
          a.amount / 100,
        ])
      ),
    ],
    [
      [label('DailyOrders')],
      [label('Date'), label('Competitors'), label('Orders')],
      ...report.days.map(d => [d.date, d.entries, d.orders]),
    ],
    [
      [label('Categories')],
      [label('Class'), label('Competitors'), label('Orders')],
      ...report.categories.map(c => [c.name, c.entries, c.orders]),
    ],
    [
      [label('RaceDay')],
      [label('ReceivedAt'), label('Competitors')],
      ...report.raceDay.map(p => [
        time(new Date(p.time).toISOString()),
        p.total,
      ]),
    ],
    [
      [label('EntryList')],
      [
        label('ReceivedAt'),
        label('PaymentReference'),
        label('Competitor'),
        label('Class'),
        label('Club'),
        label('Card'),
        label('PaymentMethod'),
        label('Price'),
        label('Currency'),
        label('Paid'),
        label('PromoCode'),
      ],
      ...report.rows.map(row => [
        time(row.order.receivedAt),
        row.order.paymentReference,
        `${row.lastname} ${row.firstname}`,
        row.className,
        row.organisation ?? '',
        row.card ?? '',
        methodName(row.order.paymentMethod),
        row.amount,
        row.order.currency,
        row.order.paid
          ? label('Yes')
          : row.order.receivedAmount > 0
            ? label('Partial')
            : label('No'),
        row.order.promoCode ?? '',
      ]),
    ],
  ];
}
