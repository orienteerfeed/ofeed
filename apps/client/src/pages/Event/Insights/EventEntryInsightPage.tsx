import { useParams } from '@tanstack/react-router';
import { Download, Printer, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type en from '@/i18n/locales/en/translation.json';
import { Button } from '@/components/atoms';
import { BackLink } from '@/components/molecules';
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
import { cardInsightPrintHtml } from './card-insight.utils';
import {
  addDays,
  buildEntryTimeline,
  entryTimelineClasses,
  summarizeEntryTimeline,
} from './entry-timeline.utils';
import { insightCsv, paymentLocalDate } from './payment-insight.utils';
import { useEntryTimeline } from './useEntryTimeline';

const CHART_HEIGHT = 320;
const DAILY_CHART_HEIGHT = 160;

export function EventEntryInsightPage() {
  const { eventId } = useParams({ from: '/events/$eventId/insights/entries' });
  const { t, i18n } = useTranslation();
  const {
    event,
    loading: eventLoading,
    error: eventError,
    refetch: refetchEvent,
  } = useEvent(eventId);
  const query = useEntryTimeline(eventId);
  const [classId, setClassId] = useState('');
  const timeline =
    query.data?.eventEntryTimeline ?? query.previousData?.eventEntryTimeline;
  const timezone = timeline?.timezone ?? event?.timezone ?? 'UTC';
  const today = paymentLocalDate(new Date().toISOString(), timezone);
  const points = useMemo(
    () => (timeline ? buildEntryTimeline(timeline, classId, today) : []),
    [timeline, classId, today]
  );
  const classes = useMemo(
    () => (timeline ? entryTimelineClasses(timeline) : []),
    [timeline]
  );
  const summary = summarizeEntryTimeline(
    points,
    timeline?.entriesCloseOn ?? null
  );
  const failed = !!query.error || !!eventError || (!eventLoading && !event);
  const canDisplay = !!timeline && !!event;
  const canExport = canDisplay && !failed && !query.loading && !eventLoading;
  const e = (key: keyof typeof en.Pages.Insights.Entries) =>
    t(`Pages.Insights.Entries.${key}`);

  const dayFormat = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'numeric',
    timeZone: 'UTC',
  });
  const longDayFormat = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeZone: 'UTC',
  });
  const formatDay = (date: string) =>
    dayFormat.format(new Date(`${date}T00:00:00Z`));
  const formatLongDay = (date: string) =>
    longDayFormat.format(new Date(`${date}T00:00:00Z`));
  const percentFormat = new Intl.NumberFormat(i18n.language, {
    style: 'percent',
    maximumFractionDigits: 0,
  });

  const firstDate = points[0]?.date;
  const lastDate = points.at(-1)?.date;
  const inRange = (date: string | null | undefined): date is string =>
    !!date &&
    !!firstDate &&
    !!lastDate &&
    date >= firstDate &&
    date <= lastDate;
  const markers = [
    [timeline?.entriesOpenOn, e('Opens')],
    [timeline?.entriesCloseOn, e('Closes')],
    [timeline?.eventOn, e('Race')],
  ].filter((marker): marker is [string, string] => inRange(marker[0]));
  const lateFrom = timeline?.entriesCloseOn
    ? addDays(timeline.entriesCloseOn, 1)
    : null;

  const refresh = () => {
    void query.refetch().catch(() => {});
    if (eventError) void refetchEvent().catch(() => {});
  };
  const exportSections = () => {
    const generated = new Intl.DateTimeFormat(i18n.language, {
      timeZone: timezone,
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date());
    return [
      [
        [e('Title'), event?.name ?? ''],
        [t('Pages.Insights.Generated'), generated],
        [t('Pages.Insights.Timezone'), timezone],
        [
          e('Class'),
          classes.find(([id]) => String(id) === classId)?.[1] ??
            t('Pages.Insights.All'),
        ],
        [e('Total'), summary.total],
        [e('LateEntries'), summary.lateEntries],
      ],
      [
        [e('Date'), e('Daily'), e('LateEntries'), e('Cumulative')],
        ...points.map(point => [
          point.date,
          point.entries,
          point.lateEntries,
          point.total,
        ]),
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
    link.download = `entries-${eventId}.csv`;
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
      cardInsightPrintHtml(e('Title'), i18n.language, exportSections())
    );
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const tooltip = (
    <RechartsTooltip
      labelFormatter={label => formatLongDay(String(label))}
      formatter={(value, name) => [
        typeof value === 'number' ? value : Number(value ?? 0),
        name === 'total' ? e('Cumulative') : e('Daily'),
      ]}
    />
  );
  const xAxis = (
    <XAxis
      dataKey="date"
      tickFormatter={formatDay}
      tickLine={false}
      axisLine={false}
      minTickGap={24}
    />
  );
  const lateArea =
    lateFrom && inRange(lateFrom) && lastDate ? (
      <ReferenceArea
        x1={lateFrom}
        x2={lastDate}
        className="fill-muted"
        fillOpacity={0.6}
        ifOverflow="extendDomain"
      />
    ) : null;
  const markerLines = markers.map(([date, label]) => (
    <ReferenceLine
      key={label}
      x={date}
      className="stroke-muted-foreground"
      strokeDasharray="4 4"
      label={{
        value: label,
        position: 'insideTopLeft',
        className: 'fill-muted-foreground text-xs',
      }}
    />
  ));

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
            <h1 className="text-2xl font-bold">{e('Title')}</h1>
            <p className="text-muted-foreground">{event?.name}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {e('Description')}
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
            <Label htmlFor="entry-insight-class">{e('Class')}</Label>
            <select
              id="entry-insight-class"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={classId}
              onChange={change => setClassId(change.target.value)}
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
        {(query.loading || eventLoading) && <p role="status">{e('Loading')}</p>}
        {failed && (
          <div
            role="alert"
            className="space-y-2 rounded-lg border border-destructive p-4"
          >
            <p>{canDisplay ? e('Stale') : e('Error')}</p>
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
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                [e('Total'), String(summary.total)],
                [
                  e('FinalDaysShare'),
                  summary.finalDaysShare === null
                    ? '—'
                    : percentFormat.format(summary.finalDaysShare),
                ],
                [e('LateEntries'), String(summary.lateEntries)],
                [
                  e('PeakDay'),
                  summary.peak
                    ? `${formatLongDay(summary.peak.date)} (${summary.peak.entries})`
                    : '—',
                ],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border p-4">
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd className="text-2xl font-bold">{value}</dd>
                </div>
              ))}
            </dl>
            {summary.total === 0 ? (
              <p role="status">{e('Empty')}</p>
            ) : (
              <>
                <section
                  aria-labelledby="entry-cumulative-title"
                  className="space-y-2"
                >
                  <h2
                    id="entry-cumulative-title"
                    className="text-xl font-semibold"
                  >
                    {e('Cumulative')}
                  </h2>
                  <div style={{ height: CHART_HEIGHT }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={points}
                        margin={{ top: 24, right: 16, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          className="stroke-border/60"
                          vertical={false}
                        />
                        {xAxis}
                        <YAxis
                          allowDecimals={false}
                          tickLine={false}
                          axisLine={false}
                        />
                        {tooltip}
                        {lateArea}
                        {markerLines}
                        <Area
                          type="stepAfter"
                          dataKey="total"
                          stroke="var(--color-chart-1)"
                          strokeWidth={2}
                          fill="var(--color-chart-1)"
                          fillOpacity={0.18}
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </section>
                <section
                  aria-labelledby="entry-daily-title"
                  className="space-y-2"
                >
                  <h2 id="entry-daily-title" className="text-xl font-semibold">
                    {e('Daily')}
                  </h2>
                  <div style={{ height: DAILY_CHART_HEIGHT }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={points}
                        margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          className="stroke-border/60"
                          vertical={false}
                        />
                        {xAxis}
                        <YAxis
                          allowDecimals={false}
                          tickLine={false}
                          axisLine={false}
                        />
                        {tooltip}
                        {lateArea}
                        <Bar
                          dataKey="entries"
                          fill="var(--color-chart-1)"
                          radius={[4, 4, 0, 0]}
                          isAnimationActive={false}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  {lateArea && (
                    <p className="text-sm text-muted-foreground">
                      {e('LateArea')}
                    </p>
                  )}
                </section>
                <details className="rounded-lg border p-4">
                  <summary className="cursor-pointer font-medium">
                    {e('Table')}
                  </summary>
                  <Table aria-label={e('Table')}>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{e('Date')}</TableHead>
                        <TableHead className="text-right">
                          {e('Daily')}
                        </TableHead>
                        <TableHead className="text-right">
                          {e('LateEntries')}
                        </TableHead>
                        <TableHead className="text-right">
                          {e('Cumulative')}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {points
                        .filter(point => point.entries > 0)
                        .map(point => (
                          <TableRow key={point.date}>
                            <TableCell>{formatLongDay(point.date)}</TableCell>
                            <TableCell className="text-right">
                              {point.entries}
                            </TableCell>
                            <TableCell className="text-right">
                              {point.lateEntries}
                            </TableCell>
                            <TableCell className="text-right">
                              {point.total}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </details>
              </>
            )}
          </>
        )}
      </section>
    </MainPageLayout>
  );
}
