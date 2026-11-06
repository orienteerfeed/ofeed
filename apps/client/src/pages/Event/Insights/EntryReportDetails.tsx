import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/atoms';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  reportMoney,
  entryPaymentMethodName,
  type EntryReportLabel,
} from './entry-report-format';
import type { EntryReport } from './entry-report.utils';

export function EntryReportSummary({
  report,
  classSelected,
  financialsForAllClasses,
}: {
  report: EntryReport;
  classSelected: boolean;
  financialsForAllClasses: boolean;
}) {
  const { t, i18n } = useTranslation();
  const r = (key: EntryReportLabel) => t(`EntryReport.${key}`);
  return (
    <section className="space-y-3" aria-label={r('FinancialSummary')}>
      <div className="flex flex-wrap gap-4 text-sm">
        <span>
          {r('Orders')}: <strong>{report.orders}</strong>
        </span>
        <span>
          {r('Excluded')}: <strong>{report.cancelled}</strong>
        </span>
      </div>
      {classSelected && (
        <p className="text-sm text-muted-foreground">
          {r(
            financialsForAllClasses ? 'FinanceAllClasses' : 'FinanceWholeOrders'
          )}
        </p>
      )}
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {report.currencies.map(c =>
          [
            [r('OrderTotal'), reportMoney(c.total, c.currency, i18n.language)],
            [r('Received'), reportMoney(c.received, c.currency, i18n.language)],
            [
              r('Outstanding'),
              reportMoney(c.outstanding, c.currency, i18n.language),
            ],
            [r('PaidOrders'), String(c.paidOrders)],
            [r('UnpaidOrders'), String(c.unpaidOrders)],
            ...(c.legacyPaid > 0
              ? [
                  [
                    r('LegacyPaid'),
                    reportMoney(c.legacyPaid, c.currency, i18n.language),
                  ],
                ]
              : []),
          ].map(([name, value]) => (
            <div
              key={`${c.currency}-${name}`}
              className="rounded-lg border p-4"
            >
              <dt className="text-sm text-muted-foreground">
                {name} · {c.currency}
              </dt>
              <dd className="text-xl font-semibold">{value}</dd>
            </div>
          ))
        )}
      </dl>
      <p className="text-xs text-muted-foreground">{r('ReceiptNote')}</p>
    </section>
  );
}
export function EntryReportDetails({
  report,
  timezone,
  startAt,
}: {
  report: EntryReport;
  timezone: string;
  startAt?: string | undefined;
}) {
  const { t, i18n } = useTranslation();
  const r = (key: EntryReportLabel) => t(`EntryReport.${key}`);
  const methodName = (method: string | null) =>
    entryPaymentMethodName(method, t);
  const money = (amount: number, currency: string) =>
    reportMoney(Math.round(amount * 100), currency, i18n.language);
  const time = (timestamp: number) =>
    new Intl.DateTimeFormat(i18n.language, {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
    }).format(timestamp);
  const dateTime = (value: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      timeZone: timezone,
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(report.rows.length / 25));
  const safePage = Math.min(page, pages - 1);
  const methods = report.methods.map((method, index) => ({
    ...method,
    name: methodName(method.method),
    fill: `var(--color-chart-${(index % 5) + 1})`,
  }));
  const startTime = startAt ? Date.parse(startAt) : undefined;
  return (
    <div className="space-y-6">
      <section
        className="space-y-3"
        data-entry-report-chart="race"
        aria-labelledby="entry-race-day-title"
      >
        <h2 id="entry-race-day-title" className="text-xl font-semibold">
          {r('RaceDay')}
        </h2>
        {report.raceDay.length ? (
          <>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={report.raceDay}
                  margin={{ top: 24, right: 28, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="time"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={time}
                  />
                  <YAxis allowDecimals={false} />
                  <Tooltip
                    labelFormatter={value => time(Number(value))}
                    formatter={value => [value, r('Competitors')]}
                  />
                  {startTime !== undefined && (
                    <ReferenceLine
                      x={startTime}
                      stroke="var(--color-destructive)"
                      strokeDasharray="4 4"
                      ifOverflow="extendDomain"
                      label={{
                        value: `${r('StartTime')} ${time(startTime)}`,
                        position: 'insideTopLeft',
                      }}
                    />
                  )}
                  <Area
                    dataKey="total"
                    type="monotoneX"
                    stroke="var(--color-chart-2)"
                    fill="var(--color-chart-2)"
                    fillOpacity={0.15}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="text-sm text-muted-foreground">{r('RaceDayNote')}</p>
          </>
        ) : (
          <p className="text-muted-foreground">{r('NoRaceDayEntries')}</p>
        )}
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <section
          className="min-w-0 space-y-3"
          data-entry-report-chart="payments"
          aria-labelledby="entry-methods-title"
        >
          <h2 id="entry-methods-title" className="text-xl font-semibold">
            {r('PaymentMethods')}
          </h2>
          {!!methods.length && (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={methods}
                    dataKey="orders"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={75}
                    isAnimationActive={false}
                    label={({ percent }) =>
                      `${Math.round((percent ?? 0) * 100)}%`
                    }
                  >
                    {methods.map(method => (
                      <Cell key={method.method} fill={method.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <Table aria-label={r('PaymentMethods')}>
            <TableHeader>
              <TableRow>
                <TableHead>{r('PaymentMethod')}</TableHead>
                <TableHead>{r('Orders')}</TableHead>
                <TableHead>{r('OrderTotal')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {methods.map(method => (
                <TableRow key={method.method}>
                  <TableCell>{method.name}</TableCell>
                  <TableCell>{method.orders}</TableCell>
                  <TableCell>
                    {method.amounts.map(a => (
                      <div key={a.currency}>
                        {reportMoney(a.amount, a.currency, i18n.language)}
                      </div>
                    ))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
        <section
          className="min-w-0 space-y-3"
          data-entry-report-chart="categories"
          aria-labelledby="entry-categories-title"
        >
          <h2 id="entry-categories-title" className="text-xl font-semibold">
            {r('Categories')}
          </h2>
          {!!report.categories.length && (
            <div
              style={{ height: Math.max(240, report.categories.length * 34) }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={report.categories}
                  layout="vertical"
                  margin={{ left: 0, right: 24, top: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis dataKey="name" type="category" width={70} />
                  <Tooltip />
                  <Legend />
                  <Bar
                    name={r('Competitors')}
                    dataKey="entries"
                    fill="var(--color-chart-1)"
                    isAnimationActive={false}
                  />
                  <Bar
                    name={r('Orders')}
                    dataKey="orders"
                    fill="var(--color-chart-2)"
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <Table aria-label={r('Categories')}>
            <TableHeader>
              <TableRow>
                <TableHead>{r('Class')}</TableHead>
                <TableHead>{r('Competitors')}</TableHead>
                <TableHead>{r('Orders')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.categories.map(c => (
                <TableRow key={c.classId}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>{c.entries}</TableCell>
                  <TableCell>{c.orders}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      </div>
      <section className="space-y-3" aria-labelledby="entry-report-list-title">
        <h2 id="entry-report-list-title" className="text-xl font-semibold">
          {r('EntryList')}
        </h2>
        <p className="text-sm text-muted-foreground">{r('PriceNote')}</p>
        <Table aria-label={r('EntryList')}>
          <TableHeader>
            <TableRow>
              {[
                'ReceivedAt',
                'Competitor',
                'Class',
                'Club',
                'Card',
                'PaymentMethod',
                'Price',
                'Paid',
                'PaymentReference',
              ].map(key => (
                <TableHead key={key}>{r(key as EntryReportLabel)}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.rows.slice(safePage * 25, (safePage + 1) * 25).map(row => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap">
                  {dateTime(row.order.receivedAt)}
                </TableCell>
                <TableCell>
                  {row.lastname} {row.firstname}
                </TableCell>
                <TableCell>{row.className}</TableCell>
                <TableCell>{row.organisation ?? '—'}</TableCell>
                <TableCell>{row.card ?? '—'}</TableCell>
                <TableCell>{methodName(row.order.paymentMethod)}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {money(row.amount, row.order.currency)}
                  {row.order.promoCode && (
                    <div className="text-xs text-muted-foreground">
                      {row.order.promoCode}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {row.order.paid
                    ? r('Yes')
                    : row.order.receivedAmount > 0
                      ? r('Partial')
                      : r('No')}
                  {row.order.legacyPaid && (
                    <div className="text-xs text-muted-foreground">
                      {r('LegacyPaid')}
                    </div>
                  )}
                </TableCell>
                <TableCell className="font-mono">
                  {row.order.paymentReference}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <nav
          className="flex items-center justify-between gap-3"
          aria-label={r('EntryList')}
        >
          <Button
            variant="outline"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
          >
            {r('Previous')}
          </Button>
          <span className="text-sm">
            {safePage + 1} / {pages} · {report.rows.length}
          </span>
          <Button
            variant="outline"
            disabled={safePage + 1 >= pages}
            onClick={() => setPage(safePage + 1)}
          >
            {r('Next')}
          </Button>
        </nav>
      </section>
    </div>
  );
}
