import type { EntryPaymentInsight } from '@repo/shared';

export interface PaymentInsightFilters {
  from: string;
  to: string;
  method: string;
  deviceId: string;
  search: string;
}

// ISO calendar dates compare lexically. Extracting them in the event timezone
// handles 23/25-hour DST days without assuming a fixed UTC offset.
export function paymentLocalDate(instant: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function filterPaymentInsights(
  payments: EntryPaymentInsight[],
  filters: PaymentInsightFilters,
  timezone: string
) {
  const search = filters.search.trim().toLocaleLowerCase();
  return payments
    .filter(payment => {
      const day =
        filters.from || filters.to
          ? paymentLocalDate(payment.paidAt, timezone)
          : '';
      return (
        (!filters.from || day >= filters.from) &&
        (!filters.to || day <= filters.to) &&
        (!filters.method || payment.method === filters.method) &&
        (!filters.deviceId || payment.deviceId === filters.deviceId) &&
        (!search ||
          `${payment.paymentReference} ${payment.contactFirstname} ${payment.contactLastname}`
            .toLocaleLowerCase()
            .includes(search))
      );
    })
    .sort(
      (a, b) =>
        new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime() ||
        a.id.localeCompare(b.id)
    );
}

export function summarizePaymentInsights(payments: EntryPaymentInsight[]) {
  const currencies = new Map<
    string,
    { currency: string; cash: number; qr: number; total: number; count: number }
  >();
  for (const payment of payments) {
    const summary = currencies.get(payment.currency) ?? {
      currency: payment.currency,
      cash: 0,
      qr: 0,
      total: 0,
      count: 0,
    };
    const cents = Math.round(payment.amount * 100);
    summary[payment.method === 'CASH' ? 'cash' : 'qr'] += cents;
    summary.total += cents;
    summary.count += 1;
    currencies.set(payment.currency, summary);
  }
  return [...currencies.values()].sort((a, b) =>
    a.currency.localeCompare(b.currency)
  );
}

export function insightCsv(rows: (string | number)[][]): string {
  return (
    '\uFEFF' +
    rows
      .map(row =>
        row
          .map(value => {
            // Prefix spreadsheet formula/control starters even after leading whitespace.
            const text =
              typeof value === 'string' && /^\s*[=+@\-\t\r\n]/.test(value)
                ? `'${value}`
                : String(value);
            return `"${text.replace(/"/g, '""')}"`;
          })
          .join(';')
      )
      .join('\r\n')
  );
}
