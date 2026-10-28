import type { EventCardInsight } from '@repo/shared';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/i18n/locales/en/translation.json';

const query = vi.hoisted(() => ({
  data: undefined as { eventCardInsight: EventCardInsight } | undefined,
  previousData: undefined as { eventCardInsight: EventCardInsight } | undefined,
  loading: false,
  error: undefined as Error | undefined,
  refetch: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/pages/Event/Insights/useCardInsight', () => ({
  useCardInsight: () => query,
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
    search,
    ...props
  }: {
    to: string;
    search?: Record<string, string>;
    params?: Record<string, string>;
    children: React.ReactNode;
  }) => (
    <a
      href={
        to.replace(/\$(\w+)/g, (_match, key: string) => params?.[key] ?? '') +
        (search ? `?${new URLSearchParams(search)}` : '')
      }
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

import { EventCardInsightPage } from '@/pages/Event/Insights/EventCardInsightPage';

function report(): EventCardInsight {
  const row = (id: number, classId = 1) => ({
    id,
    classId,
    className: `Class ${classId}`,
    firstname: 'Jan',
    lastname: `Runner-${id}`,
    registration: `REG${id}`,
    bibNumber: id,
    organisation: 'Club',
    card: null,
  });
  return {
    missingCards: Array.from({ length: 30 }, (_, i) => row(i + 1)),
    duplicateCards: Array.from({ length: 30 }, (_, i) => ({
      card: 1000 + i,
      competitors: [
        { ...row(100 + i), card: 1000 + i },
        { ...row(200 + i, 2), card: 1000 + i },
      ],
    })),
  };
}
beforeEach(() => {
  query.data = { eventCardInsight: report() };
  query.previousData = undefined;
  query.loading = false;
  query.error = undefined;
  query.refetch.mockClear();
});
const missing = () =>
  screen.getByRole('region', { name: /Competitors without a card/ });
const duplicates = () =>
  screen.getByRole('region', { name: /Duplicate cards/ });

describe('timing-card insight UI', () => {
  it('paginates missing competitors and complete duplicate groups independently', () => {
    render(<EventCardInsightPage />);
    expect(within(missing()).getAllByRole('row')).toHaveLength(26);
    expect(within(duplicates()).getAllByRole('table')).toHaveLength(25);
    expect(
      screen.getByText('Competitors with duplicate cards').nextElementSibling
    ).toHaveTextContent('60');
    fireEvent.click(
      within(missing()).getByRole('button', { name: 'Next page' })
    );
    expect(within(missing()).getAllByRole('row')).toHaveLength(6);
    expect(within(duplicates()).getAllByRole('table')).toHaveLength(25);
    fireEvent.click(
      within(duplicates()).getByRole('button', { name: 'Next page' })
    );
    expect(within(duplicates()).getAllByRole('table')).toHaveLength(5);
  });
  it('combines class and search while retaining out-of-class duplicate members', () => {
    render(<EventCardInsightPage />);
    fireEvent.change(screen.getByLabelText('Class'), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText('Search'), {
      target: { value: 'REG200' },
    });
    expect(screen.getByText('Runner-100 Jan')).toBeInTheDocument();
    expect(screen.getByText('Runner-200 Jan')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Class 2' })).toHaveAttribute(
      'href',
      '/events/race?tab=results&class=Class+2'
    );
    expect(within(duplicates()).getAllByRole('table')).toHaveLength(1);
    expect(
      screen.getByText('Competitors with duplicate cards').nextElementSibling
    ).toHaveTextContent('2');
  });
  it('distinguishes loading, no issues and no filter matches', () => {
    query.data = undefined;
    query.loading = true;
    const view = render(<EventCardInsightPage />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading card report');
    expect(screen.getByRole('button', { name: 'Print' })).toBeDisabled();
    query.loading = false;
    query.data = { eventCardInsight: { missingCards: [], duplicateCards: [] } };
    view.rerender(<EventCardInsightPage />);
    expect(screen.getByText(/All competitors have a card/)).toBeInTheDocument();
    query.data = { eventCardInsight: report() };
    view.rerender(<EventCardInsightPage />);
    fireEvent.change(screen.getByLabelText('Search'), {
      target: { value: 'nonexistent' },
    });
    expect(
      screen.getByText('No issues match the selected filters.')
    ).toBeInTheDocument();
  });
  it('retains stale data on refresh failure and enables exports only after recovery', () => {
    const view = render(<EventCardInsightPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(query.refetch).toHaveBeenCalledOnce();
    query.previousData = query.data;
    query.data = undefined;
    query.error = new Error('offline');
    view.rerender(<EventCardInsightPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('out of date');
    expect(within(missing()).getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Print' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(query.refetch).toHaveBeenCalledTimes(2);
    query.error = undefined;
    query.data = query.previousData;
    view.rerender(<EventCardInsightPage />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print' })).toBeEnabled();
  });
  it('does not show a clean report when the initial read fails', () => {
    query.data = undefined;
    query.error = new Error('denied');
    render(<EventCardInsightPage />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not load the card report'
    );
    expect(
      screen.queryByText(/All competitors have a card/)
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print' })).toBeDisabled();
  });
  it('prints every filtered row and group with escaped metadata, independent of pages', () => {
    query.data!.eventCardInsight.missingCards[0]!.firstname =
      '<script>alert(1)</script>';
    const write = vi.fn();
    const print = vi.fn();
    vi.spyOn(window, 'open').mockReturnValue({
      document: { write, close: vi.fn() },
      focus: vi.fn(),
      print,
    } as unknown as Window);
    render(<EventCardInsightPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    const html = write.mock.calls[0]?.[0] as string;
    expect(html).toContain('Runner-30');
    expect(html).toContain('Runner-229');
    expect(html).toContain('Test Race');
    expect(html).toContain('Europe/Prague');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(print).toHaveBeenCalledOnce();
  });
  it('exports all filtered groups and their complete members with formula protection', async () => {
    query.data!.eventCardInsight.duplicateCards[29]!.competitors[0]!.lastname =
      '=SUM(1)';
    let blob: Blob | undefined;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((value: Blob) => {
        blob = value;
        return 'blob:test';
      }),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<EventCardInsightPage />);
    fireEvent.change(screen.getByLabelText('Class'), {
      target: { value: '2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    const text = await new Promise<string>(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob!);
    });
    expect(text).toContain('Runner-229');
    expect(text).toContain('Runner-100');
    expect(text).not.toContain('Runner-30');
    expect(text).toContain("'=SUM(1) Jan");
    expect(text).toContain('"Competitors with duplicate cards";"60"');
    expect(text).toContain('Test Race');
    expect(text).toContain('Europe/Prague');
  });
  it('keeps a zero-valued missing card visible in the table and CSV export', async () => {
    query.data!.eventCardInsight.missingCards[0]!.card = 0;
    let blob: Blob | undefined;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((value: Blob) => {
        blob = value;
        return 'blob:test';
      }),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<EventCardInsightPage />);
    expect(within(missing()).getByText('0')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    const text = await new Promise<string>(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob!);
    });
    expect(text).toContain('"Runner-1 Jan";"REG1";"Class 1";"Club";"1";"0"');
  });
});
