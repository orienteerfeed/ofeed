import { useMutation, useQuery } from '@apollo/client/react';
import { Link, useParams } from '@tanstack/react-router';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  MoreHorizontal,
  Printer,
} from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge, Button } from '@/components/atoms';
import { BackLink, ConfirmDialog } from '@/components/molecules';
import {
  AppDataTable,
  AppPagination,
  AppRowsPerPage,
} from '@/components/organisms';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MainPageLayout } from '@/templates/MainPageLayout';
import { toast } from '@/utils';
import { useEvent } from '@/hooks';
import { formatDate, formatDateTime, getLocaleKey } from '@/lib/date';
import type { EntryStatus } from '@repo/shared';

import { formatEntryFee } from './EntryClassCard';
import { EntryItemsTable } from './EntryItemsTable';
import {
  formatCsosUnifiedEntryExport,
  formatProcessedEntryItemsCsv,
  getEntryStatusBadgeVariant,
} from './entries.utils';
import {
  ENTRY_ORDER_PROCESS,
  ENTRY_ORDER_PAID_UPDATE,
  ENTRY_ORDER_STATUS_UPDATE,
  ENTRY_ORDERS_BY_EVENT,
  type EntryOrderPaidUpdateResponse,
  type EntryOrderPaidUpdateVariables,
  type EntryOrderProcessResponse,
  type EntryOrderProcessVariables,
  type EntryOrderRow,
  type EntryOrderStatusUpdateResponse,
  type EntryOrderStatusUpdateVariables,
  type EntryOrdersByEventData,
  type EntryOrdersByEventVariables,
} from './entryOrders.gql';

const TABLE_COLUMN_COUNT = 8;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const STATUS_VISIBILITY_STORAGE_KEY =
  'orienteerfeed:entry-orders:status-visibility';
const FILTERABLE_STATUSES = [
  'PROCESSED',
  'APPROVED',
  'CANCELLED',
  'REJECTED',
] as const satisfies readonly EntryStatus[];

type FilterableStatus = (typeof FILTERABLE_STATUSES)[number];
type StatusVisibility = Record<FilterableStatus, boolean>;
type SortKey =
  | 'paymentReference'
  | 'contact'
  | 'items'
  | 'totalAmount'
  | 'paid'
  | 'createdAt'
  | 'status';
type SortDirection = 'asc' | 'desc';
type Sort = { key: SortKey; direction: SortDirection };

const DEFAULT_STATUS_VISIBILITY: StatusVisibility = {
  PROCESSED: true,
  APPROVED: true,
  CANCELLED: true,
  REJECTED: true,
};

const ENTRY_STATUS_SORT_ORDER: Record<EntryStatus, number> = {
  RECEIVED: 0,
  APPROVED: 1,
  PROCESSED: 2,
  REJECTED: 3,
  CANCELLED: 4,
};

function isFilterableStatus(status: EntryStatus): status is FilterableStatus {
  return FILTERABLE_STATUSES.includes(status as FilterableStatus);
}

function getStatusVisibilityStorageKey(eventId: string) {
  return `${STATUS_VISIBILITY_STORAGE_KEY}:${eventId}`;
}

function readStatusVisibility(eventId: string): StatusVisibility {
  const fallback = { ...DEFAULT_STATUS_VISIBILITY };

  try {
    const storedValue = window.localStorage.getItem(
      getStatusVisibilityStorageKey(eventId)
    );
    if (!storedValue) return fallback;

    const parsedValue: unknown = JSON.parse(storedValue);
    if (!parsedValue || typeof parsedValue !== 'object') return fallback;

    for (const status of FILTERABLE_STATUSES) {
      const value = (parsedValue as Record<string, unknown>)[status];
      if (typeof value === 'boolean') {
        fallback[status] = value;
      }
    }
  } catch {
    // Ignore unavailable or malformed browser storage and keep the defaults.
  }

  return fallback;
}

export function EventEntriesManagePage() {
  const { t, i18n } = useTranslation();
  const { eventId } = useParams({ from: '/events/$eventId/entries' });
  const { event } = useEvent(eventId);
  const localeKey = getLocaleKey(i18n.language);

  const { data, loading, error, refetch } = useQuery<
    EntryOrdersByEventData,
    EntryOrdersByEventVariables
  >(ENTRY_ORDERS_BY_EVENT, {
    variables: { eventId },
    skip: !eventId,
  });

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusVisibility, setStatusVisibility] = useState<StatusVisibility>(
    DEFAULT_STATUS_VISIBILITY
  );
  const [hasLoadedStatusVisibility, setHasLoadedStatusVisibility] =
    useState(false);
  const [sort, setSort] = useState<Sort | null>(null);
  const [pendingEntryId, setPendingEntryId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    entryId: string;
    status: 'REJECTED' | 'CANCELLED';
  } | null>(null);
  // Items are the primary content of this table, so orders are expanded by
  // default; this set tracks the (usually few) orders a user collapsed.
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const toggleExpanded = (entryId: string) => {
    setCollapsedIds(current => {
      const next = new Set(current);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  };

  const [statusUpdate] = useMutation<
    EntryOrderStatusUpdateResponse,
    EntryOrderStatusUpdateVariables
  >(ENTRY_ORDER_STATUS_UPDATE, {
    update(cache, { data: mutationData }) {
      const updated = mutationData?.entryOrderStatusUpdate;
      if (!updated) return;
      const cacheId = cache.identify({ __typename: 'Entry', id: updated.id });
      if (!cacheId) return;
      cache.modify({
        id: cacheId,
        fields: {
          status() {
            return updated.status;
          },
        },
      });
    },
  });

  const [paidUpdate] = useMutation<
    EntryOrderPaidUpdateResponse,
    EntryOrderPaidUpdateVariables
  >(ENTRY_ORDER_PAID_UPDATE, {
    update(cache, { data: mutationData }) {
      const updated = mutationData?.entryOrderPaidUpdate;
      if (!updated) return;
      const cacheId = cache.identify({ __typename: 'Entry', id: updated.id });
      if (!cacheId) return;
      cache.modify({
        id: cacheId,
        fields: {
          paid() {
            return updated.paid;
          },
        },
      });
    },
  });

  const [processOrder] = useMutation<
    EntryOrderProcessResponse,
    EntryOrderProcessVariables
  >(ENTRY_ORDER_PROCESS);

  useEffect(() => {
    setHasLoadedStatusVisibility(false);
    setStatusVisibility(readStatusVisibility(eventId));
    setHasLoadedStatusVisibility(true);
  }, [eventId]);

  useEffect(() => {
    if (!hasLoadedStatusVisibility) return;

    try {
      window.localStorage.setItem(
        getStatusVisibilityStorageKey(eventId),
        JSON.stringify(statusVisibility)
      );
    } catch {
      // Filtering must still work when browser storage is unavailable.
    }
  }, [eventId, hasLoadedStatusVisibility, statusVisibility]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, sort, statusVisibility]);

  const entries = useMemo(() => data?.entryOrdersByEvent ?? [], [data]);
  const processedEntryItems = useMemo(
    () =>
      entries
        .filter(entry => entry.status === 'PROCESSED')
        .flatMap(entry => entry.items)
        .filter(item => item.actionKey === 'NEW_ENTRY'),
    [entries]
  );
  const filteredEntries = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();

    return entries.filter(entry => {
      if (isFilterableStatus(entry.status) && !statusVisibility[entry.status]) {
        return false;
      }

      if (!normalizedQuery) return true;

      const searchableValues = [
        entry.paymentReference,
        entry.contactFirstname,
        entry.contactLastname,
        entry.contactEmail,
        ...entry.items.flatMap(item => [
          item.firstname,
          item.lastname,
          item.registration,
          item.organisation,
          item.class.name,
        ]),
      ];

      return searchableValues.some(value =>
        value?.toLocaleLowerCase().includes(normalizedQuery)
      );
    });
  }, [entries, searchQuery, statusVisibility]);

  const sortedEntries = useMemo(() => {
    if (!sort) return filteredEntries;

    const compareText = (left: string, right: string) =>
      left.localeCompare(right, i18n.language, { sensitivity: 'base' });
    const compareNumber = (left: number, right: number) => left - right;

    return [...filteredEntries].sort((left, right) => {
      let comparison: number;

      switch (sort.key) {
        case 'paymentReference':
          comparison = compareText(
            left.paymentReference,
            right.paymentReference
          );
          break;
        case 'contact':
          comparison = compareText(
            `${left.contactLastname} ${left.contactFirstname}`,
            `${right.contactLastname} ${right.contactFirstname}`
          );
          break;
        case 'items':
          comparison = compareNumber(left.items.length, right.items.length);
          break;
        case 'totalAmount':
          comparison = compareNumber(left.totalAmount, right.totalAmount);
          break;
        case 'paid':
          comparison = compareNumber(Number(left.paid), Number(right.paid));
          break;
        case 'createdAt':
          comparison = compareNumber(
            new Date(left.createdAt).getTime(),
            new Date(right.createdAt).getTime()
          );
          break;
        case 'status':
          comparison = compareNumber(
            ENTRY_STATUS_SORT_ORDER[left.status],
            ENTRY_STATUS_SORT_ORDER[right.status]
          );
          break;
      }

      return sort.direction === 'asc' ? comparison : -comparison;
    });
  }, [filteredEntries, i18n.language, sort]);

  const totalItems = sortedEntries.length;
  const pagedEntries = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedEntries.slice(start, start + pageSize);
  }, [page, pageSize, sortedEntries]);

  const toggleSort = (key: SortKey) => {
    setSort(current => {
      if (current?.key !== key) {
        return { key, direction: 'asc' };
      }

      return {
        key,
        direction: current.direction === 'asc' ? 'desc' : 'asc',
      };
    });
  };

  const exportCsosUnifiedEntries = () => {
    const text = formatCsosUnifiedEntryExport(
      processedEntryItems.map(item => ({
        registration: item.registration,
        className: item.class.name,
        card: item.card,
        lastname: item.lastname,
        firstname: item.firstname,
        license: item.license,
        note: item.note,
        cardRental: item.cardRental,
      }))
    );
    const downloadUrl = URL.createObjectURL(
      new Blob([text], { type: 'text/plain;charset=utf-8' })
    );
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `csos-prihlasky-${eventId}.txt`;
    link.click();
    URL.revokeObjectURL(downloadUrl);
  };

  const exportProcessedEntryItemsCsv = () => {
    const text = formatProcessedEntryItemsCsv(
      entries
        .filter(entry => entry.status === 'PROCESSED')
        .flatMap(entry =>
          entry.items.map(item => ({
            entryId: entry.id,
            entryItemId: item.id,
            actionKey: item.actionKey,
            className: item.class.name,
            registration: item.registration,
            lastname: item.lastname,
            firstname: item.firstname,
            card: item.card,
            fee: item.fee,
            cardRentalFee: item.cardRentalFee,
            orderTotalAmount: entry.totalAmount,
            currency: entry.currency,
            paymentReference: entry.paymentReference,
            paymentMethod: entry.paymentMethod,
            contactEmail: entry.contactEmail,
          }))
        )
    );
    const downloadUrl = URL.createObjectURL(
      new Blob(['\uFEFF', text], { type: 'text/csv;charset=utf-8' })
    );
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `zpracovane-polozky-${eventId}.csv`;
    link.click();
    URL.revokeObjectURL(downloadUrl);
  };

  const printAllEntries = () => {
    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    const headers = [
      t('Pages.Event.EntriesManage.Columns.PaymentReference'),
      t('Pages.Event.EntriesManage.Columns.Contact'),
      t('Pages.Event.EntriesManage.Columns.Items'),
      t('Pages.Event.EntriesManage.Columns.Total'),
      t('Pages.Event.EntriesManage.Columns.Paid'),
      t('Pages.Event.EntriesManage.Columns.Created'),
      t('Pages.Event.EntriesManage.Columns.Status'),
    ];
    const rows = entries
      .map(entry => {
        const items = entry.items
          .map(
            item =>
              `<li><strong>${escapeHtml(`${item.lastname} ${item.firstname}`)}</strong> — ${escapeHtml(item.class.name)}${item.registration ? ` (${escapeHtml(item.registration)})` : ''}${item.card ? ` · ${escapeHtml(item.card.toString())}` : ''}${item.startTime ? ` · ${escapeHtml(formatDateTime(item.startTime))}` : ''}</li>`
          )
          .join('');
        const cells = [
          escapeHtml(entry.paymentReference),
          `${escapeHtml(`${entry.contactFirstname} ${entry.contactLastname}`)}<br><span class="muted">${escapeHtml(entry.contactEmail)}</span>`,
          `<ul>${items}</ul>`,
          escapeHtml(
            formatEntryFee(entry.totalAmount, entry.currency, i18n.language)
          ),
          escapeHtml(
            entry.paid
              ? t('Pages.Event.EntriesManage.Paid.Yes')
              : t('Pages.Event.EntriesManage.Paid.No')
          ),
          escapeHtml(formatDateTime(entry.createdAt)),
          escapeHtml(t(`Pages.Event.EntriesManage.Status.${entry.status}`)),
        ];
        return `<tr>${cells.map(cell => `<td>${cell}</td>`).join('')}</tr>`;
      })
      .join('');
    const html = `<!doctype html>
<html lang="${escapeHtml(i18n.language)}"><head><meta charset="UTF-8" />
<title>${escapeHtml(t('Pages.Event.EntriesManage.Title'))}</title>
<style>
  body { font-family: Arial, sans-serif; color: #111827; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  p { font-size: 12px; color: #4b5563; margin: 0 0 16px; }
  .event-meta { font-size: 13px; color: #111827; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f3f4f6; font-weight: 600; }
  tr:nth-child(even) td { background: #fafafa; }
  ul { margin: 0; padding-left: 16px; } li + li { margin-top: 3px; }
  .muted { color: #4b5563; }
  @page { margin: 16mm; @bottom-left { content: "${escapeHtml(t('Pages.Event.EntriesManage.Print.Footer'))}"; font-size: 9px; color: #6b7280; } @bottom-right { content: "${escapeHtml(t('Pages.Event.EntriesManage.Print.Page'))} " counter(page) " ${escapeHtml(t('Pages.Event.EntriesManage.Print.Of'))} " counter(pages); font-size: 9px; color: #6b7280; } }
  @media print { body { padding: 0; } }
</style></head><body>
  <h1>${escapeHtml(event?.name ?? t('Pages.Event.EntriesManage.Title'))}</h1>
  <p class="event-meta">${escapeHtml(t('Pages.Event.Detail.Date'))}: ${escapeHtml(event ? formatDate(event.date, localeKey) : '')} · ${escapeHtml(t('Pages.Event.Detail.Location'))}: ${escapeHtml(event?.location ?? '')}</p>
  <p>${escapeHtml(t('Pages.Event.EntriesManage.Print.Description', { count: entries.length }))}</p>
  <table><thead><tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
</body></html>`;
    const printWindow = window.open('', '_blank', 'width=1280,height=900');
    if (!printWindow) return;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const renderSortableHeader = (key: SortKey, label: string) => {
    const activeSort = sort?.key === key ? sort : null;
    const SortIcon =
      activeSort?.direction === 'asc'
        ? ArrowUp
        : activeSort?.direction === 'desc'
          ? ArrowDown
          : ArrowUpDown;

    return (
      <TableHead
        aria-sort={
          activeSort?.direction === 'asc'
            ? 'ascending'
            : activeSort?.direction === 'desc'
              ? 'descending'
              : 'none'
        }
      >
        <Button
          type="button"
          variant="ghost"
          className="-ml-3 h-8 px-3 text-xs font-medium hover:bg-transparent hover:text-foreground"
          onClick={() => toggleSort(key)}
          title={t('Pages.Event.EntriesManage.Sort.By', { column: label })}
        >
          {label}
          <SortIcon className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </TableHead>
    );
  };

  const handleStatusChange = async (entryId: string, status: EntryStatus) => {
    setPendingEntryId(entryId);
    try {
      await statusUpdate({ variables: { entryId, status } });
      toast({
        title: t('Operations.Success', { ns: 'common' }),
        description: t('Pages.Event.EntriesManage.Toast.StatusUpdated'),
      });
    } catch (mutationError) {
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description:
          mutationError instanceof Error
            ? mutationError.message
            : t('Pages.Event.EntriesManage.Toast.StatusUpdateError'),
        variant: 'error',
      });
    } finally {
      setPendingEntryId(null);
    }
  };

  const handlePaidChange = async (entryId: string, paid: boolean) => {
    setPendingEntryId(entryId);
    try {
      await paidUpdate({ variables: { entryId, paid } });
      toast({
        title: t('Operations.Success', { ns: 'common' }),
        description: t('Pages.Event.EntriesManage.Toast.PaidUpdated'),
      });
    } catch (mutationError) {
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description:
          mutationError instanceof Error
            ? mutationError.message
            : t('Pages.Event.EntriesManage.Toast.PaidUpdateError'),
        variant: 'error',
      });
    } finally {
      setPendingEntryId(null);
    }
  };

  const handleProcess = async (entryId: string) => {
    setPendingEntryId(entryId);
    try {
      await processOrder({ variables: { entryId } });
      await refetch();
      toast({
        title: t('Operations.Success', { ns: 'common' }),
        description: t('Pages.Event.EntriesManage.Toast.Processed'),
      });
    } catch (mutationError) {
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description:
          mutationError instanceof Error
            ? mutationError.message
            : t('Pages.Event.EntriesManage.Toast.ProcessError'),
        variant: 'error',
      });
    } finally {
      setPendingEntryId(null);
    }
  };

  return (
    <MainPageLayout t={t} pageName={t('Pages.Event.EntriesManage.Title')}>
      <section className="container mx-auto px-4 py-6">
        <BackLink to={`/events/${eventId}`} className="mb-4" />

        <h1 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl">
          {t('Pages.Event.EntriesManage.Title')}
        </h1>

        <div className="mb-4 flex flex-col gap-4 rounded-lg border bg-card p-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="w-full lg:max-w-md">
            <Label htmlFor="entry-orders-search">
              {t('Pages.Event.EntriesManage.Filters.SearchLabel')}
            </Label>
            <Input
              id="entry-orders-search"
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder={t(
                'Pages.Event.EntriesManage.Filters.SearchPlaceholder'
              )}
              className="mt-3"
            />
          </div>

          <fieldset className="w-full lg:w-auto">
            <legend className="text-sm font-medium">
              {t('Pages.Event.EntriesManage.Filters.StatusVisibility')}
            </legend>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
              {FILTERABLE_STATUSES.map(status => {
                const checkboxId = `entry-orders-status-${status.toLowerCase()}`;

                return (
                  <div key={status} className="flex items-center gap-2">
                    <Checkbox
                      id={checkboxId}
                      checked={statusVisibility[status]}
                      onCheckedChange={checked => {
                        setStatusVisibility(current => ({
                          ...current,
                          [status]: checked === true,
                        }));
                      }}
                    />
                    <Label
                      htmlFor={checkboxId}
                      className="cursor-pointer text-sm"
                    >
                      {t('Pages.Event.EntriesManage.Filters.ShowStatus', {
                        status: t(`Pages.Event.EntriesManage.Status.${status}`),
                      })}
                    </Label>
                  </div>
                );
              })}
            </div>
          </fieldset>
        </div>

        <AppDataTable<EntryOrderRow>
          data={pagedEntries}
          isLoading={loading}
          error={error}
          columnCount={TABLE_COLUMN_COUNT}
          emptyStateText={t('Pages.Event.EntriesManage.Empty')}
          renderToolbar={
            <div className="flex items-center justify-between gap-2">
              <AppRowsPerPage
                pageSize={pageSize}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                onPageSizeChange={size => {
                  setPageSize(size);
                  setPage(1);
                }}
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={printAllEntries}
                >
                  <Printer className="h-4 w-4" />
                  {t('Pages.Event.EntriesManage.Export.PrintAll')}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline">
                      <Download className="h-4 w-4" />
                      {t('Pages.Event.EntriesManage.Export.Button')}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      disabled={processedEntryItems.length === 0}
                      onSelect={exportCsosUnifiedEntries}
                    >
                      {t('Pages.Event.EntriesManage.Export.CsosUnifiedFormat')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={processedEntryItems.length === 0}
                      onSelect={exportProcessedEntryItemsCsv}
                    >
                      {t('Pages.Event.EntriesManage.Export.ProcessedItemsCsv')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          }
          renderPagination={
            <AppPagination
              page={page}
              pageSize={pageSize}
              totalItems={totalItems}
              onPageChange={setPage}
            />
          }
          renderHeader={
            <TableHeader>
              <TableRow>
                {renderSortableHeader(
                  'paymentReference',
                  t('Pages.Event.EntriesManage.Columns.PaymentReference')
                )}
                {renderSortableHeader(
                  'contact',
                  t('Pages.Event.EntriesManage.Columns.Contact')
                )}
                {renderSortableHeader(
                  'items',
                  t('Pages.Event.EntriesManage.Columns.Items')
                )}
                {renderSortableHeader(
                  'totalAmount',
                  t('Pages.Event.EntriesManage.Columns.Total')
                )}
                {renderSortableHeader(
                  'paid',
                  t('Pages.Event.EntriesManage.Columns.Paid')
                )}
                {renderSortableHeader(
                  'createdAt',
                  t('Pages.Event.EntriesManage.Columns.Created')
                )}
                {renderSortableHeader(
                  'status',
                  t('Pages.Event.EntriesManage.Columns.Status')
                )}
                <TableHead>
                  {t('Pages.Event.EntriesManage.Columns.Actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
          }
          renderRow={entry => {
            const badge = getEntryStatusBadgeVariant(entry.status);
            const isPending = pendingEntryId === entry.id;
            const isExpanded = !collapsedIds.has(entry.id);
            const hasMissingCard = entry.items.some(item => item.card === null);
            const canEdit = !['PROCESSED', 'REJECTED', 'CANCELLED'].includes(
              entry.status
            );

            return (
              <Fragment key={entry.id}>
                <TableRow>
                  <TableCell className="font-mono">
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => toggleExpanded(entry.id)}
                        aria-expanded={isExpanded}
                        aria-label={t(
                          isExpanded
                            ? 'Pages.Event.EntriesManage.Actions.CollapseItems'
                            : 'Pages.Event.EntriesManage.Actions.ExpandItems'
                        )}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                      <Link
                        to="/events/$eventId/entries/$entryId"
                        params={{ eventId, entryId: entry.id }}
                        className="underline decoration-dotted underline-offset-4 hover:decoration-solid"
                      >
                        {entry.paymentReference}
                      </Link>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {entry.contactFirstname} {entry.contactLastname}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {entry.contactEmail}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t('Pages.Event.EntriesManage.ItemsCount', {
                      count: entry.items.length,
                    })}
                  </TableCell>
                  <TableCell>
                    {formatEntryFee(
                      entry.totalAmount,
                      entry.currency,
                      i18n.language
                    )}
                  </TableCell>
                  <TableCell>
                    {entry.paid ? (
                      t('Pages.Event.EntriesManage.Paid.Yes')
                    ) : (
                      <span className="font-medium text-destructive">
                        {t('Pages.Event.EntriesManage.Paid.No')}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{formatDateTime(entry.createdAt)}</TableCell>
                  <TableCell>
                    <Badge variant={badge.variant} className={badge.className}>
                      {t(`Pages.Event.EntriesManage.Status.${entry.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0"
                          disabled={isPending}
                          aria-label={t(
                            'Pages.Event.EntriesManage.Actions.Menu'
                          )}
                        >
                          {isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MoreHorizontal className="h-4 w-4" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {entry.status !== 'REJECTED' &&
                          entry.status !== 'CANCELLED' && (
                            <DropdownMenuItem
                              onSelect={() =>
                                void handlePaidChange(entry.id, !entry.paid)
                              }
                            >
                              {t(
                                entry.paid
                                  ? 'Pages.Event.EntriesManage.Actions.UnmarkPaid'
                                  : 'Pages.Event.EntriesManage.Actions.MarkPaid'
                              )}
                            </DropdownMenuItem>
                          )}
                        {entry.status === 'RECEIVED' && (
                          <DropdownMenuItem
                            disabled={hasMissingCard}
                            className={
                              hasMissingCard
                                ? 'flex-col items-start gap-0.5 whitespace-normal py-2 text-amber-800 opacity-100 focus:bg-amber-50 focus:text-amber-900 dark:text-amber-400 dark:focus:bg-amber-500/10 dark:focus:text-amber-300'
                                : undefined
                            }
                            onSelect={() =>
                              void handleStatusChange(entry.id, 'APPROVED')
                            }
                          >
                            <span className="flex items-center gap-1.5 font-medium">
                              {hasMissingCard && (
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                              )}
                              {t('Pages.Event.EntriesManage.Actions.Approve')}
                            </span>
                            {hasMissingCard && (
                              <span className="max-w-[10rem] text-xs font-normal leading-snug text-amber-700 dark:text-amber-400/80">
                                {t(
                                  'Pages.Event.EntriesManage.Actions.ApproveBlockedByMissingCard'
                                )}
                              </span>
                            )}
                          </DropdownMenuItem>
                        )}
                        {entry.status === 'APPROVED' && (
                          <DropdownMenuItem
                            onSelect={() => void handleProcess(entry.id)}
                          >
                            {t('Pages.Event.EntriesManage.Actions.Process')}
                          </DropdownMenuItem>
                        )}
                        {(entry.status === 'RECEIVED' || entry.status === 'APPROVED') && (
                          <>
                            <DropdownMenuItem
                              onSelect={() =>
                                setConfirmAction({
                                  entryId: entry.id,
                                  status: 'REJECTED',
                                })
                              }
                            >
                              {t('Pages.Event.EntriesManage.Actions.Reject')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:bg-destructive/10 focus:text-destructive dark:focus:bg-destructive/20"
                              onSelect={() =>
                                setConfirmAction({
                                  entryId: entry.id,
                                  status: 'CANCELLED',
                                })
                              }
                            >
                              {t('Pages.Event.EntriesManage.Actions.Cancel')}
                            </DropdownMenuItem>
                          </>
                        )}
                        {canEdit && (
                          <DropdownMenuItem asChild>
                            <Link
                              to="/events/$eventId/entries/$entryId/edit"
                              params={{ eventId, entryId: entry.id }}
                            >
                              {t('Pages.Event.EntriesManage.Actions.Edit')}
                            </Link>
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow
                    key={`${entry.id}-items`}
                    className="bg-muted/40 hover:bg-muted/40"
                  >
                    <TableCell colSpan={TABLE_COLUMN_COUNT} className="p-0">
                      <div className="px-4 py-3 pl-12">
                        <EntryItemsTable
                          items={entry.items}
                          currency={entry.currency}
                          eventId={eventId}
                          entryStatus={entry.status}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          }}
        />
      </section>

      <ConfirmDialog
        open={confirmAction !== null}
        onOpenChange={open => {
          if (!open) setConfirmAction(null);
        }}
        variant="destructive"
        title={t(
          confirmAction?.status === 'REJECTED'
            ? 'Pages.Event.EntriesManage.RejectDialog.ConfirmTitle'
            : 'Pages.Event.EntriesManage.CancelDialog.ConfirmTitle'
        )}
        description={t(
          confirmAction?.status === 'REJECTED'
            ? 'Pages.Event.EntriesManage.RejectDialog.ConfirmDescription'
            : 'Pages.Event.EntriesManage.CancelDialog.ConfirmDescription'
        )}
        confirmText={t(
          confirmAction?.status === 'REJECTED'
            ? 'Pages.Event.EntriesManage.RejectDialog.ConfirmButton'
            : 'Pages.Event.EntriesManage.CancelDialog.ConfirmButton'
        )}
        cancelText={t('Operations.Cancel', { ns: 'common' })}
        onConfirm={() => {
          if (!confirmAction) return;
          const { entryId, status } = confirmAction;
          setConfirmAction(null);
          void handleStatusChange(entryId, status);
        }}
      />
    </MainPageLayout>
  );
}
