import type { EntryPaymentInsight } from '@repo/shared';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/i18n/locales/en/translation.json';

const query = vi.hoisted(() => ({
  data: [] as EntryPaymentInsight[],
  isPending: false,
  isFetching: false,
  isError: false,
  refetch: vi.fn(),
}));
vi.mock('@/pages/Event/Insights/usePaymentInsights', () => ({
  usePaymentInsights: () => query,
}));
vi.mock('@/hooks/useEvent', () => ({
  useEvent: () => ({
    event: { name: 'Test Race', timezone: 'Europe/Prague' },
    loading: false,
  }),
}));
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
vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ eventId: 'race' }),
  Link: ({
    to,
    params,
    children,
    ...props
  }: {
    to: string;
    params?: Record<string, string>;
    children: React.ReactNode;
  }) => (
    <a
      href={to.replace(
        /\$(\w+)/g,
        (_match, key: string) => params?.[key] ?? ''
      )}
      {...props}
    >
      {children}
    </a>
  ),
}));
vi.mock('@/templates/MainPageLayout', () => ({
  MainPageLayout: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));
vi.mock('@/components/molecules', () => ({
  BackLink: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock('@/utils', () => ({ toast: vi.fn() }));

import { EventPaymentInsightPage } from '@/pages/Event/Insights/EventPaymentInsightPage';
import { EventInsightsPage } from '@/pages/Event/Insights/EventInsightsPage';

function receipts(): EntryPaymentInsight[] {
  return Array.from({ length: 30 }, (_, i) => ({
    id: `receipt-${i.toString().padStart(2, '0')}`,
    eventId: 'race',
    entryId: `order-${i}`,
    clientPaymentId: 'b42c66e5-98f7-4f1b-9fd6-0d436660b624',
    amount: 0.1,
    currency: 'CZK',
    method: 'CASH',
    deviceId: 'desk-1',
    operatorId: 7,
    paidAt: '2026-10-25T09:00:00Z',
    recordedAt: '2026-10-26T10:00:00Z',
    paymentReference: `26000000${i.toString().padStart(2, '0')}`,
    contactFirstname: 'Jan',
    contactLastname: `Contact-${i}`,
  }));
}

beforeEach(() => {
  query.data = receipts();
  query.isPending = false;
  query.isFetching = false;
  query.isError = false;
});

describe('event insights UI', () => {
  it('links to payment, timing-card and anomaly insights', () => {
    render(<EventInsightsPage />);
    expect(
      screen.getByRole('heading', { name: 'Insights', level: 1 })
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByRole('link', { name: 'Open insight' })
        .map(link => link.getAttribute('href'))
    ).toEqual([
      '/events/race/insights/anomalies',
      '/events/race/insights/cards',
      '/events/race/insights/payments',
    ]);
  });
  it('paginates receipt rows while totals cover every page, and filters by contact', () => {
    render(<EventPaymentInsightPage />);
    expect(screen.getByText('Payment count: 30')).toBeInTheDocument();
    expect(screen.getAllByText('CZK 3.00')).toHaveLength(2);
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(
      26
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(
      6
    );
    expect(screen.getByRole('link', { name: '2600000029' })).toHaveAttribute(
      'href',
      '/events/race/entries/order-29'
    );
    fireEvent.change(screen.getByLabelText('Search'), {
      target: { value: 'Contact-29' },
    });
    expect(screen.getByText('Payment count: 1')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(
      2
    );
  });
  it('prints all filtered rows, timezone and summary, regardless of pagination', () => {
    query.data[0]!.contactFirstname = '<script>alert(1)</script>';
    const write = vi.fn();
    const print = vi.fn();
    vi.spyOn(window, 'open').mockReturnValue({
      document: { write, close: vi.fn() },
      focus: vi.fn(),
      print,
    } as unknown as Window);
    render(<EventPaymentInsightPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    const html = write.mock.calls[0]?.[0] as string;
    expect(html).toContain('Contact-29');
    expect(html).toContain('Europe/Prague');
    expect(html).toContain('Test Race');
    expect(html).toContain('3.00');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(print).toHaveBeenCalledOnce();
  });
  it('exports every filtered receipt with metadata and summary', async () => {
    query.data[0]!.method = 'QR';
    let downloaded: Blob | undefined;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        downloaded = blob;
        return 'blob:test';
      }),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<EventPaymentInsightPage />);
    fireEvent.change(screen.getByLabelText('Method'), {
      target: { value: 'CASH' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    const text = await new Promise<string>(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(downloaded!);
    });
    expect(text).toContain('Contact-29');
    expect(text).toContain('Europe/Prague');
    expect(text).toContain('Test Race');
    expect(text).not.toContain('Contact-0');
    expect(text).toContain('"CZK";"2.90";"0.00";"2.90";"29"');
  });
  it('does not show receipts or totals on a load error, and supports retry', () => {
    query.isError = true;
    render(<EventPaymentInsightPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load');
    expect(screen.queryByText('Payment count: 30')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(query.refetch).toHaveBeenCalledOnce();
  });
  it('distinguishes empty results and invalid date ranges', () => {
    query.data = [];
    render(<EventPaymentInsightPage />);
    expect(
      screen.getByText('No received payments match the selected filters.')
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Received from'), {
      target: { value: '2026-10-26' },
    });
    fireEvent.change(screen.getByLabelText('Received to'), {
      target: { value: '2026-10-25' },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('start date');
    expect(screen.getByRole('button', { name: 'Print' })).toBeDisabled();
  });
});
