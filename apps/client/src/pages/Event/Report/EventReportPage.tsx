import { BackLink } from '@/components/molecules';
import {
  EventReportTable,
  ReportFilters,
  type ReportFilterConfig,
  type PresetFilter,
  type ChangelogEntry,
  type ColumnFilter,
  type SortColumn,
} from '@/components/organisms';
import type { DateRangeValue } from '@/components/organisms/ReportTableHeader';
import { useApi } from '@/hooks';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { MainPageLayout } from '@/templates/MainPageLayout';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import {
  Clock,
  CreditCard,
  List,
  StickyNote,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type ChangelogResponse = {
  data: ChangelogEntry[];
};

const REFRESH_INTERVAL_SECONDS = 30;


const DEFAULT_COLUMN_FILTERS: Record<ColumnFilter, string> = {
  id: '',
  competitorId: '',
  lastname: '',
  firstname: '',
  previousValue: '',
  newValue: '',
};

const TYPE_OPTIONS = [
  'class_change',
  'firstname_change',
  'lastname_change',
  'bibNumber_change',
  'nationality_change',
  'registration_change',
  'license_change',
  'ranking_change',
  'rank_points_avg_change',
  'organisation_change',
  'short_name_change',
  'si_card_change',
  'start_time_change',
  'finish_time_change',
  'time_change',
  'team_change',
  'leg_change',
  'status_change',
  'late_start_change',
  'note_change',
  'external_id_change',
] as const;

const ORIGIN_OPTIONS = ['START', 'OFFICE', 'FINISH', 'IT'] as const;

const presetFilterConfig: ReportFilterConfig[] = [
  {
    key: 'si_card_change',
    label: '',
    icon: <CreditCard className="h-4 w-4" />,
  },
  {
    key: 'note_change',
    label: '',
    icon: <StickyNote className="h-4 w-4" />,
  },
  {
    key: 'late_start_change',
    label: '',
    icon: <Clock className="h-4 w-4" />,
  },
  {
    key: 'did_not_start',
    label: '',
    icon: <XCircle className="h-4 w-4" />,
  },
  {
    key: 'all',
    label: '',
    icon: <List className="h-4 w-4" />,
  },
];

export const EventReportPage = () => {
  const { t } = useTranslation();
  const { eventId } = useParams({ from: '/events/$eventId/report' });
  const api = useApi();
  const sinceRef = useRef<string | null>(null);
  const lastRequestAtRef = useRef<number>(0);
  const inFlightRef = useRef<Promise<ChangelogResponse> | null>(null);
  const lastResponseRef = useRef<ChangelogResponse | null>(null);

  const [processedItems, setProcessedItems] = useState<Set<string>>(new Set());
  const [processedLoaded, setProcessedLoaded] = useState(false);
  const [hideProcessed, setHideProcessed] = useState(false);
  const [activePresetFilters, setActivePresetFilters] = useState<
    Set<PresetFilter>
  >(new Set(['all']));
  const [columnFilters, setColumnFilters] = useState<
    Record<ColumnFilter, string>
  >(DEFAULT_COLUMN_FILTERS);
  const [typeFilters, setTypeFilters] = useState<string[]>([]);
  const [originFilters, setOriginFilters] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRangeValue>({
    range: undefined,
    fromTime: '',
    toTime: '',
  });
  const [sortConfig, setSortConfig] = useState<{
    column: SortColumn;
    direction: 'asc' | 'desc';
  }>({
    column: 'createdAt',
    direction: 'desc',
  });
  const [refreshCounter, setRefreshCounter] = useState(
    REFRESH_INTERVAL_SECONDS
  );
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const storageKey = `processedChangelogItems:${eventId}`;

  const [changelogData, setChangelogData] = useState<ChangelogEntry[]>([]);

  const fetchChangelog = async (): Promise<ChangelogResponse> => {
    if (inFlightRef.current) {
      return inFlightRef.current;
    }

    const now = Date.now();
    if (lastResponseRef.current && now - lastRequestAtRef.current < 300) {
      return Promise.resolve(lastResponseRef.current);
    }

    const params = sinceRef.current ? { since: sinceRef.current } : undefined;
    const request = api.get<ChangelogResponse>(
      ENDPOINTS.eventChangelog(eventId, params)
    );
    inFlightRef.current = request;

    try {
      const response = await request;
      lastResponseRef.current = response;
      return response;
    } finally {
      inFlightRef.current = null;
      lastRequestAtRef.current = Date.now();
    }
  };

  const { data, isLoading, error, refetch, isFetching } = useQuery<
    ChangelogResponse,
    Error
  >({
    queryKey: ['eventChangelog', eventId],
    queryFn: fetchChangelog,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!data) return;
    const incoming: ChangelogEntry[] = data.data ?? [];
    setChangelogData(prev => {
      const map = new Map<number, ChangelogEntry>(
        prev.map(item => [item.id, item])
      );
      incoming.forEach(item => map.set(item.id, item));
      const merged = Array.from(map.values());
      // Keep merged data but do not advance `since` by max createdAt.
      return merged;
    });
    const nowIso = new Date().toISOString();
    sinceRef.current = nowIso;
    setLastUpdated(new Date());
    setRefreshCounter(REFRESH_INTERVAL_SECONDS);
  }, [data]);

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        const parsed: string[] = JSON.parse(stored);
        setProcessedItems(new Set(parsed));
      } catch {
        setProcessedItems(new Set());
      }
    }

    setProcessedLoaded(true);
  }, [storageKey]);

  useEffect(() => {
    if (!processedLoaded) return;
    localStorage.setItem(storageKey, JSON.stringify([...processedItems]));
  }, [processedItems, processedLoaded, storageKey]);

  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshCounter(prev => {
        if (prev <= 1) {
          refetch();
          return REFRESH_INTERVAL_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [refetch]);

  useEffect(() => {
    sinceRef.current = null;
    lastRequestAtRef.current = 0;
    inFlightRef.current = null;
    lastResponseRef.current = null;
    setChangelogData([]);
    setPage(1);
  }, [eventId]);

  const latestStatusChangeByCompetitor = useMemo(() => {
    const map = new Map<number, number>();

    changelogData.forEach(item => {
      if (item.type !== 'status_change') return;
      const time = new Date(item.createdAt).getTime();
      const current = map.get(item.competitorId);
      if (current === undefined || time > current) {
        map.set(item.competitorId, time);
      }
    });

    return map;
  }, [changelogData]);

  const updateColumnFilter = (column: ColumnFilter, value: string) => {
    setColumnFilters(prev => ({
      ...prev,
      [column]: value.toLowerCase(),
    }));
  };

  const updateNumericFilter = (column: ColumnFilter, value: string) => {
    const normalized = value.replace(/[^\d]/g, '');
    setColumnFilters(prev => ({
      ...prev,
      [column]: normalized,
    }));
  };

  const handleSort = (column: SortColumn) => {
    setSortConfig(prev => {
      if (prev.column === column) {
        return {
          ...prev,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        };
      }

      return {
        column,
        direction: 'asc',
      };
    });
  };

  const togglePresetFilter = (filter: PresetFilter) => {
    setActivePresetFilters(prev => {
      const next = new Set(prev);

      if (filter === 'all') {
        next.clear();
        next.add('all');
        return next;
      }

      if (next.has(filter)) {
        next.delete(filter);
      } else {
        next.add(filter);
        next.delete('all');
      }

      if (next.size === 0) {
        next.add('all');
      }

      return next;
    });

    const presetTypeMap: Partial<Record<PresetFilter, string>> = {
      si_card_change: 'si_card_change',
      note_change: 'note_change',
      late_start_change: 'late_start_change',
      did_not_start: 'status_change',
    };

    const mappedType = presetTypeMap[filter];
    if (filter === 'all') {
      setTypeFilters([]);
    } else if (mappedType) {
      setTypeFilters(prev => {
        const next = new Set(prev);
        if (next.has(mappedType)) {
          next.delete(mappedType);
        } else {
          next.add(mappedType);
        }
        return Array.from(next);
      });
    }
  };

  const clearFilters = () => {
    setColumnFilters(DEFAULT_COLUMN_FILTERS);
    setActivePresetFilters(new Set(['all']));
    setTypeFilters([]);
    setOriginFilters([]);
    setDateRange({ range: undefined, fromTime: '', toTime: '' });
    setPage(1);
  };

  const toggleProcessedVisibility = () => {
    setHideProcessed(prev => !prev);
  };

  const handleRefresh = () => {
    refetch();
    setRefreshCounter(REFRESH_INTERVAL_SECONDS);
  };

  const toggleProcessedItem = (id: number, checked: boolean) => {
    setProcessedItems(prev => {
      const next = new Set(prev);
      const key = id.toString();

      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }

      return next;
    });
  };

  const visibleData = useMemo(() => {
    const filtered = changelogData.filter(item => {
      if (hideProcessed && processedItems.has(item.id.toString())) {
        return false;
      }

      if (!activePresetFilters.has('all')) {
        let matchesAnyFilter = false;

        if (
          activePresetFilters.has('si_card_change') &&
          item.type === 'si_card_change'
        ) {
          matchesAnyFilter = true;
        }

        if (
          activePresetFilters.has('note_change') &&
          item.type === 'note_change'
        ) {
          matchesAnyFilter = true;
        }

        if (
          activePresetFilters.has('late_start_change') &&
          item.type === 'late_start_change'
        ) {
          matchesAnyFilter = true;
        }

        if (
          activePresetFilters.has('did_not_start') &&
          item.type === 'status_change' &&
          item.newValue === 'DidNotStart'
        ) {
          const latest = latestStatusChangeByCompetitor.get(item.competitorId);
          const itemTime = new Date(item.createdAt).getTime();
          if (latest === itemTime) {
            matchesAnyFilter = true;
          }
        }

        if (!matchesAnyFilter) {
          return false;
        }
      }

      if (typeFilters.length > 0 && !typeFilters.includes(item.type)) {
        return false;
      }

      if (
        originFilters.length > 0 &&
        !originFilters.includes(item.origin ?? '')
      ) {
        return false;
      }

      if (dateRange.range?.from || dateRange.range?.to) {
        const itemTime = new Date(item.createdAt).getTime();
        const fromTime = dateRange.range?.from
          ? applyTimeToDate(
              dateRange.range.from,
              dateRange.fromTime || '00:00:00'
            ).getTime()
          : null;
        const toTime = dateRange.range?.to
          ? applyTimeToDate(
              dateRange.range.to,
              dateRange.toTime || '23:59:59'
            ).getTime()
          : null;
        if (fromTime && itemTime < fromTime) return false;
        if (toTime && itemTime > toTime) return false;
      }

      for (const [column, filterValue] of Object.entries(columnFilters)) {
        if (!filterValue) continue;

        if (column === 'id') {
          const filterId = Number(filterValue);
          if (!Number.isNaN(filterId) && item.id !== filterId) {
            return false;
          }
          continue;
        }

        const value = getColumnValue(item, column as ColumnFilter);
        if (!value.toLowerCase().includes(filterValue)) {
          return false;
        }
      }

      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      const aValue = getSortValue(a, sortConfig.column);
      const bValue = getSortValue(b, sortConfig.column);

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortConfig.direction === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }

      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }

      return 0;
    });

    return sorted;
  }, [
    activePresetFilters,
    changelogData,
    columnFilters,
    hideProcessed,
    latestStatusChangeByCompetitor,
    processedItems,
    sortConfig,
    typeFilters,
    originFilters,
    dateRange,
  ]);

  const totalItems = visibleData.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const pagedData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return visibleData.slice(start, start + pageSize);
  }, [page, pageSize, visibleData]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [
    columnFilters,
    typeFilters,
    originFilters,
    activePresetFilters,
    hideProcessed,
    dateRange,
  ]);

  const refreshLabel = t('Pages.Event.Report.AutoRefresh', {
    seconds: refreshCounter,
  });
  const lastUpdatedLabel = t('Pages.Event.Report.LastUpdated', {
    time: lastUpdated
      ? lastUpdated.toLocaleTimeString('cs-CZ')
      : t('Pages.Event.Report.NoTimestamp'),
  });

  const typeOptions = useMemo(
    () =>
      TYPE_OPTIONS.map(value => ({
        value,
        label: t(`Pages.Event.Report.TypeLabels.${value}`),
      })).sort((a, b) => a.label.localeCompare(b.label)),
    [t]
  );

  const originOptions = useMemo(
    () =>
      ORIGIN_OPTIONS.map(value => ({
        value,
        label: t(`Pages.Event.Report.OriginLabels.${value}`),
      })).sort((a, b) => a.label.localeCompare(b.label)),
    [t]
  );

  const filterLabels = useMemo(
    () => ({
      si_card_change: t('Pages.Event.Report.Presets.CardChanges'),
      note_change: t('Pages.Event.Report.Presets.NoteChanges'),
      late_start_change: t('Pages.Event.Report.Presets.LateStarts'),
      did_not_start: t('Pages.Event.Report.Presets.DidNotStart'),
      all: t('Pages.Event.Report.Presets.All'),
    }),
    [t]
  );

  const formatTypeLabel = (type: string) =>
    t(`Pages.Event.Report.TypeLabels.${type}`, { defaultValue: type });
  const formatOriginLabel = (origin: string | null) =>
    origin
      ? t(`Pages.Event.Report.OriginLabels.${origin}`, {
          defaultValue: origin,
        })
      : '';

  const exportCsv = () => {
    const headers = [
      t('Pages.Event.Report.Table.Id'),
      t('Pages.Event.Report.Table.DateTime'),
      t('Pages.Event.Report.Table.Type'),
      t('Pages.Event.Report.Table.CompetitorId'),
      t('Pages.Event.Report.Table.Lastname'),
      t('Pages.Event.Report.Table.Firstname'),
      t('Pages.Event.Report.Table.PreviousValue'),
      t('Pages.Event.Report.Table.NewValue'),
      t('Pages.Event.Report.Table.Origin'),
    ];

    const rows = visibleData.map(item => [
      item.id.toString(),
      new Date(item.createdAt).toLocaleString('cs-CZ'),
      formatTypeLabel(item.type),
      item.competitorId.toString(),
      item.competitor?.lastname ?? '',
      item.competitor?.firstname ?? '',
      item.previousValue ?? '',
      item.newValue ?? '',
      formatOriginLabel(item.origin ?? null),
    ]);

    const escapeValue = (value: string) => {
      const needsQuotes = /[",\n]/.test(value);
      const escaped = value.replace(/\"/g, '\"\"');
      return needsQuotes ? `"${escaped}"` : escaped;
    };

    const csvContent = [headers, ...rows]
      .map(row => row.map(escapeValue).join(','))
      .join('\\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `event-${eventId}-changelog.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const headers = [
      t('Pages.Event.Report.Table.Id'),
      t('Pages.Event.Report.Table.DateTime'),
      t('Pages.Event.Report.Table.Type'),
      t('Pages.Event.Report.Table.CompetitorId'),
      t('Pages.Event.Report.Table.Lastname'),
      t('Pages.Event.Report.Table.Firstname'),
      t('Pages.Event.Report.Table.PreviousValue'),
      t('Pages.Event.Report.Table.NewValue'),
      t('Pages.Event.Report.Table.Origin'),
    ];

    const rows = visibleData.map(item => [
      item.id.toString(),
      new Date(item.createdAt).toLocaleString('cs-CZ'),
      formatTypeLabel(item.type),
      item.competitorId.toString(),
      item.competitor?.lastname ?? '',
      item.competitor?.firstname ?? '',
      item.previousValue ?? '',
      item.newValue ?? '',
      formatOriginLabel(item.origin ?? null),
    ]);

    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const html = `<!doctype html>
<html lang="cs">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(t('Pages.Event.Report.Title'))}</title>
    <style>
      body { font-family: Arial, sans-serif; color: #111827; padding: 24px; }
      h1 { font-size: 20px; margin-bottom: 8px; }
      p { font-size: 12px; color: #4b5563; margin: 0 0 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; }
      th { background: #f3f4f6; font-weight: 600; }
      tr:nth-child(even) td { background: #fafafa; }
      @media print { body { padding: 0; } }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(t('Pages.Event.Report.Title'))}</h1>
    <p>${escapeHtml(t('Pages.Event.Report.Description'))}</p>
    <table>
      <thead>
        <tr>
          ${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            row =>
              `<tr>${row
                .map(cell => `<td>${escapeHtml(cell)}</td>`)
                .join('')}</tr>`
          )
          .join('')}
      </tbody>
    </table>
  </body>
</html>`;

    const printWindow = window.open('', '_blank', 'width=1024,height=768');
    if (!printWindow) return;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const presetFilters = useMemo(
    () =>
      presetFilterConfig.map(filter => ({
        ...filter,
        label: filterLabels[filter.key],
      })),
    [filterLabels]
  );

  return (
    <MainPageLayout t={t}>
      <div className="container mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-col gap-4">
          <BackLink to={`/events/${eventId}`} />
          <div>
            <h1 className="text-2xl font-semibold">
              {t('Pages.Event.Report.Title')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('Pages.Event.Report.Description')}
            </p>
          </div>
        </div>

        <ReportFilters
          presetFilters={presetFilters}
          activePresetFilters={activePresetFilters}
          filterLabels={filterLabels}
          onTogglePresetFilter={togglePresetFilter}
          onRefresh={handleRefresh}
          onClearFilters={clearFilters}
          onToggleProcessedVisibility={toggleProcessedVisibility}
          hideProcessed={hideProcessed}
          refreshLabel={refreshLabel}
          isFetching={isFetching}
        />

        <EventReportTable
          data={pagedData}
          isLoading={isLoading}
          error={error}
          page={page}
          pageSize={pageSize}
          totalItems={totalItems}
          onExportCsv={exportCsv}
          onExportPdf={exportPdf}
          onPageChange={setPage}
          onPageSizeChange={size => {
            setPageSize(size);
            setPage(1);
          }}
          sortConfig={sortConfig}
          onSort={handleSort}
          columnFilters={columnFilters}
          onColumnFilterChange={updateColumnFilter}
          onNumericFilterChange={updateNumericFilter}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          typeFilters={typeFilters}
          onTypeFiltersChange={setTypeFilters}
          originFilters={originFilters}
          onOriginFiltersChange={setOriginFilters}
          typeOptions={typeOptions}
          originOptions={originOptions}
          processedItems={processedItems}
          onToggleProcessed={toggleProcessedItem}
        />

        <div className="text-sm text-muted-foreground">{lastUpdatedLabel}</div>
      </div>
    </MainPageLayout>
  );
};

const getColumnValue = (item: ChangelogEntry, column: ColumnFilter): string => {
  switch (column) {
    case 'id':
      return String(item.id);
    case 'competitorId':
      return String(item.competitorId);
    case 'lastname':
      return item.competitor?.lastname ?? '';
    case 'firstname':
      return item.competitor?.firstname ?? '';
    case 'previousValue':
      return item.previousValue ?? '';
    case 'newValue':
      return item.newValue ?? '';
    default:
      return '';
  }
};

const getSortValue = (item: ChangelogEntry, column: SortColumn) => {
  switch (column) {
    case 'id':
      return item.id;
    case 'createdAt':
      return new Date(item.createdAt).getTime();
    case 'type':
      return item.type.toLowerCase();
    case 'competitorId':
      return item.competitorId;
    case 'lastname':
      return item.competitor?.lastname?.toLowerCase() ?? '';
    case 'firstname':
      return item.competitor?.firstname?.toLowerCase() ?? '';
    case 'previousValue':
      return item.previousValue?.toLowerCase() ?? '';
    case 'newValue':
      return item.newValue?.toLowerCase() ?? '';
    case 'origin':
      return item.origin?.toLowerCase() ?? '';
    default:
      return item.id;
  }
};

const applyTimeToDate = (date: Date, time: string) => {
  const [hoursRaw, minutesRaw, secondsRaw] = time.split(':');
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  const seconds = Number(secondsRaw);
  const result = new Date(date);
  result.setHours(
    Number.isFinite(hours) ? hours : 0,
    Number.isFinite(minutes) ? minutes : 0,
    Number.isFinite(seconds) ? seconds : 0,
    0
  );
  return result;
};
