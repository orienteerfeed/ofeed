import { Link, useParams } from '@tanstack/react-router';
import type { CardInsightCompetitor } from '@repo/shared';
import { Download, Printer, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
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
import {
  cardInsightClasses,
  cardInsightPrintHtml,
  filterCardInsight,
  summarizeCardInsight,
  type CardInsightFilters,
} from './card-insight.utils';
import { insightCsv } from './payment-insight.utils';
import { useCardInsight } from './useCardInsight';

const PAGE_SIZE = 25;
const EMPTY_REPORT = { missingCards: [], duplicateCards: [] };

export function EventCardInsightPage() {
  const { eventId } = useParams({ from: '/events/$eventId/insights/cards' });
  const { t, i18n } = useTranslation();
  const {
    event,
    loading: eventLoading,
    error: eventError,
    refetch: refetchEvent,
  } = useEvent(eventId);
  const query = useCardInsight(eventId);
  const [filters, setFilters] = useState<CardInsightFilters>({
    search: '',
    classId: '',
  });
  const [missingPage, setMissingPage] = useState(1);
  const [duplicatePage, setDuplicatePage] = useState(1);
  const report =
    query.data?.eventCardInsight ?? query.previousData?.eventCardInsight;
  const filtered = useMemo(
    () => filterCardInsight(report ?? EMPTY_REPORT, filters),
    [report, filters]
  );
  const classes = useMemo(
    () => cardInsightClasses(report ?? EMPTY_REPORT),
    [report]
  );
  const summary = summarizeCardInsight(filtered);
  const timezone = event?.timezone ?? 'UTC';
  const failed = !!query.error || !!eventError || (!eventLoading && !event);
  const canDisplay = !!report && !!event;
  const canExport = canDisplay && !failed && !query.loading && !eventLoading;
  const missingCurrent = Math.min(
    missingPage,
    Math.max(1, Math.ceil(summary.missing / PAGE_SIZE))
  );
  const duplicateCurrent = Math.min(
    duplicatePage,
    Math.max(1, Math.ceil(summary.duplicateNumbers / PAGE_SIZE))
  );
  const hasIssues =
    !!report &&
    (report.missingCards.length > 0 || report.duplicateCards.length > 0);
  const hasMatches = summary.missing > 0 || summary.duplicateNumbers > 0;
  const c = (key: keyof typeof en.Pages.Insights.Cards) =>
    t(`Pages.Insights.Cards.${key}`);
  const setFilter = (key: keyof CardInsightFilters, value: string) => {
    setFilters(current => ({ ...current, [key]: value }));
    setMissingPage(1);
    setDuplicatePage(1);
  };
  const refresh = () => {
    void query.refetch().catch(() => {});
    if (eventError) void refetchEvent().catch(() => {});
  };
  const columns = [
    c('Name'),
    c('Registration'),
    c('Class'),
    c('Organisation'),
    c('BibNumber'),
    c('Card'),
  ];
  const rowValues = (row: CardInsightCompetitor): (string | number)[] => [
    `${row.lastname} ${row.firstname}`,
    row.registration,
    row.className,
    row.organisation ?? '',
    row.bibNumber ?? '',
    row.card ?? '',
  ];
  const exportSections = () => {
    const generated = new Intl.DateTimeFormat(i18n.language, {
      timeZone: timezone,
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date());
    return [
      [
        [c('Title'), event?.name ?? ''],
        [t('Pages.Insights.Generated'), generated],
        [t('Pages.Insights.Timezone'), timezone],
        [
          c('Class'),
          classes.find(([id]) => String(id) === filters.classId)?.[1] ??
            t('Pages.Insights.All'),
        ],
        [t('Pages.Insights.Search'), filters.search || t('Pages.Insights.All')],
        [c('MissingCount'), summary.missing],
        [c('DuplicateCount'), summary.duplicateNumbers],
        [c('AffectedCount'), summary.duplicateCompetitors],
      ],
      [[c('Missing')], columns, ...filtered.missingCards.map(rowValues)],
      [
        [c('Duplicates')],
        [c('GroupSize'), ...columns],
        ...filtered.duplicateCards.flatMap(group =>
          group.competitors.map(row => [
            group.competitors.length,
            ...rowValues(row),
          ])
        ),
      ],
    ];
  };
  const download = () => {
    if (!canExport) return;
    const blob = new Blob(
      [insightCsv(exportSections().flatMap(section => [...section, []]))],
      { type: 'text/csv;charset=utf-8;' }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cards-${eventId}.csv`;
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
  const table = (rows: CardInsightCompetitor[], label: string) => (
    <Table aria-label={label}>
      <TableHeader>
        <TableRow>
          {columns.map(column => (
            <TableHead key={column}>{column}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(row => (
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
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
  return (
    <MainPageLayout t={t}>
      <section
        className="container mx-auto space-y-6 px-4 py-6"
        aria-busy={query.loading || eventLoading}
      >
        <BackLink to={PATHNAMES.eventInsights(eventId).url}>
          {t('Pages.Insights.Title')}
        </BackLink>
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{c('Title')}</h1>
            <p className="text-muted-foreground">{event?.name}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {c('Description')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={query.loading || eventLoading}
              onClick={refresh}
            >
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
        <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="card-insight-search">
              {t('Pages.Insights.Search')}
            </Label>
            <Input
              id="card-insight-search"
              value={filters.search}
              placeholder={c('SearchPlaceholder')}
              onChange={e => setFilter('search', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="card-insight-class">{c('Class')}</Label>
            <select
              id="card-insight-class"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
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
        </div>
        {(query.loading || eventLoading) && <p role="status">{c('Loading')}</p>}
        {failed && (
          <div
            role="alert"
            className="space-y-2 rounded-lg border border-destructive p-4"
          >
            <p>{canDisplay ? c('Stale') : c('Error')}</p>
            <Button
              variant="outline"
              disabled={query.loading}
              onClick={refresh}
            >
              {t('Pages.Insights.Retry')}
            </Button>
          </div>
        )}
        {canDisplay && (
          <>
            <dl className="grid gap-4 sm:grid-cols-3">
              {[
                [c('MissingCount'), summary.missing],
                [c('DuplicateCount'), summary.duplicateNumbers],
                [c('AffectedCount'), summary.duplicateCompetitors],
              ].map(([label, count]) => (
                <div key={label} className="rounded-lg border p-4">
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd className="text-2xl font-bold">{count}</dd>
                </div>
              ))}
            </dl>
            {!hasIssues && <p role="status">{c('NoIssues')}</p>}
            {hasIssues && !hasMatches && <p role="status">{c('NoMatches')}</p>}
            <section
              aria-labelledby="missing-cards-title"
              className="space-y-4"
            >
              <h2 id="missing-cards-title" className="text-xl font-semibold">
                {c('Missing')} ({summary.missing})
              </h2>
              {summary.missing ? (
                <>
                  {table(
                    filtered.missingCards.slice(
                      (missingCurrent - 1) * PAGE_SIZE,
                      missingCurrent * PAGE_SIZE
                    ),
                    c('Missing')
                  )}
                  <AppPagination
                    page={missingCurrent}
                    pageSize={PAGE_SIZE}
                    totalItems={summary.missing}
                    onPageChange={setMissingPage}
                  />
                </>
              ) : (
                <p className="text-muted-foreground">{c('NoMissing')}</p>
              )}
            </section>
            <section
              aria-labelledby="duplicate-cards-title"
              className="space-y-4"
            >
              <h2 id="duplicate-cards-title" className="text-xl font-semibold">
                {c('Duplicates')} ({summary.duplicateNumbers})
              </h2>
              <p className="text-sm text-muted-foreground">{c('FullGroups')}</p>
              {summary.duplicateNumbers ? (
                <>
                  {filtered.duplicateCards
                    .slice(
                      (duplicateCurrent - 1) * PAGE_SIZE,
                      duplicateCurrent * PAGE_SIZE
                    )
                    .map(group => (
                      <section
                        key={group.card}
                        aria-label={`${c('Card')} ${group.card}`}
                        className="rounded-lg border border-amber-500/50 p-4"
                      >
                        <h3 className="mb-3 font-semibold">
                          {c('Card')}: {group.card} · {c('GroupSize')}:{' '}
                          {group.competitors.length}
                        </h3>
                        {table(group.competitors, `${c('Card')} ${group.card}`)}
                      </section>
                    ))}
                  <AppPagination
                    page={duplicateCurrent}
                    pageSize={PAGE_SIZE}
                    totalItems={summary.duplicateNumbers}
                    onPageChange={setDuplicatePage}
                  />
                </>
              ) : (
                <p className="text-muted-foreground">{c('NoDuplicates')}</p>
              )}
            </section>
          </>
        )}
      </section>
    </MainPageLayout>
  );
}
