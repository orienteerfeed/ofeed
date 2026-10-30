import type { EventEntryTimeline } from '@repo/shared';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/i18n/locales/en/translation.json';

const query = vi.hoisted(() => ({
  data: undefined as { eventEntryTimeline: EventEntryTimeline } | undefined,
  previousData: undefined as
    { eventEntryTimeline: EventEntryTimeline } | undefined,
  loading: false,
  error: undefined as Error | undefined,
  refetch: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/pages/Event/Insights/useEntryTimeline', () => ({
  useEntryTimeline: () => query,
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

import { EventEntryInsightPage } from '@/pages/Event/Insights/EventEntryInsightPage';

const entries = en.Pages.Insights.Entries;
const timeline: EventEntryTimeline = {
  timezone: 'Europe/Prague',
  entriesOpenOn: '2026-03-01',
  entriesCloseOn: '2026-03-05',
  eventOn: '2026-03-08',
  days: [
    {
      date: '2026-03-02',
      classId: 1,
      className: 'D21',
      entries: 3,
      lateEntries: 0,
    },
    {
      date: '2026-03-06',
      classId: 1,
      className: 'D21',
      entries: 1,
      lateEntries: 1,
    },
  ],
};

describe('EventEntryInsightPage', () => {
  beforeEach(() => {
    query.data = undefined;
    query.previousData = undefined;
    query.loading = false;
    query.error = undefined;
  });

  it('shows a loading state without zeros', () => {
    query.loading = true;
    render(<EventEntryInsightPage />);
    expect(screen.getByRole('status')).toHaveTextContent(entries.Loading);
    expect(screen.queryByText(entries.Total)).not.toBeInTheDocument();
  });

  it('shows an error instead of an empty chart when loading fails', () => {
    query.error = new Error('boom');
    render(<EventEntryInsightPage />);
    expect(screen.getByRole('alert')).toHaveTextContent(entries.Error);
    expect(screen.queryByText(entries.Total)).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no entries', () => {
    query.data = { eventEntryTimeline: { ...timeline, days: [] } };
    render(<EventEntryInsightPage />);
    expect(screen.getByText(entries.Empty)).toBeInTheDocument();
  });

  it('shows the summary and the daily table', () => {
    query.data = { eventEntryTimeline: timeline };
    render(<EventEntryInsightPage />);
    const tile = (label: string) =>
      screen.getByText(label, { selector: 'dt' }).nextElementSibling;
    expect(tile(entries.Total)).toHaveTextContent('4');
    expect(tile(entries.LateEntries)).toHaveTextContent('1');
    expect(tile(entries.FinalDaysShare)).toHaveTextContent('0%');
    expect(screen.getByRole('option', { name: 'D21' })).toBeInTheDocument();
    expect(
      screen
        .getByRole('table', { name: entries.Table })
        .querySelectorAll('tbody tr')
    ).toHaveLength(2);
  });
});
