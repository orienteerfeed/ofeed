import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EntryReportOrder, EventEntryTimeline } from '@repo/shared';
import en from '@/i18n/locales/en/translation.json';
import { buildEntryReport } from '@/pages/Event/Insights/entry-report.utils';
import {
  EntryReportDetails,
  EntryReportSummary,
} from '@/pages/Event/Insights/EntryReportDetails';
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key
        .split('.')
        .reduce(
          (value: unknown, part) => (value as Record<string, unknown>)?.[part],
          en
        ) ?? key,
    i18n: { language: 'en' },
  }),
}));
const orders: EntryReportOrder[] = Array.from({ length: 30 }, (_, i) => ({
  id: `order-${String(i).padStart(2, '0')}`,
  receivedAt: '2026-11-01T08:00:00Z',
  status: 'RECEIVED',
  paymentReference: String(i),
  paymentMethod: 'CASH',
  currency: 'CZK',
  totalAmount: 100,
  receivedAmount: 40,
  outstandingAmount: 60,
  legacyPaid: false,
  paid: false,
  promoCode: null,
  promoDiscountAmount: 0,
  items: [
    {
      id: i + 1,
      classId: 1,
      className: 'H21',
      firstname: `Runner ${i}`,
      lastname: 'Test',
      organisation: null,
      card: 123,
      cardRental: false,
      amount: 100,
    },
  ],
}));
const timeline: EventEntryTimeline = {
  timezone: 'Europe/Prague',
  entriesOpenOn: '2026-10-28',
  entriesCloseOn: '2026-10-31',
  eventOn: '2026-11-01',
  days: [],
  orders,
};
describe('entry report details', () => {
  it('renders partial payments and paginates competitors while preserving summary totals', () => {
    const report = buildEntryReport(timeline, '', '2026-11-03');
    render(
      <>
        <EntryReportSummary
          report={report}
          classSelected
          financialsForAllClasses={false}
        />
        <EntryReportDetails report={report} timezone={timeline.timezone} />
      </>
    );
    expect(
      screen.getByText(en.EntryReport.FinanceWholeOrders)
    ).toBeInTheDocument();
    const list = screen.getByRole('table', { name: en.EntryReport.EntryList });
    expect(within(list).getAllByRole('row')).toHaveLength(26);
    expect(within(list).getAllByText(en.EntryReport.Partial)).toHaveLength(25);
    fireEvent.click(screen.getByRole('button', { name: en.EntryReport.Next }));
    expect(within(list).getAllByRole('row')).toHaveLength(6);
    expect(screen.getByText('Test Runner 29')).toBeInTheDocument();
    expect(
      screen.getByRole('table', { name: en.EntryReport.Categories })
    ).toHaveTextContent('30');
  });
  it('shows a clear race-day empty state and keeps legacy paid money distinct', () => {
    const report = buildEntryReport(
      {
        ...timeline,
        orders: [
          {
            ...orders[0]!,
            receivedAt: '2026-10-30T08:00:00Z',
            legacyPaid: true,
            paid: true,
            receivedAmount: 0,
            outstandingAmount: 0,
          },
        ],
      },
      '',
      '2026-11-03'
    );
    render(
      <>
        <EntryReportSummary
          report={report}
          classSelected={false}
          financialsForAllClasses={false}
        />
        <EntryReportDetails report={report} timezone={timeline.timezone} />
      </>
    );
    expect(
      screen.getByText(en.EntryReport.NoRaceDayEntries)
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(en.EntryReport.LegacyPaid).length
    ).toBeGreaterThan(0);
  });
});
