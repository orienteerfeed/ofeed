import { fromZonedTime } from 'date-fns-tz';
import {
  entryReportExportSections,
  entryPaymentMethodName,
  type EntryReportLabel,
} from './entry-report-format';
import { useParams } from '@tanstack/react-router';
import { Download, Printer, RefreshCw } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  ComposedChart,
  Line,
  Legend,
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
import { entryReportPrintHtml } from './entry-report-print';
import {
  buildEntryReport,
  buildEntryCumulativeCurve,
} from './entry-report.utils';
import { EntryReportSummary, EntryReportDetails } from './EntryReportDetails';
import {
  addDays,
  addEntryTimelineTrend,
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
  const reportContainer = useRef<HTMLElement>(null);
  const financialsForAllClasses = false;
  const timeline =
    query.data?.eventEntryTimeline ?? query.previousData?.eventEntryTimeline;
  const timezone = timeline?.timezone ?? event?.timezone ?? 'UTC';
  const today = paymentLocalDate(new Date().toISOString(), timezone);
  const points = useMemo(
    () => (timeline ? buildEntryTimeline(timeline, classId, today) : []),
    [timeline, classId, today]
  );
  const report = useMemo(
    () =>
      timeline?.orders
        ? buildEntryReport(timeline, classId, today, financialsForAllClasses)
        : undefined,
    [timeline, classId, today]
  );
  const dailyPoints = useMemo(
    () =>
      points.map(point => ({
        ...point,
        orders: report?.days.find(day => day.date === point.date)?.orders ?? 0,
      })),
    [points, report]
  );
  const cumulativePoints = useMemo(
    () => buildEntryCumulativeCurve(report, points, timezone, Date.now()),
    [report, points, timezone]
  );
  const chartPoints = useMemo(
    () => addEntryTimelineTrend(cumulativePoints, point => point.time),
    [cumulativePoints]
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

  const r = (key: EntryReportLabel) => t(`EntryReport.${key}`);

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
  const dateTimeFormat = new Intl.DateTimeFormat(i18n.language, {
    timeZone: timezone,
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const startTime = timeline?.startAt
    ? Date.parse(timeline.startAt)
    : undefined;
  const firstTime = cumulativePoints[0]?.time;
  const lastTime = cumulativePoints.at(-1)?.time;
  const showStart =
    startTime !== undefined &&
    firstTime !== undefined &&
    lastTime !== undefined &&
    startTime >= firstTime &&
    startTime <= lastTime;
  const startLabel = showStart
    ? `${r('RaceStart')} · ${dateTimeFormat.format(startTime)}`
    : '';
  const atMidnight = (date: string) =>
    fromZonedTime(`${date}T00:00:00`, timezone).getTime();
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
        [e('Title'), timeline?.eventName ?? event?.name ?? ''],
        [r('Location'), timeline?.location ?? ''],
        [
          r('StartTime'),
          timeline?.startAt
            ? new Intl.DateTimeFormat(i18n.language, {
                timeZone: timezone,
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(timeline.startAt))
            : '',
        ],
        [r('Filters'), r('UntilRace')],
        ...(report
          ? [
              [r('Orders'), report.orders],
              [r('Excluded'), report.cancelled],
              [r('HiddenAfterRace'), report.hiddenEntries],
              [
                r('FinancialSummary'),
                r(
                  !classId || financialsForAllClasses
                    ? 'FinanceAllClasses'
                    : 'FinanceWholeOrders'
                ),
              ],
            ]
          : []),
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
        [e('Table')],
        [
          e('Date'),
          e('Daily'),
          ...(report ? [r('Orders')] : []),
          e('LateEntries'),
          e('Cumulative'),
        ],
        ...points.map(point => [
          point.date,
          point.entries,
          ...(report
            ? [report.days.find(day => day.date === point.date)?.orders ?? 0]
            : []),
          point.lateEntries,
          point.total,
        ]),
      ],
      ...(report
        ? entryReportExportSections(
            report,
            r,
            i18n.language,
            timezone,
            method => entryPaymentMethodName(method, t)
          ).filter(section => section[0]?.[0] !== r('DailyOrders'))
        : []),
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
      entryReportPrintHtml(
        e('Title'),
        i18n.language,
        exportSections().filter(section => section[0]?.[0] !== r('RaceDay')),
        reportContainer.current,
        r('FinancialSummary')
      )
    );
    popup.document.close();
    popup.focus();
    void Promise.all(
      [...popup.document.images].map(image =>
        image.decode().catch(() => undefined)
      )
    ).then(() => popup.print());
  };

  const tooltip = (
    <RechartsTooltip
      labelFormatter={label => formatLongDay(String(label))}
      formatter={(value, name) => [
        new Intl.NumberFormat(i18n.language, {
          maximumFractionDigits: 1,
        }).format(Number(value ?? 0)),
        name === 'orders'
          ? r('Orders')
          : name === 'trend'
            ? e('Trend')
            : name === 'total'
              ? e('Cumulative')
              : e('Daily'),
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

  return (
    <MainPageLayout t={t}>
      <section
        className="container mx-auto space-y-6 px-4 py-6"
        ref={reportContainer}
        aria-busy={query.loading || eventLoading}
      >
        <BackLink to={PATHNAMES.eventInsights(eventId).url}>
          {t('Pages.Insights.Title')}
        </BackLink>
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{e('Title')}</h1>
            <p className="text-muted-foreground">
              {timeline?.eventName ?? event?.name}
            </p>
            {timeline?.startAt && (
              <p className="text-sm text-muted-foreground">
                {new Intl.DateTimeFormat(i18n.language, {
                  timeZone: timezone,
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(timeline.startAt))}{' '}
                · {timezone}
                {timeline.location ? ` · ${timeline.location}` : ''}
              </p>
            )}
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
        {report && report.hiddenEntries > 0 && (
          <p role="status" className="rounded-lg border p-3 text-sm">
            {r('HiddenAfterRace')}: <strong>{report.hiddenEntries}</strong>
          </p>
        )}
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
            {report && (
              <EntryReportSummary
                report={report}
                classSelected={!!classId}
                financialsForAllClasses={financialsForAllClasses}
              />
            )}
            {summary.total === 0 ? (
              <p role="status">{e('Empty')}</p>
            ) : (
              <>
                <section
                  data-entry-report-chart="cumulative"
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
                      <ComposedChart
                        data={chartPoints}
                        margin={{ top: 30, right: 20, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          className="stroke-border/60"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="time"
                          type="number"
                          domain={['dataMin', 'dataMax']}
                          tickFormatter={value =>
                            dateTimeFormat.format(Number(value))
                          }
                          tickLine={false}
                          axisLine={false}
                          minTickGap={32}
                        />
                        <YAxis
                          allowDecimals={false}
                          tickLine={false}
                          axisLine={false}
                        />
                        <RechartsTooltip
                          labelFormatter={value =>
                            dateTimeFormat.format(Number(value))
                          }
                          formatter={(value, name) => [
                            new Intl.NumberFormat(i18n.language, {
                              maximumFractionDigits: 1,
                            }).format(Number(value ?? 0)),
                            name === 'trend' ? e('Trend') : e('Cumulative'),
                          ]}
                        />
                        {lateFrom &&
                          inRange(lateFrom) &&
                          lastTime !== undefined && (
                            <ReferenceArea
                              x1={atMidnight(lateFrom)}
                              x2={lastTime}
                              className="fill-muted"
                              fillOpacity={0.6}
                            />
                          )}
                        {showStart && (
                          <ReferenceArea
                            x1={startTime}
                            x2={lastTime}
                            fill="var(--color-chart-2)"
                            fillOpacity={0.08}
                          />
                        )}
                        {markers
                          .filter(
                            ([date]) =>
                              date !== timeline?.eventOn &&
                              atMidnight(date) !== startTime
                          )
                          .map(([date, label]) => (
                            <ReferenceLine
                              key={label}
                              x={atMidnight(date)}
                              className="stroke-muted-foreground"
                              strokeDasharray="4 4"
                              label={{
                                value: label,
                                position: 'insideTopLeft',
                                className: 'fill-muted-foreground text-xs',
                              }}
                            />
                          ))}
                        <Area
                          type="monotoneX"
                          dataKey="total"
                          stroke="var(--color-chart-1)"
                          strokeWidth={2}
                          fill="var(--color-chart-1)"
                          fillOpacity={0.18}
                          isAnimationActive={false}
                        />
                        {points.length >= 2 && (
                          <Line
                            type="linear"
                            dataKey="trend"
                            stroke="var(--color-chart-2)"
                            strokeWidth={2}
                            strokeDasharray="6 4"
                            dot={false}
                            activeDot={false}
                            isAnimationActive={false}
                            legendType="plainline"
                          />
                        )}
                        <Legend
                          formatter={value =>
                            value === 'trend' ? e('Trend') : e('Cumulative')
                          }
                        />
                        {showStart && (
                          <ReferenceLine
                            x={startTime}
                            stroke="var(--color-destructive)"
                            strokeWidth={2}
                            strokeDasharray="5 3"
                            label={{
                              value: startLabel,
                              position:
                                startTime! > (firstTime! + lastTime!) / 2
                                  ? 'insideTopRight'
                                  : 'insideTopLeft',
                              fill: 'var(--color-destructive)',
                              fontSize: 10,
                            }}
                          />
                        )}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  {showStart && (
                    <p className="text-sm text-muted-foreground">
                      <strong>{startLabel}</strong> — {r('RaceStartNote')}
                    </p>
                  )}
                </section>
                <section
                  data-entry-report-chart="daily"
                  aria-labelledby="entry-daily-title"
                  className="space-y-2"
                >
                  <h2 id="entry-daily-title" className="text-xl font-semibold">
                    {e('Daily')}
                  </h2>
                  <div style={{ height: DAILY_CHART_HEIGHT }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={dailyPoints}
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
                        {report && (
                          <Legend
                            formatter={value =>
                              value === 'orders' ? r('Orders') : e('Daily')
                            }
                          />
                        )}
                        {report && (
                          <Bar
                            dataKey="orders"
                            fill="var(--color-chart-2)"
                            radius={[4, 4, 0, 0]}
                            isAnimationActive={false}
                          />
                        )}
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
                        {report && (
                          <TableHead className="text-right">
                            {r('Orders')}
                          </TableHead>
                        )}
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
                            {report && (
                              <TableCell className="text-right">
                                {report.days.find(
                                  day => day.date === point.date
                                )?.orders ?? 0}
                              </TableCell>
                            )}
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
            {report && (
              <EntryReportDetails
                key={classId}
                report={report}
                timezone={timezone}
                startAt={timeline?.startAt}
              />
            )}
          </>
        )}
      </section>
    </MainPageLayout>
  );
}
