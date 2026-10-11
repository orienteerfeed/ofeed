import { useMutation, useQuery } from '@apollo/client/react';
import { Link, useParams, useSearch } from '@tanstack/react-router';
import {
  BadgeCheck,
  Ban,
  Banknote,
  BanknoteX,
  Calendar,
  CircleX,
  Loader2,
  Pencil,
  Play,
  ReceiptText,
  Users,
  WalletCards,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { EntryStatus } from '@repo/shared';

import { Badge, Button } from '@/components/atoms';
import { BackLink, ConfirmDialog } from '@/components/molecules';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  formatDate,
  formatDateTime,
  formatDateTimeSeconds,
  getLocaleKey,
} from '@/lib/date';
import PATHNAMES from '@/lib/paths/pathnames';
import { MainPageLayout } from '@/templates/MainPageLayout';
import { toast } from '@/utils';

import { formatEntryFee } from './EntryClassCard';
import { EntryItemsTable } from './EntryItemsTable';
import { EntryPaymentSection } from './EntryPaymentSection';
import { getEntryStatusBadgeVariant } from './entries.utils';
import {
  ENTRY_ORDER_BY_ID,
  ENTRY_ORDER_PAID_UPDATE,
  ENTRY_ORDER_PROCESS,
  ENTRY_ORDER_STATUS_UPDATE,
  type EntryOrderPaidUpdateResponse,
  type EntryOrderPaidUpdateVariables,
  type EntryOrderByIdData,
  type EntryOrderByIdVariables,
  type EntryOrderProcessResponse,
  type EntryOrderProcessVariables,
  type EntryOrderStatusUpdateResponse,
  type EntryOrderStatusUpdateVariables,
} from './entryOrders.gql';

export function EventEntryOrderDetailPage() {
  const { t, i18n } = useTranslation();
  const { eventId, entryId } = useParams({
    from: '/events/$eventId/entries_/$entryId',
  });
  const { access } = useSearch({ from: '/events/$eventId/entries_/$entryId' });
  const hasSignedAccess = Boolean(access);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<
    'REJECTED' | 'CANCELLED' | null
  >(null);

  const [statusUpdate] = useMutation<
    EntryOrderStatusUpdateResponse,
    EntryOrderStatusUpdateVariables
  >(ENTRY_ORDER_STATUS_UPDATE);
  const [paidUpdate] = useMutation<
    EntryOrderPaidUpdateResponse,
    EntryOrderPaidUpdateVariables
  >(ENTRY_ORDER_PAID_UPDATE);
  const [processOrder] = useMutation<
    EntryOrderProcessResponse,
    EntryOrderProcessVariables
  >(ENTRY_ORDER_PROCESS);

  const { data, loading, error, refetch } = useQuery<
    EntryOrderByIdData,
    EntryOrderByIdVariables
  >(ENTRY_ORDER_BY_ID, {
    variables: { entryId, ...(access ? { accessToken: access } : {}) },
    skip: !entryId,
  });

  const entry = data?.entryOrderById ?? null;
  const backTo = hasSignedAccess
    ? PATHNAMES.eventDetail(eventId).url
    : `/events/${eventId}/entries`;

  if (loading) {
    return (
      <MainPageLayout t={t} pageName={t('Pages.Event.EntriesManage.Title')}>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainPageLayout>
    );
  }

  if (error || !entry) {
    return (
      <MainPageLayout t={t} pageName={t('Pages.Event.EntriesManage.Title')}>
        <section className="container mx-auto px-4 py-6">
          <BackLink to={backTo} className="mb-4" />
          <p className="text-sm text-muted-foreground">
            {t('Pages.Event.EntriesManage.Detail.NotFound')}
          </p>
        </section>
      </MainPageLayout>
    );
  }

  const badge = getEntryStatusBadgeVariant(entry.status);
  const localeKey = getLocaleKey(i18n.language);
  const addOnsTotal = entry.addOnItems.reduce(
    (sum, addOn) => sum + addOn.price * addOn.quantity,
    0
  );
  const itemsTotal = entry.totalAmount;
  const grandTotal = itemsTotal + addOnsTotal;
  const entryDetailPath = `/events/${eventId}/entries/${entryId}`;
  const entryDetailUrl =
    typeof window === 'undefined'
      ? entryDetailPath
      : new URL(entryDetailPath, window.location.origin).toString();
  const canEdit = !['PROCESSED', 'REJECTED', 'CANCELLED'].includes(
    entry.status
  );
  const hasMissingCard = entry.items.some(item => item.card === null);

  const runAction = async (
    action: string,
    run: () => Promise<unknown>,
    successMessage?: string
  ) => {
    setPendingAction(action);
    try {
      await run();
      await refetch();
      toast({
        title: t('Operations.Success', { ns: 'common' }),
        ...(successMessage ? { description: successMessage } : {}),
      });
    } catch (mutationError) {
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        ...(mutationError instanceof Error
          ? { description: mutationError.message }
          : {}),
        variant: 'error',
      });
    } finally {
      setPendingAction(null);
    }
  };

  const handleStatusChange = (status: EntryStatus) =>
    runAction(
      `status-${status}`,
      () => statusUpdate({ variables: { entryId, status } }),
      t('Pages.Event.EntriesManage.Toast.StatusUpdated')
    );

  const handlePaidChange = (paid: boolean) =>
    runAction(
      'paid',
      () => paidUpdate({ variables: { entryId, paid } }),
      t('Pages.Event.EntriesManage.Toast.PaidUpdated')
    );

  const handleProcess = () =>
    runAction(
      'process',
      () => processOrder({ variables: { entryId } }),
      t('Pages.Event.EntriesManage.Toast.Processed')
    );

  return (
    <MainPageLayout
      t={t}
      pageName={`${t('Pages.Event.EntriesManage.Detail.RegistrationTitle')} - ${entry.event.name}`}
    >
      <section className="container mx-auto px-4 py-6">
        <BackLink to={backTo} className="mb-4" />

        <div className="mb-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">
                {t('Pages.Event.EntriesManage.Detail.RegistrationTitle')}
              </p>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {entry.event.name}
              </h1>
            </div>

            {!hasSignedAccess && canEdit && (
              <TooltipProvider>
                <div
                  className="flex shrink-0 flex-wrap justify-end gap-1"
                  aria-label={t('Pages.Event.EntriesManage.Columns.Actions')}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="icon" asChild>
                        <Link
                          to="/events/$eventId/entries/$entryId/edit"
                          params={{ eventId, entryId }}
                          aria-label={t(
                            'Pages.Event.EntriesManage.Actions.Edit'
                          )}
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {t('Pages.Event.EntriesManage.Actions.Edit')}
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={pendingAction !== null}
                        aria-label={t(
                          entry.paid
                            ? 'Pages.Event.EntriesManage.Actions.UnmarkPaid'
                            : 'Pages.Event.EntriesManage.Actions.MarkPaid'
                        )}
                        onClick={() => void handlePaidChange(!entry.paid)}
                      >
                        {entry.paid ? (
                          <BanknoteX className="h-4 w-4" />
                        ) : (
                          <Banknote className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {t(
                        entry.paid
                          ? 'Pages.Event.EntriesManage.Actions.UnmarkPaid'
                          : 'Pages.Event.EntriesManage.Actions.MarkPaid'
                      )}
                    </TooltipContent>
                  </Tooltip>

                  {entry.status === 'RECEIVED' && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex">
                          <Button
                            size="icon"
                            disabled={pendingAction !== null || hasMissingCard}
                            aria-label={t(
                              'Pages.Event.EntriesManage.Actions.Approve'
                            )}
                            onClick={() => void handleStatusChange('APPROVED')}
                          >
                            <BadgeCheck className="h-4 w-4" />
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {hasMissingCard
                          ? t(
                              'Pages.Event.EntriesManage.Actions.ApproveBlockedByMissingCard'
                            )
                          : t('Pages.Event.EntriesManage.Actions.Approve')}
                      </TooltipContent>
                    </Tooltip>
                  )}

                  {entry.status === 'APPROVED' && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          disabled={pendingAction !== null}
                          aria-label={t(
                            'Pages.Event.EntriesManage.Actions.Process'
                          )}
                          onClick={() => void handleProcess()}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {t('Pages.Event.EntriesManage.Actions.Process')}
                      </TooltipContent>
                    </Tooltip>
                  )}

                  {(entry.status === 'RECEIVED' ||
                    entry.status === 'APPROVED') && (
                    <>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            disabled={pendingAction !== null}
                            aria-label={t(
                              'Pages.Event.EntriesManage.Actions.Reject'
                            )}
                            onClick={() => setConfirmAction('REJECTED')}
                          >
                            <Ban className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {t('Pages.Event.EntriesManage.Actions.Reject')}
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="destructive"
                            size="icon"
                            disabled={pendingAction !== null}
                            aria-label={t(
                              'Pages.Event.EntriesManage.Actions.Cancel'
                            )}
                            onClick={() => setConfirmAction('CANCELLED')}
                          >
                            <CircleX className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {t('Pages.Event.EntriesManage.Actions.Cancel')}
                        </TooltipContent>
                      </Tooltip>
                    </>
                  )}
                </div>
              </TooltipProvider>
            )}
          </div>

          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-start gap-2">
              <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('Pages.Event.Detail.Date')}
                </div>
                <div className="font-medium">
                  {formatDate(entry.event.date, localeKey)}
                </div>
              </div>
            </div>

            {entry.event.organizer && (
              <div className="flex items-start gap-2">
                <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('Pages.Event.Detail.Organizer')}
                  </div>
                  <div className="truncate font-medium">
                    {entry.event.organizer}
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-start gap-2">
              <ReceiptText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('Pages.Event.EntriesManage.Columns.PaymentReference')}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-semibold">
                    {entry.paymentReference}
                  </span>
                  <Badge variant={badge.variant} className={badge.className}>
                    {t(`Pages.Event.EntriesManage.Status.${entry.status}`)}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <WalletCards className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('Pages.Event.EntriesManage.Detail.PaymentMethod.Label')}
                </div>
                <Badge variant="outline" className="mt-1">
                  {entry.paymentMethod
                    ? t(
                        `Pages.Checkout.PaymentMethods.Methods.${entry.paymentMethod}`
                      )
                    : t(
                        'Pages.Event.EntriesManage.Detail.PaymentMethod.NotSpecified'
                      )}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>
                  {t('Pages.Event.EntriesManage.Detail.Contact.Title')}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1 text-sm">
                <span className="font-medium">
                  {entry.contactFirstname} {entry.contactLastname}
                </span>
                <span className="text-muted-foreground">
                  {t('Pages.Event.EntriesManage.Detail.Contact.Email')}:{' '}
                  {entry.contactEmail}
                </span>
                <span className="text-muted-foreground">
                  {t('Pages.Event.EntriesManage.Columns.Created')}:{' '}
                  {formatDateTimeSeconds(entry.createdAt, localeKey)}
                </span>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  {t('Pages.Event.EntriesManage.Detail.Items.Title')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <EntryItemsTable
                  items={entry.items}
                  currency={entry.currency}
                  eventId={eventId}
                  entryStatus={entry.status}
                  canManageRentalCards={!hasSignedAccess}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  {t('Pages.Event.EntriesManage.Detail.AddOns.Title')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {entry.addOnItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t('Pages.Event.EntriesManage.Detail.AddOns.Empty')}
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          {t(
                            'Pages.Event.EntriesManage.Detail.AddOns.Columns.Service'
                          )}
                        </TableHead>
                        <TableHead>
                          {t(
                            'Pages.Event.EntriesManage.Detail.AddOns.Columns.Quantity'
                          )}
                        </TableHead>
                        <TableHead className="text-right">
                          {t(
                            'Pages.Event.EntriesManage.Detail.AddOns.Columns.UnitPrice'
                          )}
                        </TableHead>
                        <TableHead className="text-right">
                          {t(
                            'Pages.Event.EntriesManage.Detail.AddOns.Columns.Total'
                          )}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entry.addOnItems.map(addOn => (
                        <TableRow key={addOn.id}>
                          <TableCell>
                            <div className="flex flex-col">
                              <span>{addOn.serviceName}</span>
                              {addOn.serviceDescription && (
                                <span className="text-xs text-muted-foreground">
                                  {addOn.serviceDescription}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{addOn.quantity}</TableCell>
                          <TableCell className="text-right">
                            {formatEntryFee(
                              addOn.price,
                              entry.currency,
                              i18n.language
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatEntryFee(
                              addOn.price * addOn.quantity,
                              entry.currency,
                              i18n.language
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {entry.paymentMethod !== 'CASH' ? (
              <EntryPaymentSection
                eventName={entry.event.name}
                paymentMethod={entry.paymentMethod}
                totalAmount={entry.totalAmount}
                currency={entry.currency}
                qrPayment={entry.qrPayment}
              />
            ) : null}
          </div>

          <div className="flex flex-col gap-6">
            <Card>
              <CardContent className="flex min-h-32 items-center justify-center p-4">
                <div className="rounded-md bg-white p-2">
                  <QRCodeCanvas
                    value={entryDetailUrl}
                    size={112}
                    level="M"
                    marginSize={1}
                    aria-label={t(
                      'Pages.Event.EntriesManage.Detail.QrCode.AriaLabel'
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  {t('Pages.Event.EntriesManage.Detail.Totals.Title')}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {t('Pages.Event.EntriesManage.Detail.Totals.ItemsSubtotal')}
                  </span>
                  <span>
                    {formatEntryFee(itemsTotal, entry.currency, i18n.language)}
                  </span>
                </div>
                {entry.addOnItems.length > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {t(
                        'Pages.Event.EntriesManage.Detail.Totals.AddOnsSubtotal'
                      )}
                    </span>
                    <span>
                      {formatEntryFee(
                        addOnsTotal,
                        entry.currency,
                        i18n.language
                      )}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t pt-2 font-semibold">
                  <span>
                    {t('Pages.Event.EntriesManage.Detail.Totals.GrandTotal')}
                  </span>
                  <span>
                    {formatEntryFee(grandTotal, entry.currency, i18n.language)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {entry.event.vatPayer
                    ? t('Pages.Event.EntriesManage.Detail.Totals.VatPayer', {
                        rate: entry.event.vatRate ?? 0,
                      })
                    : t('Pages.Event.EntriesManage.Detail.Totals.VatNotPayer')}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  {t('Pages.Event.EntriesManage.Detail.StatusHistory.Title')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {entry.statusHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t('Pages.Event.EntriesManage.Detail.StatusHistory.Empty')}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {entry.statusHistory.map(history => (
                      <li
                        key={history.id}
                        className="flex flex-col gap-0.5 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          {history.paymentState === null && history.status ? (
                            <Badge
                              variant={
                                getEntryStatusBadgeVariant(history.status)
                                  .variant
                              }
                              className={
                                getEntryStatusBadgeVariant(history.status)
                                  .className
                              }
                            >
                              {t(
                                `Pages.Event.EntriesManage.Status.${history.status}`
                              )}
                            </Badge>
                          ) : (
                            <Badge variant="outline">
                              {t(
                                history.paymentState
                                  ? 'Pages.Event.EntriesManage.Detail.StatusHistory.PaymentMarked'
                                  : 'Pages.Event.EntriesManage.Detail.StatusHistory.PaymentUnmarked'
                              )}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {formatDateTime(history.createdAt)}
                          </span>
                        </div>
                        {history.changedByName && (
                          <span className="text-xs text-muted-foreground">
                            {t(
                              'Pages.Event.EntriesManage.Detail.StatusHistory.ChangedBy',
                              { name: history.changedByName }
                            )}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
      <ConfirmDialog
        open={confirmAction !== null}
        onOpenChange={open => {
          if (!open) setConfirmAction(null);
        }}
        variant="destructive"
        title={t(
          confirmAction === 'REJECTED'
            ? 'Pages.Event.EntriesManage.RejectDialog.ConfirmTitle'
            : 'Pages.Event.EntriesManage.CancelDialog.ConfirmTitle'
        )}
        description={t(
          confirmAction === 'REJECTED'
            ? 'Pages.Event.EntriesManage.RejectDialog.ConfirmDescription'
            : 'Pages.Event.EntriesManage.CancelDialog.ConfirmDescription'
        )}
        confirmText={t(
          confirmAction === 'REJECTED'
            ? 'Pages.Event.EntriesManage.RejectDialog.ConfirmButton'
            : 'Pages.Event.EntriesManage.CancelDialog.ConfirmButton'
        )}
        cancelText={t('Operations.Cancel', { ns: 'common' })}
        onConfirm={() => {
          if (!confirmAction) return;
          const status = confirmAction;
          setConfirmAction(null);
          void handleStatusChange(status);
        }}
      />
    </MainPageLayout>
  );
}
