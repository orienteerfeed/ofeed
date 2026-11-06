import { Link, useParams } from '@tanstack/react-router';
import { Download, Printer, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/atoms';
import { BackLink } from '@/components/molecules';
import { AppPagination } from '@/components/organisms/AppPagination';
import { Card, CardContent } from '@/components/ui/card';
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
import { formatEntryFee } from '../Entries/EntryClassCard';
import {
  filterPaymentInsights,
  insightCsv,
  summarizePaymentInsights,
  type PaymentInsightFilters,
} from './payment-insight.utils';
import { usePaymentInsights } from './usePaymentInsights';

const PAGE_SIZE = 25;
const EMPTY_FILTERS: PaymentInsightFilters = {
  from: '',
  to: '',
  method: '',
  deviceId: '',
  search: '',
};
const selectClass =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm';
const escapeHtml = (value: string | number) =>
  String(value).replace(
    /[&<>"']/g,
    char =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ] ?? char
  );

export function EventPaymentInsightPage() {
  const { eventId } = useParams({ from: '/events/$eventId/insights/payments' });
  const { t, i18n } = useTranslation();
  const { event, loading: eventLoading, error: eventError } = useEvent(eventId);
  const payments = usePaymentInsights(eventId);
  const [filters, setFilters] = useState<PaymentInsightFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const timezone = event?.timezone ?? 'UTC';
  const invalidRange = !!(
    filters.from &&
    filters.to &&
    filters.from > filters.to
  );
  const filtered = useMemo(
    () => filterPaymentInsights(payments.data ?? [], filters, timezone),
    [payments.data, filters, timezone]
  );
  const summaries = useMemo(
    () => summarizePaymentInsights(filtered),
    [filtered]
  );
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  );
  const devices = [
    ...new Set((payments.data ?? []).map(payment => payment.deviceId)),
  ].sort();
  const pending = payments.isPending || eventLoading;
  const failed = payments.isError || !!eventError || (!eventLoading && !event);
  const canDisplay = !pending && !failed && !invalidRange;
  const setFilter = (key: keyof PaymentInsightFilters, value: string) => {
    setFilters(current => ({ ...current, [key]: value }));
    setPage(1);
  };
  const time = (instant: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      timeZone: timezone,
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date(instant));
  // Bank imports show the booking day only; any time of day would be invented.
  const paidOn = (payment: { paidAt: string; bookingDate: string | null }) =>
    payment.bookingDate
      ? new Intl.DateTimeFormat(i18n.language, {
          timeZone: 'UTC',
          dateStyle: 'short',
        }).format(new Date(`${payment.bookingDate}T00:00:00Z`))
      : time(payment.paidAt);
  const methodName = (method: string) =>
    method === 'CASH'
      ? t('Pages.Insights.Cash')
      : method === 'QR'
        ? t('Pages.Insights.QR')
        : t('Pages.Insights.All');
  const columns = [
    t('Pages.Insights.PaidAt'),
    t('Pages.Insights.Reference'),
    t('Pages.Insights.Contact'),
    t('Pages.Insights.Method'),
    t('Pages.Insights.Amount'),
    t('Pages.Insights.Currency'),
    t('Pages.Insights.Device'),
    t('Pages.Insights.Operator'),
    t('Pages.Insights.RecordedAt'),
  ];
  const exportRow = (payment: (typeof filtered)[number]) => [
    paidOn(payment),
    payment.paymentReference,
    `${payment.contactFirstname} ${payment.contactLastname}`,
    methodName(payment.method),
    payment.amount.toFixed(2),
    payment.currency,
    payment.deviceId,
    payment.operatorId,
    time(payment.recordedAt),
  ];
  const exportDocument = () => {
    const metadata: (string | number)[][] = [
      [t('Pages.Insights.Payments'), event?.name ?? ''],
      [t('Pages.Insights.Generated'), time(new Date().toISOString())],
      [t('Pages.Insights.Timezone'), timezone],
      [t('Pages.Insights.From'), filters.from || t('Pages.Insights.All')],
      [t('Pages.Insights.To'), filters.to || t('Pages.Insights.All')],
      [t('Pages.Insights.Method'), methodName(filters.method)],
      [t('Pages.Insights.Device'), filters.deviceId || t('Pages.Insights.All')],
      [t('Pages.Insights.Search'), filters.search || t('Pages.Insights.All')],
      [t('Pages.Insights.Count'), filtered.length],
    ];
    const summaryRows = [
      [
        t('Pages.Insights.Currency'),
        t('Pages.Insights.Cash'),
        t('Pages.Insights.QR'),
        t('Pages.Insights.Total'),
        t('Pages.Insights.Count'),
      ],
      ...summaries.map(summary => [
        summary.currency,
        (summary.cash / 100).toFixed(2),
        (summary.qr / 100).toFixed(2),
        (summary.total / 100).toFixed(2),
        summary.count,
      ]),
    ];
    return { metadata, summaryRows, rows: filtered.map(exportRow) };
  };
  const download = () => {
    const { metadata, summaryRows, rows } = exportDocument();
    const blob = new Blob(
      [insightCsv([...metadata, [], ...summaryRows, [], columns, ...rows])],
      { type: 'text/csv;charset=utf-8;' }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `payments-${eventId}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const print = () => {
    const popup = window.open('', '_blank');
    if (!popup) {
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        variant: 'error',
      });
      return;
    }
    popup.opener = null;
    const { metadata, summaryRows, rows } = exportDocument();
    const table = (values: (string | number)[][], header: boolean) =>
      `<table>${values.map((row, index) => `<tr>${row.map(cell => `<${header && index === 0 ? 'th' : 'td'}>${escapeHtml(cell)}</${header && index === 0 ? 'th' : 'td'}>`).join('')}</tr>`).join('')}</table>`;
    popup.document.write(
      `<!doctype html><html lang="${escapeHtml(i18n.language)}"><head><meta charset="utf-8"><title>${escapeHtml(t('Pages.Insights.Payments'))}</title><style>@page{size:landscape;margin:12mm}body{font:12px Arial,sans-serif;color:#111}table{border-collapse:collapse;width:100%;margin:16px 0}th,td{border:1px solid #ccc;text-align:left;padding:6px;overflow-wrap:anywhere}tr{break-inside:avoid}th{background:#eee}</style></head><body><h1>${escapeHtml(t('Pages.Insights.Payments'))}</h1>${table(metadata, false)}${table(summaryRows, true)}${table([columns, ...rows], true)}</body></html>`
    );
    popup.document.close();
    popup.focus();
    popup.print();
  };

  return (
    <MainPageLayout t={t}>
      <section className="container mx-auto space-y-6 px-4 py-6">
        <BackLink to={PATHNAMES.eventInsights(eventId).url}>
          {t('Pages.Insights.Title')}
        </BackLink>
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">
              {t('Pages.Insights.Payments')}
            </h1>
            <p className="text-muted-foreground">{event?.name}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={payments.isFetching || eventLoading}
              onClick={() => {
                void payments.refetch();
              }}
            >
              <RefreshCw className="h-4 w-4" />
              {t('Pages.Insights.Refresh')}
            </Button>
            <Button variant="outline" onClick={download} disabled={!canDisplay}>
              <Download className="h-4 w-4" />
              {t('Pages.Insights.Export')}
            </Button>
            <Button variant="outline" onClick={print} disabled={!canDisplay}>
              <Printer className="h-4 w-4" />
              {t('Pages.Insights.Print')}
            </Button>
          </div>
        </header>
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-2">
                <Label htmlFor="insight-from">{t('Pages.Insights.From')}</Label>
                <Input
                  id="insight-from"
                  type="date"
                  value={filters.from}
                  onChange={e => setFilter('from', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="insight-to">{t('Pages.Insights.To')}</Label>
                <Input
                  id="insight-to"
                  type="date"
                  value={filters.to}
                  onChange={e => setFilter('to', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="insight-method">
                  {t('Pages.Insights.Method')}
                </Label>
                <select
                  id="insight-method"
                  className={selectClass}
                  value={filters.method}
                  onChange={e => setFilter('method', e.target.value)}
                >
                  <option value="">{t('Pages.Insights.All')}</option>
                  <option value="CASH">{t('Pages.Insights.Cash')}</option>
                  <option value="QR">{t('Pages.Insights.QR')}</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="insight-device">
                  {t('Pages.Insights.Device')}
                </Label>
                <select
                  id="insight-device"
                  className={selectClass}
                  value={filters.deviceId}
                  onChange={e => setFilter('deviceId', e.target.value)}
                >
                  <option value="">{t('Pages.Insights.All')}</option>
                  {devices.map(device => (
                    <option key={device} value={device}>
                      {device}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="insight-search">
                  {t('Pages.Insights.Search')}
                </Label>
                <Input
                  id="insight-search"
                  placeholder={t('Pages.Insights.SearchPlaceholder')}
                  value={filters.search}
                  onChange={e => setFilter('search', e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('Pages.Insights.Timezone')}: {timezone}
            </p>
            {invalidRange && (
              <p role="alert" className="text-sm text-destructive">
                {t('Pages.Insights.InvalidRange')}
              </p>
            )}
          </CardContent>
        </Card>
        {failed ? (
          <div role="alert" className="space-y-3">
            <p className="text-destructive">{t('Pages.Insights.Error')}</p>
            <Button
              variant="outline"
              onClick={() => {
                if (eventError || !event) window.location.reload();
                else void payments.refetch();
              }}
            >
              {t('Pages.Insights.Retry')}
            </Button>
          </div>
        ) : pending ? (
          <p role="status">{t('Loading', { ns: 'common' })}</p>
        ) : (
          canDisplay && (
            <>
              <p className="text-sm font-medium">
                {t('Pages.Insights.Count')}: {filtered.length}
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                {summaries.map(summary => (
                  <Card key={summary.currency}>
                    <CardContent className="grid grid-cols-3 gap-3 pt-6 text-sm">
                      {(['cash', 'qr', 'total'] as const).map((key, index) => (
                        <div key={key}>
                          <div className="text-muted-foreground">
                            {
                              [
                                t('Pages.Insights.Cash'),
                                t('Pages.Insights.QR'),
                                t('Pages.Insights.Total'),
                              ][index]
                            }
                          </div>
                          <strong>
                            {formatEntryFee(
                              summary[key] / 100,
                              summary.currency,
                              i18n.language
                            )}
                          </strong>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
              {filtered.length === 0 ? (
                <p className="text-muted-foreground">
                  {t('Pages.Insights.Empty')}
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {columns.map(column => (
                            <TableHead key={column}>{column}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered
                          .slice(
                            (currentPage - 1) * PAGE_SIZE,
                            currentPage * PAGE_SIZE
                          )
                          .map(payment => (
                            <TableRow key={payment.id}>
                              <TableCell className="whitespace-nowrap">
                                {paidOn(payment)}
                              </TableCell>
                              <TableCell>
                                <Link
                                  to="/events/$eventId/entries/$entryId"
                                  params={{ eventId, entryId: payment.entryId }}
                                  className="font-mono underline"
                                >
                                  {payment.paymentReference}
                                </Link>
                              </TableCell>
                              <TableCell>
                                {payment.contactFirstname}{' '}
                                {payment.contactLastname}
                              </TableCell>
                              <TableCell>
                                {methodName(payment.method)}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-right">
                                {formatEntryFee(
                                  payment.amount,
                                  payment.currency,
                                  i18n.language
                                )}
                              </TableCell>
                              <TableCell>{payment.currency}</TableCell>
                              <TableCell>{payment.deviceId}</TableCell>
                              <TableCell>{payment.operatorId}</TableCell>
                              <TableCell className="whitespace-nowrap">
                                {time(payment.recordedAt)}
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                  <AppPagination
                    page={currentPage}
                    pageSize={PAGE_SIZE}
                    totalItems={filtered.length}
                    onPageChange={setPage}
                  />
                </>
              )}
            </>
          )
        )}
      </section>
    </MainPageLayout>
  );
}
