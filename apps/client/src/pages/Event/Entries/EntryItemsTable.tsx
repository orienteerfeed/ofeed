import { useMutation, useQuery } from '@apollo/client/react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/atoms';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateTime } from '@/lib/date';
import { cn } from '@/lib/utils';
import { toast } from '@/utils';
import type { EntryItemActionKey, EntryStatus } from '@repo/shared';

import { formatEntryFee } from './EntryClassCard';
import {
  ASSIGN_ENTRY_ITEM_RENTAL_CARD,
  ENTRY_ITEMS_RENTAL_CARD_OPTIONS,
  type AssignEntryItemRentalCardResponse,
  type AssignEntryItemRentalCardVariables,
  type AvailableRentalCard,
  type EntryItemsRentalCardOptionsData,
  type EntryItemsRentalCardOptionsVariables,
  type EntryOrderItemRow,
} from './entryOrders.gql';

function getEntryItemActionBadgeVariant(actionKey: EntryItemActionKey): {
  variant: 'secondary' | 'outline';
} {
  return actionKey === 'NEW_ENTRY'
    ? { variant: 'secondary' }
    : { variant: 'outline' };
}

/** Renders the previous value struck through next to a changed field's current value. */
function PreviousValueHint({ value }: { value: string | null | undefined }) {
  if (!value) return null;
  return (
    <span className="ml-1.5 text-xs text-muted-foreground line-through decoration-muted-foreground/60">
      {value}
    </span>
  );
}

interface EntryItemsTableProps {
  items: EntryOrderItemRow[];
  currency: string;
  eventId: string;
  entryStatus: EntryStatus;
  canManageRentalCards?: boolean;
}

const TERMINAL_ENTRY_STATUSES = new Set<EntryStatus>([
  'PROCESSED',
  'REJECTED',
  'CANCELLED',
]);

/** Whether the caller can assign/reassign a rental chip on this item — it requested one, hasn't been processed into a Competitor yet, and the order isn't in a terminal state. */
function canManageRentalCard(
  item: EntryOrderItemRow,
  entryStatus: EntryStatus
): boolean {
  return (
    item.cardRental &&
    item.competitorId === null &&
    !TERMINAL_ENTRY_STATUSES.has(entryStatus)
  );
}

/** Free rental cards for this event, plus the item's own current card (if any) so the select can show it as selected. */
function getRentalCardOptions(
  allCards: AvailableRentalCard[],
  currentCardNumber: number | null
): AvailableRentalCard[] {
  const free = allCards.filter(
    card => card.active && !card.returned && !card.isLent
  );
  if (
    currentCardNumber === null ||
    free.some(card => card.cardNumber === currentCardNumber)
  ) {
    return free;
  }
  const current = allCards.find(card => card.cardNumber === currentCardNumber);
  return current ? [current, ...free] : free;
}

/** Competitor line items of an entry order — shared by the orders list' expandable row and the order detail page. */
export function EntryItemsTable({
  items,
  currency,
  eventId,
  entryStatus,
  canManageRentalCards = true,
}: EntryItemsTableProps) {
  const { t, i18n } = useTranslation();
  const anyItemManagesRentalCard =
    canManageRentalCards &&
    items.some(item => canManageRentalCard(item, entryStatus));

  const { data: rentalCardsData, refetch: refetchRentalCards } = useQuery<
    EntryItemsRentalCardOptionsData,
    EntryItemsRentalCardOptionsVariables
  >(ENTRY_ITEMS_RENTAL_CARD_OPTIONS, {
    variables: { eventId },
    skip: !eventId || !anyItemManagesRentalCard,
  });

  const [assignRentalCard, { loading: isAssigning }] = useMutation<
    AssignEntryItemRentalCardResponse,
    AssignEntryItemRentalCardVariables
  >(ASSIGN_ENTRY_ITEM_RENTAL_CARD);

  const handleAssignRentalCard = async (
    entryItemId: number,
    cardNumber: string
  ) => {
    try {
      await assignRentalCard({
        variables: { entryItemId, cardNumber: Number.parseInt(cardNumber, 10) },
      });
      await refetchRentalCards();
    } catch (mutationError) {
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description:
          mutationError instanceof Error
            ? mutationError.message
            : t('Pages.Event.EntriesManage.ItemsTable.RentalCard.AssignError'),
        variant: 'error',
      });
    }
  };

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="h-8">
            {t('Pages.Event.EntriesManage.ItemsTable.Columns.Type')}
          </TableHead>
          <TableHead className="h-8">
            {t('Pages.Event.EntriesManage.ItemsTable.Columns.Name')}
          </TableHead>
          <TableHead className="h-8">
            {t('Pages.Event.EntriesManage.ItemsTable.Columns.Class')}
          </TableHead>
          <TableHead className="h-8">
            {t('Pages.Event.EntriesManage.ItemsTable.Columns.Registration')}
          </TableHead>
          <TableHead className="h-8">
            {t('Pages.Event.EntriesManage.ItemsTable.Columns.BirthYear')}
          </TableHead>
          <TableHead className="h-8">
            {t('Pages.Event.EntriesManage.ItemsTable.Columns.CardRental')}
          </TableHead>
          <TableHead className="h-8">
            {t('Pages.Event.EntriesManage.ItemsTable.Columns.Card')}
          </TableHead>
          <TableHead className="h-8">
            {t('Pages.Event.EntriesManage.ItemsTable.Columns.Start')}
          </TableHead>
          <TableHead className="h-8 text-right">
            {t('Pages.Event.EntriesManage.ItemsTable.Columns.Fee')}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map(item => {
          const actionBadge = getEntryItemActionBadgeVariant(item.actionKey);
          const previous = item.previousValue;

          return (
            <TableRow
              key={item.id}
              className={cn(
                'hover:bg-transparent',
                item.competitorId !== null && 'text-muted-foreground'
              )}
            >
              <TableCell className="py-1.5">
                <Badge variant={actionBadge.variant}>
                  {t(
                    `Pages.Event.EntriesManage.ItemsTable.ActionLabels.${item.actionKey}`
                  )}
                </Badge>
              </TableCell>
              <TableCell className="py-1.5">
                {item.firstname} {item.lastname}
                {item.note ? (
                  <p className="mt-1 max-w-xs whitespace-pre-wrap text-xs text-muted-foreground">
                    {item.note}
                  </p>
                ) : null}
                <PreviousValueHint
                  value={
                    previous?.firstname || previous?.lastname
                      ? `${previous.firstname ?? item.firstname} ${previous.lastname ?? item.lastname}`
                      : null
                  }
                />
              </TableCell>
              <TableCell className="py-1.5">
                {item.class.name}
                <PreviousValueHint value={previous?.className} />
              </TableCell>
              <TableCell className="py-1.5">
                {item.registration ?? '—'}
              </TableCell>
              <TableCell className="py-1.5">{item.birthYear ?? '—'}</TableCell>
              <TableCell className="py-1.5">
                {item.cardRental ? (
                  <Badge className="border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                    {t('Pages.Event.EntriesManage.ItemsTable.CardRentalYes')}
                  </Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {t('Pages.Event.EntriesManage.ItemsTable.CardRentalNo')}
                  </span>
                )}
              </TableCell>
              <TableCell className="py-1.5">
                {canManageRentalCards &&
                canManageRentalCard(item, entryStatus) ? (
                  (() => {
                    const rentalCardOptions = getRentalCardOptions(
                      rentalCardsData?.eventRentalCards ?? [],
                      item.card
                    );
                    return (
                      <Select
                        disabled={isAssigning}
                        {...(item.card !== null
                          ? { value: String(item.card) }
                          : {})}
                        onValueChange={value =>
                          void handleAssignRentalCard(item.id, value)
                        }
                      >
                        <SelectTrigger className="h-8 w-36">
                          <SelectValue
                            placeholder={t(
                              'Pages.Event.EntriesManage.ItemsTable.RentalCard.Placeholder'
                            )}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {rentalCardOptions.length === 0 ? (
                            <div className="px-2 py-1.5 text-sm text-muted-foreground">
                              {t(
                                'Pages.Event.EntriesManage.ItemsTable.RentalCard.NoneAvailable'
                              )}
                            </div>
                          ) : (
                            rentalCardOptions.map(card => (
                              <SelectItem
                                key={card.id}
                                value={String(card.cardNumber)}
                              >
                                {card.cardNumber}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    );
                  })()
                ) : (
                  <>
                    {item.card ?? '—'}
                    <PreviousValueHint
                      value={
                        previous?.card !== null && previous?.card !== undefined
                          ? String(previous.card)
                          : null
                      }
                    />
                  </>
                )}
              </TableCell>
              <TableCell className="py-1.5">
                {item.startTime ? formatDateTime(item.startTime) : '—'}
                <PreviousValueHint
                  value={
                    previous?.startTime
                      ? formatDateTime(previous.startTime)
                      : null
                  }
                />
              </TableCell>
              <TableCell className="py-1.5 text-right">
                {formatEntryFee(
                  item.fee + (item.cardRentalFee ?? 0),
                  currency,
                  i18n.language
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
