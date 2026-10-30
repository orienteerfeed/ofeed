import { describe, expect, it } from 'vitest';
import type { EntryPaymentInsight } from '@repo/shared';
import {
  filterPaymentInsights,
  insightCsv,
  paymentDay,
  paymentLocalDate,
  summarizePaymentInsights,
  type PaymentInsightFilters,
} from '@/pages/Event/Insights/payment-insight.utils';

const filters: PaymentInsightFilters = {
  from: '',
  to: '',
  method: '',
  deviceId: '',
  search: '',
};
const receipt = (
  change: Partial<EntryPaymentInsight> = {}
): EntryPaymentInsight => ({
  id: 'receipt',
  eventId: 'race',
  entryId: 'order',
  clientPaymentId: 'b42c66e5-98f7-4f1b-9fd6-0d436660b624',
  amount: 0.1,
  currency: 'CZK',
  method: 'CASH',
  deviceId: 'desk',
  operatorId: 7,
  paidAt: '2026-10-25T09:00:00Z',
  recordedAt: '2026-10-26T10:00:00Z',
  source: 'MANUAL',
  bankTransactionId: null,
  bookingDate: null,
  paymentReference: '2600000001',
  contactFirstname: 'Jan',
  contactLastname: 'Novák',
  ...change,
});

describe('payment insights', () => {
  it('includes complete local days across spring and autumn DST transitions', () => {
    for (const [day, before, start, end, after] of [
      [
        '2026-03-29',
        '2026-03-28T22:59:59.999Z',
        '2026-03-28T23:00:00Z',
        '2026-03-29T21:59:59.999Z',
        '2026-03-29T22:00:00Z',
      ],
      [
        '2026-10-25',
        '2026-10-24T21:59:59.999Z',
        '2026-10-24T22:00:00Z',
        '2026-10-25T22:59:59.999Z',
        '2026-10-25T23:00:00Z',
      ],
    ] as const) {
      const rows = [before, start, end, after].map((paidAt, i) =>
        receipt({ id: String(i), paidAt })
      );
      expect(
        filterPaymentInsights(
          rows,
          { ...filters, from: day, to: day },
          'Europe/Prague'
        ).map(row => row.id)
      ).toEqual(['2', '1']);
    }
    expect(paymentLocalDate('2026-10-25T00:00:00Z', 'America/New_York')).toBe(
      '2026-10-24'
    );
  });
  it('combines reference/name, method, device and paidAt filters without using recordedAt', () => {
    const rows = [
      receipt(),
      receipt({ id: 'other', method: 'QR' }),
      receipt({ id: 'else', deviceId: 'other' }),
    ];
    const selected = {
      ...filters,
      from: '2026-10-25',
      to: '2026-10-25',
      method: 'CASH',
      deviceId: 'desk',
      search: 'NOVÁK',
    };
    expect(
      filterPaymentInsights(rows, selected, 'Europe/Prague').map(row => row.id)
    ).toEqual(['receipt']);
    expect(
      filterPaymentInsights(rows, { ...filters, search: '2600000001' }, 'UTC')
    ).toHaveLength(3);
    expect(
      filterPaymentInsights(rows, { ...filters, search: 'missing' }, 'UTC')
    ).toEqual([]);
  });
  it('sorts latest receipts first with stable ID ties and does not mutate the source', () => {
    const rows = [
      receipt({ id: 'b' }),
      receipt({ id: 'a' }),
      receipt({ id: 'new', paidAt: '2026-10-26T00:00:00Z' }),
    ];
    expect(
      filterPaymentInsights(rows, filters, 'UTC').map(row => row.id)
    ).toEqual(['new', 'a', 'b']);
    expect(rows[0]?.id).toBe('b');
  });
  it('sums exact cents over all rows and separates currencies and methods', () => {
    const rows = [
      receipt(),
      receipt({ method: 'QR', amount: 0.2 }),
      receipt({ amount: 0.29 }),
      receipt({ currency: 'EUR', amount: 5 }),
    ];
    expect(summarizePaymentInsights(rows)).toEqual([
      { currency: 'CZK', cash: 39, qr: 20, total: 59, count: 3 },
      { currency: 'EUR', cash: 500, qr: 0, total: 500, count: 1 },
    ]);
    expect(summarizePaymentInsights([])).toEqual([]);
  });
  it('exports more than one page and escapes CSV separators, quotes, line breaks and formulas', () => {
    const rows = Array.from({ length: 30 }, (_, i) => [i, `contact-${i}`]);
    expect(insightCsv(rows).split('\r\n')).toHaveLength(30);
    expect(
      insightCsv([
        ['=1+1', ' +cmd', '@SUM(A1)', '-1', '\tcmd', 'a;"b\nc'],
        [0.29],
      ])
    ).toBe(
      '\uFEFF"\'=1+1";"\' +cmd";"\'@SUM(A1)";"\'-1";"\'\tcmd";"a;""b\nc"\r\n"0.29"'
    );
  });
  it('dates bank imports by the booking day, not the server match time', () => {
    const bank = receipt({
      method: 'QR',
      source: 'BANK_IMPORT',
      bankTransactionId: 'bt-1',
      bookingDate: '2026-10-24',
      paidAt: '2026-10-26T07:00:00Z',
    });
    expect(paymentDay(bank, 'Europe/Prague')).toBe('2026-10-24');
    expect(paymentDay(receipt(), 'Europe/Prague')).toBe('2026-10-25');
    expect(
      filterPaymentInsights(
        [bank, receipt()],
        { ...filters, from: '2026-10-24', to: '2026-10-24' },
        'Europe/Prague'
      ).map(payment => payment.source)
    ).toEqual(['BANK_IMPORT']);
  });
});
