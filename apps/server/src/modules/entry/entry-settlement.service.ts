import {
  billingDetailsSchema,
  organizerDetailsSchema,
  formatCzechBankAccount,
  type BillingDetails,
  type OrganizerDetails,
} from '@repo/shared';
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import type { AppPrismaClient } from '../../db/prisma-client.js';
import { Prisma } from '../../generated/prisma/client.js';
import { ConflictError, NotFoundError } from '../../exceptions/index.js';
import { hasEntryOrderAccess } from './entry-public-access.js';
import { requireEventOwnerOrAdmin, type AuthzAuthContext } from '../../utils/authz.js';

type Amount = Prisma.Decimal;
export type SettlementData = {
  eventName: string;
  eventDate: string;
  generatedAt: string;
  organizer: OrganizerDetails;
  account: string | null;
  payer: BillingDetails | { name: string };
  paymentReference: string;
  currency: string;
  lines: Array<{ label: string; amount: Amount }>;
  total: Amount;
  transfer: Amount;
  cash: Amount;
  balance: Amount;
  undocumentedPaid: boolean;
};
const zero = () => new Prisma.Decimal(0);

type SettlementEntry = Prisma.EntryGetPayload<{
  include: {
    event: true;
    items: true;
    addOnItems: { include: { service: true } };
    payments: true;
  };
}>;

export function buildSettlementData(entry: SettlementEntry, now = new Date()): SettlementData {
  if (entry.status !== 'PROCESSED' || !entry.event.settlementEnabled) {
    throw new ConflictError(
      'Settlement is available only for processed entries with settlement enabled.',
    );
  }
  const organizer = organizerDetailsSchema.parse(entry.event.organizerDetails);
  const eventDate = new Intl.DateTimeFormat('cs-CZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: entry.event.timezone,
  }).format(entry.event.date);
  const entryFees = entry.items.reduce((sum, item) => sum.plus(item.fee), zero());
  const rentalFees = entry.items.reduce((sum, item) => sum.plus(item.cardRentalFee ?? 0), zero());
  const lines = [{ label: `Startovné ${eventDate}`, amount: entryFees }];
  if (!rentalFees.isZero()) lines.push({ label: 'Zapůjčení čipů', amount: rentalFees });
  for (const item of entry.addOnItems)
    lines.push({
      label: `${item.service.name} (${item.quantity} × ${item.price.toFixed(2)})`,
      amount: item.price.times(item.quantity),
    });
  if (entry.promoDiscountAmount && !entry.promoDiscountAmount.isZero())
    lines.push({ label: 'Sleva – promo kód', amount: entry.promoDiscountAmount.negated() });
  if (entry.priceAdjustment && !entry.priceAdjustment.isZero())
    lines.push({ label: 'Cenová korekce', amount: entry.priceAdjustment });
  const sum = lines.reduce((total, line) => total.plus(line.amount), zero());
  if (!sum.equals(entry.totalAmount))
    throw new ConflictError('Settlement line items do not match the order total.');
  if (entry.payments.some((payment) => payment.currency !== entry.currency))
    throw new ConflictError('Payment currency does not match the order.');
  const cash = entry.payments
    .filter((p) => p.method === 'CASH')
    .reduce((sum, p) => sum.plus(p.amount), zero());
  const transfer = entry.payments
    .filter((p) => p.method === 'QR')
    .reduce((sum, p) => sum.plus(p.amount), zero());
  return {
    eventName: entry.event.name,
    eventDate,
    generatedAt: new Intl.DateTimeFormat('cs-CZ', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: entry.event.timezone,
    }).format(now),
    organizer,
    account: entry.event.bankAccountIban
      ? formatCzechBankAccount(entry.event.bankAccountIban) ?? entry.event.bankAccountIban
      : null,
    payer:
      entry.payerDetails == null
        ? { name: `${entry.contactFirstname} ${entry.contactLastname}`.trim() }
        : billingDetailsSchema.parse(entry.payerDetails),
    paymentReference: entry.paymentReference,
    currency: entry.currency,
    lines,
    total: entry.totalAmount,
    transfer,
    cash,
    balance: entry.totalAmount.minus(transfer).minus(cash),
    undocumentedPaid: entry.paid && entry.payments.length === 0 && entry.totalAmount.greaterThan(0),
  };
}

export function renderSettlementPdf(data: SettlementData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      info: { Title: 'Vyúčtování vkladů a doplňkových služeb' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.registerFont(
      'regular',
      fileURLToPath(new URL('../../views/fonts/NotoSans-Regular.ttf', import.meta.url)),
    );
    doc.registerFont(
      'bold',
      fileURLToPath(new URL('../../views/fonts/NotoSans-Bold.ttf', import.meta.url)),
    );
    const text = (value: string, bold = false, size = 10) => {
      doc
        .font(bold ? 'bold' : 'regular')
        .fontSize(size)
        .text(value);
    };
    const heading = (value: string) => {
      doc.moveDown(0.7);
      text(value, true, 11);
    };
    const party = (value: BillingDetails | { name: string }) => {
      text(value.name);
      if ('street' in value) {
        text(`${value.street}, ${value.city}, ${value.postalCode}`);
        text(
          /^[A-Z]{2}$/.test(value.country)
            ? new Intl.DisplayNames(['cs'], { type: 'region' }).of(value.country) ?? value.country
            : value.country,
        );
        if (value.companyId) text(`IČO: ${value.companyId}`);
        if (value.vatId) text(`DIČ: ${value.vatId}`);
      }
    };
    const money = (value: Amount) =>
      new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: data.currency }).format(
        value.toNumber(),
      );
    const row = (label: string, amount: Amount, bold = false) => {
      doc.font(bold ? 'bold' : 'regular').fontSize(10);
      const width = doc.page.width - 96;
      const height =
        Math.max(
          doc.heightOfString(label, { width: width - 145 }),
          doc.heightOfString(money(amount), { width: 135 }),
        ) + 10;
      if (doc.y + height > doc.page.height - 58) doc.addPage();
      const y = doc.y;
      doc.text(label, 48, y, { width: width - 145 });
      doc.text(money(amount), 48 + width - 135, y, { width: 135, align: 'right' });
      doc.x = 48;
      doc.y = y + height;
    };
    text('Vyúčtování vkladů a doplňkových služeb', true, 16);
    heading('Závod:');
    text(data.eventName);
    text(data.eventDate);
    heading('Pořadatel:');
    party(data.organizer);
    if (data.account) text(`ČÚ: ${data.account}`);
    heading('Plátce:');
    party(data.payer);
    text(`VS: ${data.paymentReference}`);
    heading('Vklady:');
    for (const line of data.lines) row(line.label, line.amount);
    row('Poplatky za přihlášku celkem', data.total, true);
    row('Uhrazeno převodem / QR', data.transfer);
    row('Přijato v hotovosti', data.cash);
    row(
      data.balance.isNegative() ? 'Přeplatek k vrácení' : 'Zbývá uhradit',
      data.balance.abs(),
      true,
    );
    if (data.undocumentedPaid)
      text('Přihláška je označena jako zaplacená, ale úhrada není v evidenci doložena.');
    if (doc.y > doc.page.height - 155) doc.addPage();
    doc.moveDown(2);
    text(
      '..........................................................................................',
    );
    text(`${data.eventDate} ${data.organizer.name}`);
    doc.moveDown();
    text(`Vyúčtování vytvořeno: ${data.generatedAt}`, false, 8);
    doc.end();
  });
}

export async function generateEntrySettlement(
  prisma: AppPrismaClient,
  eventId: string,
  entryId: string,
) {
  const entry = await prisma.entry.findFirst({
    where: { id: entryId, eventId },
    include: {
      event: true,
      items: true,
      addOnItems: { include: { service: true } },
      payments: true,
    },
  });
  if (!entry) throw new NotFoundError('Entry order not found.');
  return {
    content: await renderSettlementPdf(buildSettlementData(entry)),
    filename: `vyuctovani-${entry.paymentReference}.pdf`,
  };
}

export async function downloadEntrySettlement(
  prisma: AppPrismaClient,
  auth: AuthzAuthContext,
  eventId: string,
  entryId: string,
  accessToken?: string,
) {
  if (!accessToken || !hasEntryOrderAccess(accessToken, entryId))
    await requireEventOwnerOrAdmin(prisma, auth, eventId);
  return generateEntrySettlement(prisma, eventId, entryId);
}
