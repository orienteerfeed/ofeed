import { Link, useParams } from '@tanstack/react-router';
import {
  anomalyTypes,
  type AnomalyFinding,
  type EventAnomalyInsight,
} from '@repo/shared';
import { Download, Printer, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type en from '@/i18n/locales/en/translation.json';
import { Button } from '@/components/atoms';
import { BackLink } from '@/components/molecules';
import { AppPagination } from '@/components/organisms/AppPagination';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useEvent } from '@/hooks/useEvent';
import PATHNAMES from '@/lib/paths/pathnames';
import { MainPageLayout } from '@/templates/MainPageLayout';
import { toast } from '@/utils';
import { useAnomalyInsight } from './useAnomalyInsight';
import {
  filterAnomalyInsight,
  summarizeAnomalies,
  type AnomalyFilters,
} from './anomaly-insight.utils';
import { cardInsightPrintHtml } from './card-insight.utils';
import { insightCsv } from './payment-insight.utils';

const EMPTY: EventAnomalyInsight = { competitors: [], coverage: [] };
const PAGE_SIZE = 25;
export function EventAnomalyInsightPage() {
  const { eventId } = useParams({
    from: '/events/$eventId/insights/anomalies',
  });
  const { t, i18n } = useTranslation();
  const c = (key: keyof typeof en.Pages.Insights.Anomalies) =>
    t(`Pages.Insights.Anomalies.${key}`);
  const card = (key: keyof typeof en.Pages.Insights.Cards) =>
    t(`Pages.Insights.Cards.${key}`);
  const {
    event,
    loading: eventLoading,
    error: eventError,
    refetch: refetchEvent,
  } = useEvent(eventId);
  const query = useAnomalyInsight(eventId);
  const [filters, setFilters] = useState<AnomalyFilters>({
    search: '',
    classId: '',
    type: '',
  });
  const [page, setPage] = useState(1);
  const report =
    query.data?.eventAnomalyInsight ?? query.previousData?.eventAnomalyInsight;
  const rows = filterAnomalyInsight(report ?? EMPTY, filters);
  const summary = summarizeAnomalies(rows);
  const classes = [
    ...new Map(
      (report?.coverage ?? []).map(item => [item.classId, item.className])
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]) || a[0] - b[0]);
  const coverage = (report?.coverage ?? []).filter(
    item =>
      (!filters.classId || String(item.classId) === filters.classId) &&
      (!filters.type || item.type === filters.type)
  );
  const timezone = event?.timezone ?? 'UTC';
  const failed = !!query.error || !!eventError || (!eventLoading && !event);
  const canDisplay = !!report && !!event;
  const busy = query.loading || eventLoading;
  const canExport = canDisplay && !failed && !busy;
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  );
  const setFilter = (key: keyof AnomalyFilters, value: string) => {
    setFilters(previous => ({ ...previous, [key]: value }));
    setPage(1);
  };
  const formatDate = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(i18n.language, {
          timeZone: timezone,
          dateStyle: 'short',
          timeStyle: 'medium',
        }).format(new Date(value))
      : '—';
  const number = (value: number | null) =>
    value === null
      ? '—'
      : new Intl.NumberFormat(i18n.language, {
          maximumFractionDigits: 3,
        }).format(value);
  const evidence = (item: AnomalyFinding): string => {
    if (item.type === 'FAST_FIRST_SPLIT')
      return [
        `${c('Control')}: ${item.controlCode}`,
        `${c('Split')}: ${number(item.splitSeconds)} s`,
        `${c('Median')}: ${number(item.medianSeconds)} s`,
        `${c('Difference')}: ${number(item.differenceSeconds)} s`,
        `${c('References')}: ${item.referenceCount}`,
      ].join(' · ');
    if (item.type === 'OFF_START_GRID')
      return [
        `${c('Interval')}: ${number(item.intervalSeconds)} s`,
        `${c('Phase')}: ${number(item.phaseSeconds)} s`,
        `${c('NearestStart')}: ${formatDate(item.nearestStartTime)}`,
        `${c('Difference')}: ${number(item.differenceSeconds)} s`,
      ].join(' · ');
    return `${c('ObservedStart')}: ${item.punchTimes.map(formatDate).join(', ')}`;
  };
  const refresh = () => {
    void query.refetch().catch(() => {});
    if (eventError || !event) void refetchEvent().catch(() => {});
  };
  const columns = [
    card('Name'),
    card('Registration'),
    card('Class'),
    card('Organisation'),
    card('BibNumber'),
    card('Card'),
    c('StartMode'),
    c('StartTime'),
    c('Findings'),
  ];
  const exportSections = (): (string | number)[][][] => [
    [
      [c('Title'), event?.name ?? ''],
      [t('Pages.Insights.Generated'), formatDate(new Date().toISOString())],
      [t('Pages.Insights.Timezone'), timezone],
      [
        card('Class'),
        classes.find(([id]) => String(id) === filters.classId)?.[1] ??
          t('Pages.Insights.All'),
      ],
      [
        c('Type'),
        filters.type
          ? c(filters.type as AnomalyFinding['type'])
          : t('Pages.Insights.All'),
      ],
      [t('Pages.Insights.Search'), filters.search || t('Pages.Insights.All')],
      [c('Affected'), rows.length],
      ...summary.map(item => [c(item.type), item.count]),
      [c('Explanation')],
      [c('Rules')],
      [c('CoverageExplanation')],
    ],
    [
      [c('Findings')],
      columns,
      ...rows.map(row => [
        `${row.lastname} ${row.firstname}`,
        row.registration,
        row.className,
        row.organisation ?? '',
        row.bibNumber ?? '',
        row.card ?? '',
        t(`Pages.Event.Settings.Classes.StartMode.${row.startMode}`),
        formatDate(row.startTime),
        row.findings
          .map(item => `${c(item.type)}: ${evidence(item)}`)
          .join('\n'),
      ]),
    ],
    [
      [c('Coverage')],
      [card('Class'), c('Type'), c('Status'), c('Evaluated'), c('Total')],
      ...coverage.map(item => [
        item.className,
        c(item.type),
        c(item.status),
        item.evaluated,
        item.total,
      ]),
    ],
  ];
  const download = () => {
    if (!canExport) return;
    const blob = new Blob(
      [insightCsv(exportSections().flatMap(section => [...section, []]))],
      { type: 'text/csv;charset=utf-8;' }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `anomalies-${eventId}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const print = () => {
    if (!canExport) return;
    const popup = window.open('', '_blank');
    if (!popup) {
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        variant: 'error',
      });
      return;
    }
    popup.opener = null;
    popup.document.write(
      cardInsightPrintHtml(c('Title'), i18n.language, exportSections())
    );
    popup.document.close();
    popup.focus();
    popup.print();
  };
  const selectStyle =
    'h-9 w-full rounded-md border border-input bg-background px-3 text-sm';
  return (
    <MainPageLayout t={t}>
      <section
        className="container mx-auto space-y-6 px-4 py-6"
        aria-busy={busy}
      >
        <BackLink to={PATHNAMES.eventInsights(eventId).url}>
          {t('Pages.Insights.Title')}
        </BackLink>
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{c('Title')}</h1>
            <p className="text-muted-foreground">{event?.name}</p>
            <p className="text-sm text-muted-foreground">
              {t('Pages.Insights.Timezone')}: {timezone}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={refresh}>
              <RefreshCw className="h-4 w-4" />
              {t('Pages.Insights.Refresh')}
            </Button>
            <Button variant="outline" disabled={!canExport} onClick={download}>
              <Download className="h-4 w-4" />
              {t('Pages.Insights.Export')}
            </Button>
            <Button variant="outline" disabled={!canExport} onClick={print}>
              <Printer className="h-4 w-4" />
              {t('Pages.Insights.Print')}
            </Button>
          </div>
        </header>
        <p>{c('Explanation')}</p>
        <details className="rounded-lg border p-4">
          <summary className="cursor-pointer">{c('Method')}</summary>
          <p className="mt-2 text-sm text-muted-foreground">{c('Rules')}</p>
        </details>
        <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="anomaly-search">{t('Pages.Insights.Search')}</Label>
            <Input
              id="anomaly-search"
              value={filters.search}
              onChange={e => setFilter('search', e.target.value)}
              placeholder={card('SearchPlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="anomaly-class">{card('Class')}</Label>
            <select
              id="anomaly-class"
              className={selectStyle}
              value={filters.classId}
              onChange={e => setFilter('classId', e.target.value)}
            >
              <option value="">{t('Pages.Insights.All')}</option>
              {classes.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="anomaly-type">{c('Type')}</Label>
            <select
              id="anomaly-type"
              className={selectStyle}
              value={filters.type}
              onChange={e => setFilter('type', e.target.value)}
            >
              <option value="">{t('Pages.Insights.All')}</option>
              {anomalyTypes.map(type => (
                <option key={type} value={type}>
                  {c(type)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {busy && <p role="status">{c('Loading')}</p>}
        {failed && (
          <div
            role="alert"
            className="space-y-2 rounded-lg border border-destructive p-4"
          >
            <p>{canDisplay ? card('Stale') : c('Error')}</p>
            <Button variant="outline" disabled={busy} onClick={refresh}>
              {t('Pages.Insights.Retry')}
            </Button>
          </div>
        )}
        {canDisplay && (
          <>
            <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                [c('Affected'), rows.length],
                ...summary.map(item => [c(item.type), item.count]),
              ].map(([label, count]) => (
                <div key={label} className="rounded-lg border p-4">
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd className="text-2xl font-bold">{count}</dd>
                </div>
              ))}
            </dl>
            {!report.competitors.length && (
              <p role="status">
                {report.coverage.some(item => item.evaluated > 0)
                  ? c('NoIssues')
                  : c('NoData')}
              </p>
            )}
            {!!report.competitors.length && !rows.length && (
              <p role="status">{card('NoMatches')}</p>
            )}
            {!!rows.length && (
              <>
                <Table aria-label={c('Findings')}>
                  <TableHeader>
                    <TableRow>
                      {columns.map(column => (
                        <TableHead key={column}>{column}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows
                      .slice(
                        (currentPage - 1) * PAGE_SIZE,
                        currentPage * PAGE_SIZE
                      )
                      .map(row => (
                        <TableRow key={row.id}>
                          <TableCell>
                            {row.lastname} {row.firstname}
                          </TableCell>
                          <TableCell>{row.registration || '—'}</TableCell>
                          <TableCell>
                            <Link
                              to="/events/$eventId"
                              params={{ eventId }}
                              search={{ tab: 'results', class: row.className }}
                              className="underline"
                            >
                              {row.className}
                            </Link>
                          </TableCell>
                          <TableCell>{row.organisation || '—'}</TableCell>
                          <TableCell>{row.bibNumber ?? '—'}</TableCell>
                          <TableCell>{row.card ?? '—'}</TableCell>
                          <TableCell>
                            {t(
                              `Pages.Event.Settings.Classes.StartMode.${row.startMode}`
                            )}
                          </TableCell>
                          <TableCell>{formatDate(row.startTime)}</TableCell>
                          <TableCell>
                            <ul className="space-y-2">
                              {row.findings.map(item => (
                                <li key={item.type}>
                                  <details>
                                    <summary className="cursor-pointer font-medium">
                                      {c(item.type)}
                                    </summary>
                                    <p className="mt-1 min-w-48 text-sm">
                                      {evidence(item)}
                                    </p>
                                  </details>
                                </li>
                              ))}
                            </ul>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
                <AppPagination
                  page={currentPage}
                  pageSize={PAGE_SIZE}
                  totalItems={rows.length}
                  onPageChange={setPage}
                />
              </>
            )}
            <section
              aria-labelledby="anomaly-coverage-title"
              className="space-y-3"
            >
              <h2 id="anomaly-coverage-title" className="text-xl font-semibold">
                {c('Coverage')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {c('CoverageExplanation')}
              </p>
              <Table aria-label={c('Coverage')}>
                <TableHeader>
                  <TableRow>
                    {[
                      card('Class'),
                      c('Type'),
                      c('Status'),
                      c('Evaluated'),
                      c('Total'),
                    ].map(label => (
                      <TableHead key={label}>{label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coverage.map(item => (
                    <TableRow key={`${item.classId}-${item.type}`}>
                      <TableCell>{item.className}</TableCell>
                      <TableCell>{c(item.type)}</TableCell>
                      <TableCell>{c(item.status)}</TableCell>
                      <TableCell>{item.evaluated}</TableCell>
                      <TableCell>{item.total}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          </>
        )}
      </section>
    </MainPageLayout>
  );
}
