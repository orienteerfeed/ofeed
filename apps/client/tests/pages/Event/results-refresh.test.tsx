import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SplitTable } from '../../../src/pages/Event/SplitTable';
import { ClassIndividualSplit } from '../../../src/pages/Event/ClassIndividualSplit';
import { useRetainedResultData } from '../../../src/pages/Event/useRetainedResultData';
import { renderHook } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  publication: {
    data: undefined as unknown,
    previousData: undefined as unknown,
    loading: true,
    error: undefined as unknown,
  },
  subscription: {
    data: undefined as unknown,
    loading: false,
    error: undefined,
  },
}));
vi.mock('@apollo/client/react', () => ({
  useQuery: (query: { loc?: { source: { body: string } } }) =>
    query.loc?.source.body.includes('SplitPublicationStatus')
      ? { ...mocks.publication, refetch: vi.fn() }
      : { data: undefined },
  useSubscription: () => mocks.subscription,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
vi.mock('@/components/organisms', () => ({
  Alert: ({ children }: { children: React.ReactNode }) => (
    <div role="alert">{children}</div>
  ),
  CountdownTimer: () => null,
}));
vi.mock('../../../src/pages/Event/MobileClubName', () => ({
  MobileClubName: () => null,
}));
vi.mock('../../../src/pages/Event/SplitChart', () => ({
  SplitChart: () => <div>chart</div>,
}));
vi.mock('../../../src/pages/Event/EventCategorySwitcher', () => ({
  EventCategorySwitcher: () => <div>categories</div>,
}));

const runner = (id: string, time: number, codes = ['31', '32', '31']) => ({
  id,
  firstname: `Runner${id}`,
  lastname: `Name${id}`,
  organisation: 'Club',
  status: 'OK',
  time,
  splits: codes.map((controlCode, index) => ({
    controlCode,
    time: 50 * (index + 1),
  })),
});
const published = {
  classId: 1,
  isAccessible: true,
  isPublished: true,
  reason: 'PUBLISHED',
};

function tableRows(container: HTMLElement) {
  return [...container.querySelectorAll('tbody tr')].map(
    row => row.textContent
  );
}

describe('split background refresh', () => {
  it('retains DOM, scroll, columns and selected sorting while refreshing and on error', () => {
    const first = runner('1', 300);
    const second = runner('2', 400);
    const view = render(<SplitTable competitors={[first, second]} />);
    const table = screen.getByRole('table');
    const scroller = table.parentElement!;
    scroller.scrollLeft = 420;
    scroller.scrollTop = 40;
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    expect(tableRows(view.container)[0]).toContain('Name2');
    const headers = table.querySelectorAll('th').length;
    view.rerender(
      <SplitTable
        competitors={[
          { ...first, time: 250 },
          second,
          runner('3', 200, ['31']),
        ]}
        isLoading
      />
    );
    expect(screen.getByRole('table')).toBe(table);
    expect(tableRows(view.container)[0]).toContain('Name2');
    expect(table.querySelectorAll('th')).toHaveLength(headers);
    expect(scroller.scrollLeft).toBe(420);
    expect(scroller.scrollTop).toBe(40);
    view.rerender(
      <SplitTable competitors={[first, second]} error={new Error('offline')} />
    );
    expect(screen.getByRole('table')).toBe(table);
    expect(screen.getByRole('status')).toHaveTextContent('offline');
    expect(
      screen.queryByText('Pages.Event.Splits.LoadingTimes')
    ).not.toBeInTheDocument();
  });

  it('continues ranking and inserts new runners in their sorted position', () => {
    const first = runner('1', 300);
    const second = runner('2', 400);
    const view = render(<SplitTable competitors={[first, second]} />);
    view.rerender(
      <SplitTable
        competitors={[first, { ...second, time: 200 }, runner('3', 250)]}
      />
    );
    expect(
      tableRows(view.container).map(text => text?.match(/Name\d/)?.[0])
    ).toEqual(['Name2', 'Name3', 'Name1']);
  });

  it('ranks each repeated control occurrence independently', () => {
    const first = {
      ...runner('1', 260),
      splits: [
        { controlCode: '31', time: 100 },
        { controlCode: '32', time: 200 },
        { controlCode: '31', time: 260 },
      ],
    };
    const second = {
      ...runner('2', 310),
      splits: [
        { controlCode: '31', time: 90 },
        { controlCode: '32', time: 230 },
        { controlCode: '31', time: 310 },
      ],
    };

    const view = render(<SplitTable competitors={[first, second]} />);
    const firstRunner =
      view.container.querySelector<HTMLTableRowElement>('tbody tr')!;

    expect(firstRunner.cells[4]).toHaveTextContent('1:40(2)1:40(2)');
    expect(firstRunner.cells[6]).toHaveTextContent('1:00(1)4:20(1)');
  });

  it('shows loading initially, keeps published data during polls/errors and hides revoked splits', () => {
    mocks.publication = {
      data: undefined,
      previousData: undefined,
      loading: true,
      error: undefined,
    };
    mocks.subscription = { data: undefined, loading: false, error: undefined };
    const props = {
      t: ((key: string) => key) as Parameters<
        typeof ClassIndividualSplit
      >[0]['t'],
      event: { id: 'event', name: 'Event', classes: [{ id: 1, name: 'H21' }] },
      selectedClass: 1,
      onClassChange: vi.fn(),
    };
    const view = render(<ClassIndividualSplit {...props} />);
    expect(
      screen.getByText('Pages.Event.Splits.LoadingTimes')
    ).toBeInTheDocument();
    mocks.publication = {
      data: { splitPublicationStatus: published },
      previousData: undefined,
      loading: false,
      error: undefined,
    };
    mocks.subscription = {
      data: { splitCompetitorsByClassUpdated: [runner('1', 300)] },
      loading: false,
      error: undefined,
    };
    view.rerender(<ClassIndividualSplit {...props} />);
    const table = screen.getByRole('table');
    mocks.publication.loading = true;
    view.rerender(<ClassIndividualSplit {...props} />);
    expect(screen.getByRole('table')).toBe(table);
    mocks.publication = {
      data: undefined,
      previousData: { splitPublicationStatus: published },
      loading: false,
      error: new Error('offline'),
    };
    view.rerender(<ClassIndividualSplit {...props} />);
    expect(screen.getByRole('table')).toBe(table);
    mocks.publication = {
      data: {
        splitPublicationStatus: {
          ...published,
          isAccessible: false,
          reason: 'DISABLED',
        },
      },
      previousData: undefined,
      loading: false,
      error: undefined,
    };
    view.rerender(<ClassIndividualSplit {...props} />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(
      screen.getByText('Pages.Event.Splits.Publication.DisabledDescription')
    ).toBeInTheDocument();
  });

  it('retains snapshots only within scope and accepts empty successful data', () => {
    const { result, rerender } = renderHook(
      ({ scope, data }: { scope: number; data: number[] | undefined }) =>
        useRetainedResultData(scope, data),
      {
        initialProps: { scope: 1, data: [1] as number[] | undefined },
      }
    );
    rerender({ scope: 1, data: undefined });
    expect(result.current).toEqual([1]);
    rerender({ scope: 1, data: [] });
    expect(result.current).toEqual([]);
    rerender({ scope: 2, data: undefined });
    expect(result.current).toBeUndefined();
  });
});
