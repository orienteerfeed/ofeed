import ejs from 'ejs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

import type { PaymentMethodType, QrPaymentInstruction } from '@repo/shared';

import env from '../../config/env.js';
import { logger } from '../../lib/logging.js';
import { sendEmail } from '../../utils/email.js';

type EmailDetail = { label: string; value: string };

export type EntryEmailEvent = {
  id: string;
  name: string;
  date: Date;
  timezone: string;
  location: string | null;
  author: { email: string; firstname: string } | null;
};

export type EntryEmailOrder = {
  id: string;
  contactEmail: string;
  contactFirstname: string;
  contactLastname: string;
  paymentReference: string;
  totalAmount: number;
  currency: string;
  detailAccessToken: string;
  items: Array<{
    firstname: string;
    lastname: string;
    className: string | undefined;
  }>;
};

type EntryEmailTemplateInput = {
  emailTo: string;
  recipientName: string;
  subject: string;
  preheader: string;
  paragraphs: string[];
  details: EmailDetail[];
  payment?: EntryEmailPaymentSection;
  entryDetailUrl?: string;
};

type EntryEmailPaymentSection = {
  heading: string;
  paragraphs: string[];
  details: EmailDetail[];
  qrCodeDataUrl?: string;
  action?: { label: string; url: string };
};

export type EntryEmailPayment = {
  method: PaymentMethodType;
  paymentUrl?: string;
  qrPayment?: QrPaymentInstruction | null;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.join(__dirname, '../../views/emails/entry-notification.ejs');

function formatEventDate(event: EntryEmailEvent): string {
  return new Intl.DateTimeFormat('cs-CZ', {
    dateStyle: 'long',
    timeZone: event.timezone || 'Europe/Prague',
  }).format(event.date);
}

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency }).format(amount);
}

function formatParticipants(order: EntryEmailOrder): string {
  return order.items
    .map(
      (item) => `${item.firstname} ${item.lastname}${item.className ? ` (${item.className})` : ''}`,
    )
    .join(', ');
}

function orderDetails(order: EntryEmailOrder, event: EntryEmailEvent): EmailDetail[] {
  return [
    { label: 'Závod', value: event.name },
    { label: 'Datum', value: formatEventDate(event) },
    ...(event.location ? [{ label: 'Místo', value: event.location }] : []),
    { label: 'Přihlášení závodníci', value: formatParticipants(order) },
    { label: 'Variabilní symbol', value: order.paymentReference },
    { label: 'Celkem', value: formatAmount(order.totalAmount, order.currency) },
  ];
}

function entryDetailUrl(order: EntryEmailOrder, event: EntryEmailEvent): string {
  const url = new URL(env.CLIENT_APP_URL);
  const basePath = url.pathname.replace(/\/$/, '');
  url.pathname = `${basePath}/events/${encodeURIComponent(event.id)}/entries/${encodeURIComponent(
    order.id,
  )}`;
  url.search = new URLSearchParams({ access: order.detailAccessToken }).toString();
  url.hash = '';
  return url.toString();
}

function notificationText(input: Omit<EntryEmailTemplateInput, 'emailTo'>): string {
  return [
    `Ahoj ${input.recipientName},`,
    '',
    ...input.paragraphs,
    ...(input.payment
      ? [
          '',
          input.payment.heading,
          ...input.payment.paragraphs,
          ...input.payment.details.map((detail) => `${detail.label}: ${detail.value}`),
          ...(input.payment.action ? [input.payment.action.url] : []),
        ]
      : []),
    ...(input.entryDetailUrl ? ['', `Detail přihlášky: ${input.entryDetailUrl}`] : []),
    '',
    ...input.details.map((detail) => `${detail.label}: ${detail.value}`),
  ].join('\n');
}

async function paymentSection(payment: EntryEmailPayment): Promise<EntryEmailPaymentSection> {
  switch (payment.method) {
    case 'CUSTOM_PAYMENT_LINK':
      return {
        heading: 'Online platba',
        paragraphs: ['Pro dokončení platby přejděte na platební bránu pořadatele.'],
        details: [],
        ...(payment.paymentUrl
          ? { action: { label: 'Přejít k platbě', url: payment.paymentUrl } }
          : {}),
      };
    case 'QR_PAYMENT': {
      const qrPayment = payment.qrPayment;
      if (!qrPayment) {
        return {
          heading: 'QR platba',
          paragraphs: ['Platební údaje se nepodařilo připravit. Kontaktujte prosím pořadatele.'],
          details: [],
        };
      }

      let qrCodeDataUrl: string | undefined;
      try {
        qrCodeDataUrl = await QRCode.toDataURL(qrPayment.payload, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 208,
        });
      } catch (error) {
        logger.error('Failed to generate entry payment QR code', {
          action: 'entry-payment-qr-code',
          error,
        });
      }

      return {
        heading: 'QR platba',
        paragraphs: ['Naskenujte QR kód v bankovní aplikaci a platební příkaz se předvyplní.'],
        details: [
          ...(qrPayment.bankAccountName
            ? [{ label: 'Název účtu', value: qrPayment.bankAccountName }]
            : []),
          { label: 'IBAN', value: qrPayment.bankAccountIban },
          { label: 'Konstantní symbol', value: qrPayment.constantSymbol },
          { label: 'Zpráva pro příjemce', value: qrPayment.recipientMessage },
        ],
        ...(qrCodeDataUrl ? { qrCodeDataUrl } : {}),
        action: { label: 'Zaplatit v bankovní aplikaci', url: `spayd://${qrPayment.payload}` },
      };
    }
    case 'CASH':
      return {
        heading: 'Platba v hotovosti',
        paragraphs: ['Dostavte se prosím do event office a uhraďte startovné v hotovosti.'],
        details: [],
      };
    case 'OFEED_PAYMENT':
      return {
        heading: 'OFeed Platba',
        paragraphs: ['Platbu dokončete podle pokynů v aplikaci OFeed.'],
        details: [],
      };
  }
}

async function sendEntryEmail(input: EntryEmailTemplateInput): Promise<void> {
  try {
    const html = await ejs.renderFile(templatePath, {
      ...input,
      title: input.subject,
      payment: input.payment ?? null,
      entryDetailUrl: input.entryDetailUrl ?? null,
      year: new Date().getFullYear(),
    });
    await sendEmail({
      html,
      text: notificationText(input),
      subject: input.subject,
      emailTo: input.emailTo,
      onSuccess: () => logger.info('Entry notification email sent', { action: 'entry-email' }),
      onError: (error) =>
        logger.error('Failed to send entry notification email', { action: 'entry-email', error }),
    });
  } catch (error) {
    logger.error('Failed to render entry notification email', {
      action: 'entry-email-template',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Notify the entrant and the event owner after a cart order has been stored. */
export async function notifyEntryOrderReceived(
  order: EntryEmailOrder,
  event: EntryEmailEvent,
  payment: EntryEmailPayment,
): Promise<void> {
  const details = orderDetails(order, event);
  const entrantName = `${order.contactFirstname} ${order.contactLastname}`.trim();
  const paymentDetails = await paymentSection(payment);
  const detailUrl = entryDetailUrl(order, event);

  await sendEntryEmail({
    emailTo: order.contactEmail,
    recipientName: entrantName,
    subject: `OFeed – přihláška přijata: ${event.name}`,
    preheader: `Potvrzení o přijetí přihlášky na závod ${event.name}.`,
    paragraphs: [
      'Potvrzujeme přijetí vaší přihlášky. Pořadatel ji nyní zpracuje.',
      'Tento e-mail slouží jako potvrzení o přijetí objednávky.',
    ],
    details,
    payment: paymentDetails,
    entryDetailUrl: detailUrl,
  });

  if (!event.author) return;

  await sendEntryEmail({
    emailTo: event.author.email,
    recipientName: event.author.firstname,
    subject: `OFeed – nová přihláška: ${event.name}`,
    preheader: `Nová přihláška čeká na zpracování pro závod ${event.name}.`,
    paragraphs: [
      `Byla přijata nová přihláška od ${entrantName} (${order.contactEmail}).`,
      'Přihlášku můžete zpracovat ve správě přihlášek závodu.',
    ],
    details,
  });
}

/** Notify the entrant only after the order has been successfully processed. */
export async function notifyEntryOrderProcessed(
  order: EntryEmailOrder,
  event: EntryEmailEvent,
): Promise<void> {
  await sendEntryEmail({
    emailTo: order.contactEmail,
    recipientName: `${order.contactFirstname} ${order.contactLastname}`.trim(),
    subject: `OFeed – přihláška zpracována: ${event.name}`,
    preheader: `Vaše přihláška na závod ${event.name} byla zpracována.`,
    paragraphs: ['Vaše přihláška byla pořadatelem zpracována a závodníci byli zařazeni do závodu.'],
    details: orderDetails(order, event),
    entryDetailUrl: entryDetailUrl(order, event),
  });
}
