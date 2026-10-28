import type { EventAnomalyInsight } from '@repo/shared';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/i18n/locales/en/translation.json';

const query = vi.hoisted(() => ({
  data: undefined as { eventAnomalyInsight: EventAnomalyInsight } | undefined,
  previousData: undefined as
    { eventAnomalyInsight: EventAnomalyInsight } | undefined,
  loading: false,
  error: undefined as Error | undefined,
  refetch: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/pages/Event/Insights/useAnomalyInsight', () => ({
  useAnomalyInsight: () => query,
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

import { EventAnomalyInsightPage } from '@/pages/Event/Insights/EventAnomalyInsightPage';

function report(): EventAnomalyInsight {
  return {
    competitors: Array.from({ length: 30 }, (_, i) => ({
      id: i + 1,
      firstname: 'Jan',
      lastname: `Runner-${String(i + 1).padStart(2, '0')}`,
      registration: `REG${i + 1}`,
      bibNumber: i + 1,
      card: 1000 + i,
      classId: i < 20 ? 1 : 2,
      className: i < 20 ? 'H21' : 'D21',
      organisation: 'Club',
      startMode: 'StartList',
      startTime: '2026-10-28T10:00:13Z',
      findings: [
        {
          type: 'FAST_FIRST_SPLIT',
          controlCode: 31,
          splitSeconds: 20,
          medianSeconds: 100,
          differenceSeconds: 80,
          referenceCount: 8,
          intervalSeconds: null,
          phaseSeconds: null,
          nearestStartTime: null,
          punchTimes: [],
        },
        {
          type: 'START_PUNCH',
          controlCode: null,
          splitSeconds: null,
          medianSeconds: null,
          differenceSeconds: null,
          referenceCount: null,
          intervalSeconds: null,
          phaseSeconds: null,
          nearestStartTime: null,
          punchTimes: ['2026-10-28T10:00:13Z'],
        },
      ],
    })),
    coverage: [1, 2].flatMap(classId => [
      {
        classId,
        className: classId === 1 ? 'H21' : 'D21',
        type: 'FAST_FIRST_SPLIT' as const,
        status: 'EVALUATED' as const,
        evaluated: 30,
        total: 30,
      },
      {
        classId,
        className: classId === 1 ? 'H21' : 'D21',
        type: 'START_PUNCH' as const,
        status: 'EVALUATED' as const,
        evaluated: 30,
        total: 30,
      },
      {
        classId,
        className: classId === 1 ? 'H21' : 'D21',
        type: 'OFF_START_GRID' as const,
        status: 'NO_RELIABLE_GRID' as const,
        evaluated: 0,
        total: 30,
      },
    ]),
  };
}
beforeEach(() => {
  query.data = { eventAnomalyInsight: report() };
  query.previousData = undefined;
  query.error = undefined;
  query.loading = false;
  query.refetch.mockClear();
});
const findings = () => screen.getByRole('table', { name: 'Findings' });
describe('anomaly insight UI', () => {
  it('paginates competitors, retains all findings and links to class results', () => {
    render(<EventAnomalyInsightPage />);
    expect(within(findings()).getAllByRole('row')).toHaveLength(26);
    expect(
      within(findings()).getAllByText('Unusually fast first split')
    ).toHaveLength(25);
    expect(
      within(findings()).getAllByText('Observed start-unit punch')
    ).toHaveLength(25);
    expect(
      screen.getByText('Affected competitors').nextElementSibling
    ).toHaveTextContent('30');
    expect(within(findings()).getAllByRole('link')[0]).toHaveAttribute(
      'href',
      '/events/race?tab=results&class=D21'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(within(findings()).getAllByRole('row')).toHaveLength(6);
    expect(
      screen.getByRole('table', { name: 'Analysis coverage' })
    ).toHaveTextContent('No reliable start grid');
  });
  it('combines filters, keeps reference evidence and resets pagination', () => {
    render(<EventAnomalyInsightPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    fireEvent.change(screen.getByLabelText('Class'), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText('Finding type'), {
      target: { value: 'START_PUNCH' },
    });
    fireEvent.change(screen.getByLabelText('Search'), {
      target: { value: 'REG30' },
    });
    expect(within(findings()).getAllByRole('row')).toHaveLength(2);
    expect(within(findings()).getByText('Runner-30 Jan')).toBeInTheDocument();
    expect(
      within(findings()).getByText(/Peer median: 100 s/)
    ).toHaveTextContent('Reference competitors: 8');
    expect(
      screen.getByText('Affected competitors').nextElementSibling
    ).toHaveTextContent('1');
    expect(
      screen.getByRole('table', { name: 'Analysis coverage' })
    ).not.toHaveTextContent('H21');
    fireEvent.change(screen.getByLabelText('Search'), {
      target: { value: 'no match' },
    });
    expect(
      screen.getByText('No issues match the selected filters.')
    ).toBeInTheDocument();
  });
  it('shows insufficient-data coverage instead of declaring an unevaluated report clear', () => {
    query.data = {
      eventAnomalyInsight: {
        competitors: [],
        coverage: [
          {
            classId: 1,
            className: 'H21',
            type: 'FAST_FIRST_SPLIT',
            status: 'NO_COURSE',
            evaluated: 0,
            total: 10,
          },
        ],
      },
    };
    render(<EventAnomalyInsightPage />);
    expect(
      screen.getByText(/No checks could be evaluated/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('table', { name: 'Analysis coverage' })
    ).toHaveTextContent('Missing verified course');
    expect(screen.queryByText(/No anomalies found/)).not.toBeInTheDocument();
  });
  it('shows no findings only for evaluated data', () => {
    query.data!.eventAnomalyInsight.competitors = [];
    render(<EventAnomalyInsightPage />);
    expect(
      screen.getByText(/No anomalies found in the evaluated data/)
    ).toBeInTheDocument();
  });
  it('shows loading and initial errors, and retries without displaying clean results', () => {
    query.data = undefined;
    query.loading = true;
    const view = render(<EventAnomalyInsightPage />);
    expect(screen.getByText('Loading anomaly report…')).toBeInTheDocument();
    query.loading = false;
    query.error = new Error('denied');
    view.rerender(<EventAnomalyInsightPage />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not load the anomaly report.'
    );
    expect(screen.getByRole('button', { name: 'Print' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(query.refetch).toHaveBeenCalledOnce();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
  it('retains stale findings across failed refreshes and enables exports only after recovery', () => {
    const view = render(<EventAnomalyInsightPage />);
    query.previousData = query.data;
    query.data = undefined;
    query.error = new Error('offline');
    view.rerender(<EventAnomalyInsightPage />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Displayed data is out of date'
    );
    expect(findings()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    query.error = undefined;
    query.data = query.previousData;
    view.rerender(<EventAnomalyInsightPage />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print' })).toBeEnabled();
  });
  it('prints all filtered rows, evidence and coverage with escaped metadata', () => {
    query.data!.eventAnomalyInsight.competitors[0]!.firstname =
      '<script>alert(1)</script>';
    const write = vi.fn();
    const print = vi.fn();
    vi.spyOn(window, 'open').mockReturnValue({
      document: { write, close: vi.fn() },
      focus: vi.fn(),
      print,
    } as unknown as Window);
    render(<EventAnomalyInsightPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    const html = write.mock.calls[0]![0] as string;
    expect(html).toContain('Runner-30');
    expect(html).toContain('Runner-01');
    expect(html).toContain('Test Race');
    expect(html).toContain('Europe/Prague');
    expect(html).toContain('Peer median: 100 s');
    expect(html).toContain('No reliable start grid');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(print).toHaveBeenCalledOnce();
  });
  it('exports all filtered rows independently of pagination with formula protection', async () => {
    query.data!.eventAnomalyInsight.competitors[29]!.lastname = '=SUM(1)';
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
    render(<EventAnomalyInsightPage />);
    fireEvent.change(screen.getByLabelText('Class'), {
      target: { value: '2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    const text = await new Promise<string>(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob!);
    });
    expect(text).toContain("'=SUM(1) Jan");
    expect(text).toContain('Runner-21');
    expect(text).not.toContain('Runner-01');
    expect(text).toContain('Observed start punches');
    expect(text).toContain('Reference competitors: 8');
    expect(text).toContain('"Affected competitors";"10"');
    expect(text).toContain('No reliable start grid');
  });
});
