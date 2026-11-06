import { describe, expect, it } from 'vitest';
import type { EntryReportOrder, EventEntryTimeline } from '@repo/shared';
import {
  buildEntryReport,
  buildEntryCumulativeCurve,
} from '@/pages/Event/Insights/entry-report.utils';
import { entryReportExportSections } from '@/pages/Event/Insights/entry-report-format';
import { insightCsv } from '@/pages/Event/Insights/payment-insight.utils';
import { entryReportPrintHtml } from '@/pages/Event/Insights/entry-report-print';

export const reportOrder = (
  id: string,
  overrides: Partial<EntryReportOrder> = {}
): EntryReportOrder => ({
  id,
  receivedAt: '2026-11-01T08:00:00Z',
  status: 'RECEIVED',
  paymentReference: '2612345678',
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
      id: Number(id.replace(/\D/g, '')) || 1,
      classId: 1,
      className: 'H21',
      firstname: 'Jan',
      lastname: 'Test',
      organisation: null,
      card: 123,
      cardRental: false,
      amount: 100,
    },
  ],
  ...overrides,
});
export const reportTimeline = (
  orders: EntryReportOrder[]
): EventEntryTimeline => ({
  timezone: 'Europe/Prague',
  entriesOpenOn: '2026-10-28',
  entriesCloseOn: '2026-10-31',
  eventOn: '2026-11-01',
  days: [],
  orders,
});

describe('extended entry report', () => {
  it('excludes cancelled/rejected orders and separates currencies and partial balances', () => {
    const report = buildEntryReport(
      reportTimeline([
        reportOrder('1'),
        reportOrder('2', { status: 'CANCELLED' }),
        reportOrder('3', {
          currency: 'EUR',
          totalAmount: 5,
          receivedAmount: 5,
          outstandingAmount: 0,
          paid: true,
        }),
      ]),
      '',
      '2026-11-03'
    );
    expect(report.orders).toBe(2);
    expect(report.cancelled).toBe(1);
    expect(report.currencies).toEqual([
      {
        currency: 'CZK',
        total: 10000,
        received: 4000,
        outstanding: 6000,
        legacyPaid: 0,
        paidOrders: 0,
        unpaidOrders: 1,
      },
      {
        currency: 'EUR',
        total: 500,
        received: 500,
        outstanding: 0,
        legacyPaid: 0,
        paidOrders: 1,
        unpaidOrders: 0,
      },
    ]);
  });
  it('counts orders once per day and class and scopes whole-order finances explicitly', () => {
    const base = reportOrder('1');
    base.items.push({ ...base.items[0]!, id: 2, classId: 2, className: 'D21' });
    const report = buildEntryReport(reportTimeline([base]), '1', '2026-11-03');
    expect(report.rows).toHaveLength(1);
    expect(report.orders).toBe(1);
    expect(report.days).toEqual([
      { date: '2026-11-01', entries: 1, orders: 1 },
    ]);
    expect(report.currencies[0]!.total).toBe(10000);
    expect(
      buildEntryReport(reportTimeline([base]), '', '2026-11-03').days[0]
    ).toMatchObject({ entries: 2, orders: 1 });
  });
  it('excludes after-race data and explains the hidden records', () => {
    const timeline = reportTimeline([
      reportOrder('1', { receivedAt: '2026-11-02T08:00:00Z' }),
    ]);
    expect(buildEntryReport(timeline, '', '2026-11-03')).toMatchObject({
      orders: 0,
      hiddenEntries: 1,
    });
    expect(buildEntryReport(timeline, '', '2026-11-03').rows).toEqual([]);
  });
  it('builds intraday cumulative counts and respects event timezone', () => {
    const report = buildEntryReport(
      reportTimeline([
        reportOrder('1', { receivedAt: '2026-10-31T23:30:00Z' }),
        reportOrder('2', { receivedAt: '2026-11-01T09:00:00Z' }),
      ]),
      '',
      '2026-11-03'
    );
    expect(report.raceDay.map(point => point.total)).toEqual([0, 1, 2]);
  });
  it('exports every row independently of UI pagination, escaping formulas and HTML', () => {
    const orders = Array.from({ length: 30 }, (_, i) =>
      reportOrder(String(i + 1))
    );
    orders[0]!.items[0]!.lastname = '=SUM(1)';
    orders[1]!.items[0]!.firstname = '<script>alert(1)</script>';
    const report = buildEntryReport(reportTimeline(orders), '', '2026-11-03');
    const sections = entryReportExportSections(
      report,
      key => key,
      'en',
      'Europe/Prague',
      method => method ?? 'Unknown'
    );
    expect(sections.at(-1)).toHaveLength(32);
    expect(insightCsv(sections.flat())).toContain("'=SUM(1)");
    const html = entryReportPrintHtml('Test', 'en', sections, null);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

it('prints each chart once and excludes small SVG legend icons', () => {
  const container = document.createElement('div');
  container.innerHTML =
    '<section data-entry-report-chart><h2>Entries</h2><div class="recharts-wrapper"><svg class="recharts-surface" width="400" height="200"><path d="M0,0L20,20"/></svg><div class="recharts-legend-wrapper">Trend<svg class="recharts-surface" width="14" height="14"/></div></div></section>';
  const html = entryReportPrintHtml('Report', 'en', [], container);
  const output = new DOMParser().parseFromString(html, 'text/html');
  expect(output.images).toHaveLength(1);
  expect(output.body.textContent).toContain('Trend');
});

it('keeps before/after midnight registrations distinct on the cumulative time axis', () => {
  const timeline = reportTimeline([
    reportOrder('1', { receivedAt: '2026-10-31T22:30:00Z' }),
    reportOrder('2', { receivedAt: '2026-10-31T23:30:00Z' }),
    reportOrder('3', { receivedAt: '2026-10-31T23:30:00Z' }),
    reportOrder('4', { receivedAt: '2026-11-02T08:00:00Z' }),
  ]);
  const report = buildEntryReport(timeline, '', '2026-11-03');
  const points = [
    { date: '2026-10-31', entries: 1, lateEntries: 0, total: 1 },
    { date: '2026-11-01', entries: 2, lateEntries: 2, total: 3 },
  ];
  const curve = buildEntryCumulativeCurve(
    report,
    points,
    timeline.timezone,
    Date.parse('2026-11-03T12:00:00Z')
  );
  const start = Date.parse('2026-10-31T23:00:00Z'); // Midnight Prague.
  expect(curve.filter(point => point.time < start).at(-1)!.total).toBe(1);
  expect(
    curve.find(point => point.time === Date.parse('2026-10-31T23:30:00Z'))!
      .total
  ).toBe(3);
  expect(curve.at(-1)!.total).toBe(3);
  expect(curve.at(-1)!.time).toBe(Date.parse('2026-11-01T22:59:59.999Z'));
});
