import type { EntryStatus } from '@repo/shared';

export interface CsosUnifiedEntryItem {
  registration: string | null;
  className: string;
  card: number | null;
  lastname: string;
  firstname: string;
  license: string | null;
  note: string | null;
  cardRental: boolean;
}

export interface ProcessedEntryCsvItem {
  entryId: string;
  entryItemId: number;
  actionKey: string;
  className: string;
  registration: string | null;
  lastname: string;
  firstname: string;
  card: number | null;
  fee: number;
  cardRentalFee: number | null;
  orderTotalAmount: number;
  currency: string;
  paymentReference: string;
  paymentMethod: string | null;
  contactEmail: string;
}

const CSOS_FIELD_WIDTHS = {
  registration: 7,
  className: 9,
  card: 10,
  name: 25,
  license: 1,
} as const;

function normalizeExportValue(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, ' ') ?? '';
}

function fixedWidth(value: string, width: number): string {
  return value.slice(0, width).padEnd(width, ' ');
}

function hasRentalCardNote(note: string): boolean {
  return note
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
    .includes('zapujcit cip');
}

/**
 * Produces the fixed-width Czech Orienteering Federation unified entry format:
 * registration(7), space, class(9), two spaces, chip(10), space, name(25),
 * space, licence(1), space, note.
 */
export function formatCsosUnifiedEntryExport(
  items: CsosUnifiedEntryItem[]
): string {
  return items
    .map(item => {
      const note = normalizeExportValue(item.note);
      const exportNote =
        item.cardRental && !hasRentalCardNote(note)
          ? [note, 'zapůjčit čip'].filter(Boolean).join('; ')
          : note;
      const name =
        `${normalizeExportValue(item.lastname)} ${normalizeExportValue(item.firstname)}`.trim();

      return (
        fixedWidth(
          normalizeExportValue(item.registration).toUpperCase(),
          CSOS_FIELD_WIDTHS.registration
        ) +
        ' ' +
        fixedWidth(
          normalizeExportValue(item.className),
          CSOS_FIELD_WIDTHS.className
        ) +
        '  ' +
        fixedWidth(item.card?.toString() ?? '', CSOS_FIELD_WIDTHS.card) +
        ' ' +
        fixedWidth(name, CSOS_FIELD_WIDTHS.name) +
        ' ' +
        fixedWidth(
          normalizeExportValue(item.license).toUpperCase(),
          CSOS_FIELD_WIDTHS.license
        ) +
        ' ' +
        exportNote
      );
    })
    .join('\r\n');
}

function escapeCsvValue(value: string | number | null): string {
  const serialized = value === null ? '' : String(value);
  return /[";\r\n]/.test(serialized)
    ? `"${serialized.replaceAll('"', '""')}"`
    : serialized;
}

/** A semicolon-delimited, item-level export of processed entry orders. */
export function formatProcessedEntryItemsCsv(
  items: ProcessedEntryCsvItem[]
): string {
  const headers = [
    'entry_id',
    'entry_item_id',
    'item_type',
    'category',
    'registration',
    'lastname',
    'firstname',
    'card_number',
    'entry_fee',
    'card_rental_fee',
    'item_total',
    'entry_total',
    'currency',
    'variable_symbol',
    'constant_symbol',
    'payment_method',
    'contact_email',
  ];
  const rows = items.map(item => {
    const cardRentalFee = item.cardRentalFee ?? 0;
    return [
      item.entryId,
      item.entryItemId,
      item.actionKey,
      item.className,
      item.registration,
      item.lastname,
      item.firstname,
      item.card,
      item.fee.toFixed(2),
      cardRentalFee.toFixed(2),
      (item.fee + cardRentalFee).toFixed(2),
      item.orderTotalAmount.toFixed(2),
      item.currency,
      item.paymentReference,
      '0308',
      item.paymentMethod,
      item.contactEmail,
    ]
      .map(escapeCsvValue)
      .join(';');
  });

  return [headers.join(';'), ...rows].join('\r\n');
}

export function getEntryStatusBadgeVariant(status: EntryStatus): {
  variant: 'default' | 'secondary' | 'outline' | 'destructive';
  className?: string;
} {
  switch (status) {
    case 'RECEIVED':
      return { variant: 'secondary' };
    case 'APPROVED':
      return { variant: 'default' };
    case 'PROCESSED':
      return {
        variant: 'outline',
        className: 'border-green-600 text-green-700 dark:text-green-500',
      };
    case 'REJECTED':
      return { variant: 'destructive' };
    case 'CANCELLED':
      return {
        variant: 'outline',
        className: 'border-muted-foreground/40 text-muted-foreground',
      };
    default:
      return { variant: 'secondary' };
  }
}
