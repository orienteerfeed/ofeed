import crypto from 'node:crypto';

import {
  checkClassEligibility,
  createEntryOrderInputSchema,
  createQrPaymentInstruction,
  replacePaymentLinkVariables,
  resolveEffectiveStartMode,
  resolveEntryBirthYear,
  type CreateEntryOrderInput,
  type EntryItemActionKey,
  type EntryItemPreviousValue,
  type EntryOrderItemInput,
  type QrPaymentInstruction,
  type StartMode,
} from '@repo/shared';

import type { AppPrismaClient } from '../../db/prisma-client.js';
import { ConflictError, NotFoundError, ValidationError } from '../../exceptions/index.js';
import type { GraphQLAuthContext } from '../../graphql/context.types.js';
import type { EntryStatus } from '../../generated/prisma/enums.js';
import { requireEventOwnerOrAdmin } from '../../utils/authz.js';
import { isRelayDiscipline } from '../../utils/relay.js';
import { computeClassCapacity } from '../class/class.capacity.js';
import { computeClassFee } from '../class/class.fee.js';
import { storeCompetitor } from '../event/event.service.js';
import { loadLockedCardNumbers } from '../event/event-rental-cards.service.js';
import { availablePaymentMethodsForEvent } from '../event/event-payment-methods.service.js';
import { notifyEntryOrderProcessed, notifyEntryOrderReceived } from './entry.email.js';
import { createEntryOrderAccessToken } from './entry-public-access.js';

const ACTIVE_UNPROCESSED_ENTRY_STATUSES: EntryStatus[] = ['RECEIVED', 'APPROVED'];

function availableSlotStartTimes(
  slots: Array<{ startTime: Date }>,
  activeEntryItems: Array<{ startTime: Date | null }> = [],
): Date[] {
  const reservedStartTimes = new Set(
    activeEntryItems.flatMap((entryItem) =>
      entryItem.startTime === null ? [] : [entryItem.startTime.getTime()],
    ),
  );
  return slots
    .filter((slot) => !reservedStartTimes.has(slot.startTime.getTime()))
    .map((slot) => slot.startTime);
}

/** Class snapshot needed to validate and price a single entry order item. */
export interface EntryOrderClassInfo {
  id: number;
  name: string;
  minAge: number | null;
  maxAge: number | null;
  maxNumberOfCompetitors: number | null;
  startMode: StartMode | null;
  fee: number | null;
  lateEntryFeeDisabled: boolean;
  competitorCount: number;
  pendingEntryCount?: number;
  slotStartTimes: Date[];
}

/** Event-level pricing/validation context for an entry order. */
export interface EntryOrderPricingContext {
  now: Date;
  entriesCloseAt: Date | null;
  lateEntryFeePercent: number | null;
  vatPayer: boolean;
  vatRate: number | null;
  defaultStartMode: StartMode;
  cardRental: { enabled: boolean; price: number | null };
}

export interface PricedEntryOrderItem {
  classId: number;
  firstname: string;
  lastname: string;
  registration: string | null;
  birthYear: number | null;
  organisation: string | null;
  license: string | null;
  note: string | null;
  card: number | null;
  cardRental: boolean;
  startTime: Date | null;
  fee: number;
  cardRentalFee: number | null;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Validate and price entry order items against class snapshots. Pure — no DB
 * access — so the whole business rule set is directly unit-testable.
 *
 * Throws `ValidationError` for client mistakes (unknown class, ineligible
 * birth year, missing start time, unavailable card rental) and
 * `ConflictError` for capacity/slot collisions.
 */
export function priceEntryOrderItems(
  items: EntryOrderItemInput[],
  classes: EntryOrderClassInfo[],
  context: EntryOrderPricingContext,
): PricedEntryOrderItem[] {
  const classById = new Map(classes.map((cls) => [cls.id, cls]));
  const addedPerClass = new Map<number, number>();
  const usedSlotKeys = new Set<string>();
  const referenceYear = context.now.getFullYear();

  return items.map((item) => {
    const cls = classById.get(item.classId);
    if (!cls) {
      throw new ValidationError(`Class with ID ${item.classId} does not exist in this event.`);
    }

    const effectiveStartMode = resolveEffectiveStartMode(cls.startMode, context.defaultStartMode);

    // Capacity: account for items of the same class earlier in this order.
    const alreadyAdded = addedPerClass.get(cls.id) ?? 0;
    const { availableCount } = computeClassCapacity({
      effectiveStartMode,
      maxNumberOfCompetitors: cls.maxNumberOfCompetitors,
      competitorCount: cls.competitorCount,
      pendingEntryCount: cls.pendingEntryCount,
      vacancyCount: cls.slotStartTimes.length,
    });
    if (availableCount <= alreadyAdded) {
      throw new ConflictError(`Class ${cls.name} is full.`);
    }
    addedPerClass.set(cls.id, alreadyAdded + 1);

    // Age eligibility, derived from an explicit birth year or the registration.
    const birthYear = resolveEntryBirthYear(item, referenceYear);
    const eligibility = checkClassEligibility(birthYear, {
      birthYearFrom: cls.maxAge !== null ? referenceYear - cls.maxAge : null,
      birthYearTo: cls.minAge !== null ? referenceYear - cls.minAge : null,
    });
    if (!eligibility.eligible) {
      if (eligibility.reason === 'UNKNOWN_BIRTH_YEAR') {
        throw new ValidationError(
          `Class ${cls.name} is age-restricted; a valid birth year or registration is required.`,
        );
      }
      throw new ValidationError(`Birth year ${birthYear} is not allowed in class ${cls.name}.`);
    }

    // Start slot selection for slot-based start modes.
    let startTime: Date | null = null;
    if (effectiveStartMode !== 'FreeStart') {
      if (!item.startTime) {
        throw new ValidationError(`A start time selection is required for class ${cls.name}.`);
      }
      startTime = new Date(item.startTime);
      const requestedTime = startTime.getTime();
      if (!cls.slotStartTimes.some((slot) => slot.getTime() === requestedTime)) {
        throw new ConflictError(`The requested start time is not available in class ${cls.name}.`);
      }
      const slotKey = `${cls.id}:${requestedTime}`;
      if (usedSlotKeys.has(slotKey)) {
        throw new ConflictError(
          `The requested start time in class ${cls.name} is already taken by another entry in this order.`,
        );
      }
      usedSlotKeys.add(slotKey);
    }

    // Card rental must be an enabled event service; a null price means free.
    if (item.cardRental && !context.cardRental.enabled) {
      throw new ValidationError('Card rental is not available for this event.');
    }
    const cardRentalFee = item.cardRental ? context.cardRental.price ?? 0 : null;

    const { currentFee } = computeClassFee({
      baseFee: cls.fee,
      now: context.now,
      entriesCloseAt: context.entriesCloseAt,
      lateEntryFeePercent: context.lateEntryFeePercent,
      lateEntryFeeDisabled: cls.lateEntryFeeDisabled,
      vatPayer: context.vatPayer,
      vatRate: context.vatRate,
    });

    return {
      classId: cls.id,
      firstname: item.firstname,
      lastname: item.lastname,
      registration: item.registration ?? null,
      birthYear,
      organisation: item.organisation ?? null,
      license: item.license ?? null,
      note: item.note?.trim() || null,
      card: item.card ?? null,
      cardRental: item.cardRental,
      startTime,
      fee: currentFee ?? 0,
      cardRentalFee,
    };
  });
}

/** Sum of item fees and card rental fees, rounded to 2 decimals. */
export function computeEntryOrderTotal(items: PricedEntryOrderItem[]): number {
  return round2(items.reduce((total, item) => total + item.fee + (item.cardRentalFee ?? 0), 0));
}

/**
 * Variable symbol for payment pairing: `YY` + 8 random digits (10 digits
 * total). Uniqueness per event is enforced by the DB constraint; callers
 * retry on collision.
 */
export function generatePaymentReference(reference: Date): string {
  const twoDigitYear = String(reference.getFullYear() % 100).padStart(2, '0');
  const random = crypto.randomInt(0, 100_000_000).toString().padStart(8, '0');
  return `${twoDigitYear}${random}`;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

type EntryWithItems = {
  id: string;
  eventId: string;
  status: string;
  paid: boolean;
  paymentMethod: string | null;
  paymentReference: string;
  userId: number | null;
  contactEmail: string;
  contactFirstname: string;
  contactLastname: string;
  totalAmount: { toNumber(): number };
  currency: string;
  createdAt: Date;
  items: Array<{
    id: number;
    classId: number;
    class?: { name: string } | null;
    firstname: string;
    lastname: string;
    registration: string | null;
    birthYear: number | null;
    organisation: string | null;
    license: string | null;
    note: string | null;
    card: number | null;
    cardRental: boolean;
    startTime: Date | null;
    fee: { toNumber(): number };
    cardRentalFee: { toNumber(): number } | null;
    competitorId: number | null;
    actionKey: string;
    previousValue: unknown;
  }>;
};

/** Map a Prisma entry (Decimal fields) to a plain JSON-safe shape. */
export function serializeEntryOrder(entry: EntryWithItems) {
  return {
    id: entry.id,
    eventId: entry.eventId,
    status: entry.status,
    paid: entry.paid,
    paymentMethod: entry.paymentMethod,
    paymentReference: entry.paymentReference,
    userId: entry.userId,
    contactEmail: entry.contactEmail,
    contactFirstname: entry.contactFirstname,
    contactLastname: entry.contactLastname,
    totalAmount: entry.totalAmount.toNumber(),
    currency: entry.currency,
    createdAt: entry.createdAt,
    items: entry.items.map((item) => ({
      id: item.id,
      classId: item.classId,
      className: item.class?.name,
      firstname: item.firstname,
      lastname: item.lastname,
      registration: item.registration,
      birthYear: item.birthYear,
      organisation: item.organisation,
      license: item.license,
      note: item.note,
      card: item.card,
      cardRental: item.cardRental,
      startTime: item.startTime,
      fee: item.fee.toNumber(),
      cardRentalFee: item.cardRentalFee?.toNumber() ?? null,
      competitorId: item.competitorId,
      actionKey: item.actionKey as EntryItemActionKey,
      previousValue: item.previousValue as EntryItemPreviousValue | null,
    })),
  };
}

export type SerializedEntryOrder = ReturnType<typeof serializeEntryOrder>;

/** The public response returned directly after an order is created. */
export type CreatedEntryOrder = SerializedEntryOrder & {
  qrPayment?: QrPaymentInstruction;
  /** Present only for a custom payment-link order created in this response. */
  paymentUrl?: string;
  /** Read-only, time-limited access to the order detail without authentication. */
  detailAccessToken: string;
};

const entryInclude = {
  items: { include: { class: { select: { name: true } } } },
} as const;

export interface CreateEntryOrderContext {
  eventId: string;
  userId: number | null;
  now?: Date;
  /** Browser language used only for a custom payment provider's URL variable. */
  paymentLinkLanguage?: string;
}

function entryOrderAccessExpiresAt(eventDate: Date, now: Date): Date {
  const afterEvent = new Date(eventDate);
  afterEvent.setUTCDate(afterEvent.getUTCDate() + 30);

  const minimumExpiry = new Date(now);
  minimumExpiry.setUTCDate(minimumExpiry.getUTCDate() + 1);

  return afterEvent > minimumExpiry ? afterEvent : minimumExpiry;
}

function resolvePaymentLinkLanguage(value: string | undefined): string {
  const match = value?.trim().match(/^[A-Za-z]{2,8}/);
  return match ? match[0].toLowerCase() : 'cs';
}

/**
 * Create an entry order (Entry + EntryItems) for a non-relay event. Validates
 * the entry window, class capacity, age eligibility, start slot selection and
 * card rental availability; prices are computed server-side from the current
 * class fees. Competitors are NOT created here — that happens later in
 * {@link processEntryOrder} once the order is approved.
 */
export async function createEntryOrder(
  prisma: AppPrismaClient,
  context: CreateEntryOrderContext,
  input: CreateEntryOrderInput,
): Promise<CreatedEntryOrder> {
  const { eventId, userId } = context;
  const now = context.now ?? new Date();

  const classIds = [...new Set(input.items.map((item) => item.classId))];

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      name: true,
      date: true,
      timezone: true,
      location: true,
      author: { select: { email: true, firstname: true } },
      discipline: true,
      entriesOpenAt: true,
      entriesCloseAt: true,
      defaultStartMode: true,
      vatPayer: true,
      vatRate: true,
      lateEntryFeePercent: true,
      currency: { select: { iso4217Alpha3: true } },
      ofeedPaymentAvailable: true,
      bankAccountIban: true,
      bankAccountName: true,
      paymentMethods: {
        orderBy: { position: 'asc' },
        select: {
          type: true,
          enabled: true,
          position: true,
          displayName: true,
          paymentLinkTemplate: true,
        },
      },
      services: {
        where: { systemKey: 'CARD_RENTAL' },
        select: { active: true, price: true },
      },
      classes: {
        where: { id: { in: classIds } },
        select: {
          id: true,
          name: true,
          minAge: true,
          maxAge: true,
          maxNumberOfCompetitors: true,
          startMode: true,
          fee: true,
          lateEntryFeeDisabled: true,
          startSlotVacancies: { select: { startTime: true } },
          entryItems: {
            where: {
              competitorId: null,
              entry: { status: { in: ACTIVE_UNPROCESSED_ENTRY_STATUSES } },
            },
            select: { startTime: true },
          },
          _count: {
            select: {
              competitors: true,
              entryItems: {
                where: {
                  competitorId: null,
                  entry: { status: { in: ACTIVE_UNPROCESSED_ENTRY_STATUSES } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!event) {
    throw new NotFoundError(`Event with ID ${eventId} does not exist in the database`);
  }
  if (isRelayDiscipline(event.discipline)) {
    throw new ValidationError('Online entries are only available for non-relay events.');
  }

  const entriesConfigured = Boolean(event.entriesOpenAt || event.entriesCloseAt);
  if (!entriesConfigured) {
    throw new ConflictError('Entries are not configured for this event.');
  }
  if (event.entriesOpenAt && now < event.entriesOpenAt) {
    throw new ConflictError('Entries are not open yet.');
  }
  if (event.entriesCloseAt && now > event.entriesCloseAt) {
    throw new ConflictError('Entries are closed.');
  }

  const cardRentalService = event.services[0];
  const pricedItems = priceEntryOrderItems(
    input.items,
    event.classes.map((cls) => ({
      id: cls.id,
      name: cls.name,
      minAge: cls.minAge,
      maxAge: cls.maxAge,
      maxNumberOfCompetitors: cls.maxNumberOfCompetitors,
      startMode: cls.startMode,
      fee: cls.fee?.toNumber() ?? null,
      lateEntryFeeDisabled: cls.lateEntryFeeDisabled,
      competitorCount: cls._count.competitors,
      pendingEntryCount: cls._count.entryItems,
      slotStartTimes: availableSlotStartTimes(cls.startSlotVacancies, cls.entryItems ?? []),
    })),
    {
      now,
      entriesCloseAt: event.entriesCloseAt,
      lateEntryFeePercent: event.lateEntryFeePercent?.toNumber() ?? null,
      vatPayer: event.vatPayer,
      vatRate: event.vatRate?.toNumber() ?? null,
      defaultStartMode: event.defaultStartMode,
      cardRental: {
        enabled: cardRentalService?.active ?? false,
        price: cardRentalService?.price?.toNumber() ?? null,
      },
    },
  );

  const totalAmount = computeEntryOrderTotal(pricedItems);
  const currency = event.currency.iso4217Alpha3;

  const selectedPaymentMethod = availablePaymentMethodsForEvent({
    ...event,
    bankAccountName: null,
  }).find((method) => method.type === input.paymentMethod);
  if (!selectedPaymentMethod) {
    throw new ValidationError('The selected payment method is not available for this event.');
  }

  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const paymentReference = generatePaymentReference(now);
    try {
      const qrPayment =
        input.paymentMethod === 'QR_PAYMENT' && event.bankAccountIban
          ? createQrPaymentInstruction({
              bankAccountIban: event.bankAccountIban,
              bankAccountName: event.bankAccountName,
              amount: totalAmount,
              currency,
              paymentReference,
              message: `OFeed QR payment - ${input.contactLastname} ${input.contactFirstname}`,
            })
          : null;

      if (input.paymentMethod === 'QR_PAYMENT' && !qrPayment) {
        throw new ValidationError('QR Payment requires a bank account.');
      }

      const paymentUrl =
        input.paymentMethod === 'CUSTOM_PAYMENT_LINK'
          ? (() => {
              const template = event.paymentMethods.find(
                (method) => method.type === 'CUSTOM_PAYMENT_LINK',
              )?.paymentLinkTemplate;
              if (!template) {
                throw new ValidationError('Custom payment link is not available for this event.');
              }

              return replacePaymentLinkVariables(template, {
                amount: totalAmount.toFixed(2),
                currency,
                paymentReference,
                email: input.contactEmail,
                language: resolvePaymentLinkLanguage(context.paymentLinkLanguage),
              });
            })()
          : undefined;

      const entry = await prisma.entry.create({
        data: {
          eventId,
          status: 'RECEIVED',
          paymentMethod: input.paymentMethod,
          paymentReference,
          userId,
          contactEmail: input.contactEmail,
          contactFirstname: input.contactFirstname,
          contactLastname: input.contactLastname,
          totalAmount,
          currency,
          items: {
            create: pricedItems.map((item) => ({
              classId: item.classId,
              firstname: item.firstname,
              lastname: item.lastname,
              registration: item.registration,
              birthYear: item.birthYear,
              organisation: item.organisation,
              license: item.license,
              note: item.note,
              card: item.card,
              cardRental: item.cardRental,
              startTime: item.startTime,
              fee: item.fee,
              cardRentalFee: item.cardRentalFee,
            })),
          },
          statusHistory: {
            create: { status: 'RECEIVED', changedById: userId },
          },
        },
        include: entryInclude,
      });
      const serialized = serializeEntryOrder(entry);
      const detailAccessToken = createEntryOrderAccessToken(
        entry.id,
        entryOrderAccessExpiresAt(event.date, now),
      );
      // E-mail delivery is deliberately a non-blocking side effect: the persisted
      // entry remains valid even if Resend or template rendering is unavailable.
      void notifyEntryOrderReceived({ ...serialized, detailAccessToken }, event, {
        method: input.paymentMethod,
        paymentUrl,
        qrPayment,
      });
      const result: CreatedEntryOrder = {
        ...serialized,
        detailAccessToken,
        ...(paymentUrl ? { paymentUrl } : {}),
      };
      return qrPayment ? { ...result, qrPayment } : result;
    } catch (error) {
      if (isUniqueConstraintError(error) && attempt < maxAttempts) {
        continue;
      }
      throw error;
    }
  }

  // Unreachable: the loop either returns or rethrows on the last attempt.
  throw new ConflictError('Failed to generate a unique payment reference.');
}

/**
 * Public counters shown once entries are closed: submitted entry orders
 * (including requested changes) and changes recorded through OFeed
 * (protocol rows). Do not derive the first count from Competitor: it only
 * contains successfully propagated items and therefore is not an entry log.
 */
export async function getEventEntryStats(prisma: AppPrismaClient, eventId: string) {
  const [entriesCount, changesCount] = await Promise.all([
    prisma.entry.count({ where: { eventId } }),
    prisma.protocol.count({ where: { eventId } }),
  ]);
  return { entriesCount, changesCount };
}

/** Revalidates and reprices every mutable field of an existing order. */
export async function updateEntryOrderForGraphQL(
  prisma: AppPrismaClient,
  auth: GraphQLAuthContext,
  input: CreateEntryOrderInput & { entryId: string },
): Promise<void> {
  if (!createEntryOrderInputSchema.safeParse(input).success) {
    throw new ValidationError('The submitted entry order is invalid.');
  }
  const entry = await prisma.entry.findUnique({
    where: { id: input.entryId },
    select: { id: true, eventId: true, status: true },
  });
  if (!entry) throw new NotFoundError(`Entry order ${input.entryId} does not exist.`);
  await requireEventOwnerOrAdmin(prisma, auth, entry.eventId);
  if (TERMINAL_ENTRY_STATUSES.has(entry.status)) {
    throw new ConflictError('A terminal entry order can no longer be edited.');
  }

  const now = new Date();
  const classIds = [...new Set(input.items.map((item) => item.classId))];
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: entry.eventId },
    select: {
      id: true,
      entriesOpenAt: true,
      entriesCloseAt: true,
      defaultStartMode: true,
      vatPayer: true,
      vatRate: true,
      lateEntryFeePercent: true,
      currency: { select: { iso4217Alpha3: true } },
      ofeedPaymentAvailable: true,
      bankAccountIban: true,
      bankAccountName: true,
      paymentMethods: {
        orderBy: { position: 'asc' },
        select: {
          type: true,
          enabled: true,
          position: true,
          displayName: true,
          paymentLinkTemplate: true,
        },
      },
      services: { where: { systemKey: 'CARD_RENTAL' }, select: { active: true, price: true } },
      classes: {
        where: { id: { in: classIds } },
        select: {
          id: true,
          name: true,
          minAge: true,
          maxAge: true,
          maxNumberOfCompetitors: true,
          startMode: true,
          fee: true,
          lateEntryFeeDisabled: true,
          startSlotVacancies: { select: { startTime: true } },
          entryItems: {
            where: {
              competitorId: null,
              entryId: { not: entry.id },
              entry: { status: { in: ACTIVE_UNPROCESSED_ENTRY_STATUSES } },
            },
            select: { startTime: true },
          },
          _count: {
            select: {
              competitors: true,
              entryItems: {
                where: {
                  competitorId: null,
                  entryId: { not: entry.id },
                  entry: { status: { in: ACTIVE_UNPROCESSED_ENTRY_STATUSES } },
                },
              },
            },
          },
        },
      },
    },
  });
  // This mutation is restricted to an event owner or admin. Unlike public
  // order creation, staff must be able to correct an already submitted order
  // after the public entry window has closed.
  if (
    !availablePaymentMethodsForEvent({ ...event, bankAccountName: null }).some(
      (method) => method.type === input.paymentMethod,
    )
  ) {
    throw new ValidationError('The selected payment method is not available for this event.');
  }
  const cardRental = event.services[0];
  const items = priceEntryOrderItems(
    input.items,
    event.classes.map((cls) => ({
      id: cls.id,
      name: cls.name,
      minAge: cls.minAge,
      maxAge: cls.maxAge,
      maxNumberOfCompetitors: cls.maxNumberOfCompetitors,
      startMode: cls.startMode,
      fee: cls.fee?.toNumber() ?? null,
      lateEntryFeeDisabled: cls.lateEntryFeeDisabled,
      competitorCount: cls._count.competitors,
      pendingEntryCount: cls._count.entryItems,
      slotStartTimes: availableSlotStartTimes(cls.startSlotVacancies, cls.entryItems ?? []),
    })),
    {
      now,
      entriesCloseAt: event.entriesCloseAt,
      lateEntryFeePercent: event.lateEntryFeePercent?.toNumber() ?? null,
      vatPayer: event.vatPayer,
      vatRate: event.vatRate?.toNumber() ?? null,
      defaultStartMode: event.defaultStartMode,
      cardRental: {
        enabled: cardRental?.active ?? false,
        price: cardRental?.price?.toNumber() ?? null,
      },
    },
  );
  await prisma.entry.update({
    where: { id: input.entryId },
    data: {
      contactEmail: input.contactEmail,
      contactFirstname: input.contactFirstname,
      contactLastname: input.contactLastname,
      paymentMethod: input.paymentMethod,
      totalAmount: computeEntryOrderTotal(items),
      currency: event.currency.iso4217Alpha3,
      items: { deleteMany: {}, create: items },
    },
  });
}

/** List all entry orders of an event, newest first. */
export async function listEventEntryOrders(prisma: AppPrismaClient, eventId: string) {
  const entries = await prisma.entry.findMany({
    where: { eventId },
    include: entryInclude,
    orderBy: { createdAt: 'desc' },
  });
  return entries.map(serializeEntryOrder);
}

/** Terminal statuses: once reached, an entry order can no longer change status or be edited. */
const TERMINAL_ENTRY_STATUSES: ReadonlySet<EntryStatus> = new Set([
  'PROCESSED',
  'REJECTED',
  'CANCELLED',
]);
const RENTAL_CARD_RELEASING_STATUSES: ReadonlySet<EntryStatus> = new Set(['REJECTED', 'CANCELLED']);

export interface UpdateEntryOrderStatusInput {
  eventId: string;
  entryId: string;
  status: EntryStatus;
  /** User performing the change (organizer/admin, or the entry's own creator when cancelling); recorded on the status history entry. */
  changedById?: number | null;
}

/** Update the order lifecycle status. Payment is tracked separately on Entry.paid. */
export async function updateEntryOrderStatus(
  prisma: AppPrismaClient,
  input: UpdateEntryOrderStatusInput,
): Promise<SerializedEntryOrder> {
  if (input.status === 'PROCESSED') {
    throw new ValidationError('PROCESSED can only be reached via processEntryOrder.');
  }

  const entry = await prisma.entry.findFirst({
    where: { id: input.entryId, eventId: input.eventId },
    select: { id: true, status: true, items: { select: { card: true } } },
  });
  if (!entry) {
    throw new NotFoundError(`Entry order ${input.entryId} does not exist for this event.`);
  }
  if (TERMINAL_ENTRY_STATUSES.has(entry.status)) {
    throw new ConflictError('This entry order can no longer change status.');
  }

  if (input.status === 'APPROVED' && entry.items.some((item) => item.card === null)) {
    throw new ValidationError(
      'Cannot approve an entry order until every item has a card assigned.',
    );
  }

  const updated = await prisma.entry.update({
    where: { id: entry.id },
    data: {
      status: input.status,
      statusHistory: {
        create: { status: input.status, changedById: input.changedById ?? null },
      },
      ...(RENTAL_CARD_RELEASING_STATUSES.has(input.status)
        ? {
            // A rejected/cancelled order will not create a Competitor, so its
            // inventory reservation must be removed together with the status
            // transition. Keep cardRental true as the original request audit.
            items: {
              updateMany: {
                where: { cardRental: true, card: { not: null } },
                data: { card: null },
              },
            },
          }
        : {}),
    },
    include: entryInclude,
  });
  return serializeEntryOrder(updated);
}

export interface UpdateEntryOrderPaidInput {
  eventId: string;
  entryId: string;
  paid: boolean;
  /** Event owner/admin who recorded the payment change. */
  changedById?: number | null;
}

/** Update the payment flag without changing the lifecycle status, and append an audit entry. */
export async function updateEntryOrderPaid(
  prisma: AppPrismaClient,
  input: UpdateEntryOrderPaidInput,
): Promise<SerializedEntryOrder> {
  const entry = await prisma.entry.findFirst({
    where: { id: input.entryId, eventId: input.eventId },
    select: { id: true },
  });
  if (!entry) {
    throw new NotFoundError(`Entry order ${input.entryId} does not exist for this event.`);
  }

  const updated = await prisma.entry.update({
    where: { id: entry.id },
    data: {
      paid: input.paid,
      statusHistory: {
        create: {
          status: null,
          paymentState: input.paid,
          changedById: input.changedById ?? null,
        },
      },
    },
    include: entryInclude,
  });
  return serializeEntryOrder(updated);
}

export interface ProcessEntryOrderInput {
  eventId: string;
  entryId: string;
  /** Event owner/admin performing the processing; used as protocol author. */
  userId: number;
}

/**
 * Propagate an approved entry order into `Competitor` rows. Each item goes
 * through the standard `storeCompetitor` flow (capacity re-check, start slot
 * consumption, organisation upsert, protocol records). Items already linked
 * to a competitor are skipped, so a partially failed run can be retried.
 */
export async function processEntryOrder(
  prisma: AppPrismaClient,
  input: ProcessEntryOrderInput,
): Promise<SerializedEntryOrder> {
  const entry = await prisma.entry.findFirst({
    where: { id: input.entryId, eventId: input.eventId },
    include: {
      items: true,
      event: {
        select: {
          id: true,
          name: true,
          date: true,
          timezone: true,
          location: true,
          author: { select: { email: true, firstname: true } },
        },
      },
    },
  });
  if (!entry) {
    throw new NotFoundError(`Entry order ${input.entryId} does not exist for this event.`);
  }
  if (entry.status === 'PROCESSED') {
    throw new ConflictError('This entry order is already processed.');
  }
  if (entry.status !== 'APPROVED') {
    throw new ConflictError('Only approved entry orders can be processed.');
  }

  for (const item of entry.items) {
    if (item.competitorId !== null) {
      continue;
    }

    const stored = await storeCompetitor(
      input.eventId,
      {
        classId: item.classId,
        firstname: item.firstname,
        lastname: item.lastname,
        registration: item.registration ?? undefined,
        license: item.license ?? undefined,
        organisation: item.organisation ?? undefined,
        note: item.note ?? undefined,
        card: item.card ?? undefined,
        startTime: item.startTime ?? undefined,
      },
      input.userId,
      'IT',
    );

    await prisma.entryItem.update({
      where: { id: item.id },
      data: { competitorId: stored.competitor.id },
    });
  }

  const processed = await prisma.entry.update({
    where: { id: entry.id },
    data: {
      status: 'PROCESSED',
      statusHistory: {
        create: { status: 'PROCESSED', changedById: input.userId },
      },
    },
    include: entryInclude,
  });
  const serialized = serializeEntryOrder(processed);
  void notifyEntryOrderProcessed(
    {
      ...serialized,
      detailAccessToken: createEntryOrderAccessToken(
        entry.id,
        entryOrderAccessExpiresAt(entry.event.date, new Date()),
      ),
    },
    entry.event,
  );
  return serialized;
}

async function findEntryEventId(prisma: AppPrismaClient, entryId: string): Promise<string> {
  const entry = await prisma.entry.findUnique({
    where: { id: entryId },
    select: { eventId: true },
  });
  if (!entry) {
    throw new NotFoundError(`Entry order ${entryId} does not exist.`);
  }
  return entry.eventId;
}

export interface EntryOrderStatusUpdateForGraphQLInput {
  entryId: string;
  status: EntryStatus;
}

/**
 * GraphQL entry point for `updateEntryOrderStatus`: resolves the owning event
 * from the entry, authorises the caller (owner or admin), and rejects
 * PROCESSED — that transition is only reachable via `processEntryOrder`.
 *
 * Returns void by design: the GraphQL resolver re-fetches the entry itself
 * via `t.prismaField`'s `query` argument so the response honors whatever
 * fields/relations the client actually selected, with Decimal fields intact
 * for `EntryRef`'s field resolvers (unlike the REST-oriented
 * `SerializedEntryOrder` shape, which has already converted them to numbers).
 */
export async function entryOrderStatusUpdateForGraphQL(
  prisma: AppPrismaClient,
  auth: GraphQLAuthContext,
  input: EntryOrderStatusUpdateForGraphQLInput,
): Promise<void> {
  if (input.status === 'PROCESSED') {
    throw new ValidationError('PROCESSED can only be reached via entryOrderProcess.');
  }

  const entry = await prisma.entry.findUnique({
    where: { id: input.entryId },
    select: { eventId: true, userId: true },
  });
  if (!entry) {
    throw new NotFoundError(`Entry order ${input.entryId} does not exist.`);
  }

  // CANCELLED is primarily a self-service action: the entry's own creator
  // may cancel it directly. Every other transition (including a CANCELLED
  // request from anyone else) requires event owner/admin authorization.
  const isSelfCancel =
    input.status === 'CANCELLED' &&
    auth.isAuthenticated &&
    typeof auth.userId === 'number' &&
    entry.userId !== null &&
    auth.userId === entry.userId;

  const changedById = isSelfCancel
    ? entry.userId
    : (await requireEventOwnerOrAdmin(prisma, auth, entry.eventId)).userId;

  await updateEntryOrderStatus(prisma, {
    eventId: entry.eventId,
    entryId: input.entryId,
    status: input.status,
    changedById,
  });
}

export interface EntryOrderPaidUpdateForGraphQLInput {
  entryId: string;
  paid: boolean;
}

export async function entryOrderPaidUpdateForGraphQL(
  prisma: AppPrismaClient,
  auth: GraphQLAuthContext,
  input: EntryOrderPaidUpdateForGraphQLInput,
): Promise<void> {
  const entry = await prisma.entry.findUnique({
    where: { id: input.entryId },
    select: { eventId: true },
  });
  if (!entry) {
    throw new NotFoundError(`Entry order ${input.entryId} does not exist.`);
  }

  const { userId } = await requireEventOwnerOrAdmin(prisma, auth, entry.eventId);
  await updateEntryOrderPaid(prisma, {
    eventId: entry.eventId,
    entryId: input.entryId,
    paid: input.paid,
    changedById: userId,
  });
}

export interface EntryOrderProcessForGraphQLInput {
  entryId: string;
}

/**
 * GraphQL entry point for `processEntryOrder`: resolves the owning event,
 * authorises the caller, and uses the authz-resolved (DB-confirmed) userId as
 * the protocol author. Returns void — see {@link entryOrderStatusUpdateForGraphQL}.
 */
export async function entryOrderProcessForGraphQL(
  prisma: AppPrismaClient,
  auth: GraphQLAuthContext,
  input: EntryOrderProcessForGraphQLInput,
): Promise<void> {
  const eventId = await findEntryEventId(prisma, input.entryId);
  const { userId } = await requireEventOwnerOrAdmin(prisma, auth, eventId);

  await processEntryOrder(prisma, {
    eventId,
    entryId: input.entryId,
    userId,
  });
}

export interface AssignEntryItemRentalCardInput {
  entryItemId: number;
  cardNumber: number;
}

/**
 * Assigns (or reassigns) a physical rental chip number to an entry item
 * that requested chip rental. Validates the target card is part of the
 * event's rental inventory, active, not marked returned, and not already
 * locked by a `Competitor` or another pending `EntryItem` — see
 * `loadLockedCardNumbers` for the lock computation shared with the rental
 * inventory list. Reassigning away from a card frees it automatically,
 * since the lock is derived live from `EntryItem.card` rather than stored
 * separately.
 */
export async function assignEntryItemRentalCardForGraphQL(
  prisma: AppPrismaClient,
  auth: GraphQLAuthContext,
  input: AssignEntryItemRentalCardInput,
): Promise<{ entryId: string }> {
  const item = await prisma.entryItem.findUnique({
    where: { id: input.entryItemId },
    select: {
      card: true,
      cardRental: true,
      entry: { select: { id: true, eventId: true, status: true } },
    },
  });

  if (!item) {
    throw new NotFoundError(`Entry item ${input.entryItemId} does not exist.`);
  }

  await requireEventOwnerOrAdmin(prisma, auth, item.entry.eventId);

  if (!item.cardRental) {
    throw new ValidationError('This entry item did not request a rental chip.');
  }
  if (TERMINAL_ENTRY_STATUSES.has(item.entry.status)) {
    throw new ValidationError('Cannot assign a rental chip to this entry order anymore.');
  }

  if (item.card === input.cardNumber) {
    return { entryId: item.entry.id };
  }

  const rentalCard = await prisma.eventRentalCard.findUnique({
    where: {
      eventId_cardNumber: { eventId: item.entry.eventId, cardNumber: input.cardNumber },
    },
  });

  if (!rentalCard || !rentalCard.active || rentalCard.returned) {
    throw new ValidationError('This card is not available in the rental inventory.');
  }

  const lockedCardNumbers = await loadLockedCardNumbers(prisma, item.entry.eventId);
  if (lockedCardNumbers.has(input.cardNumber)) {
    throw new ValidationError('This card is already assigned to another competitor or entry.');
  }

  await prisma.entryItem.update({
    where: { id: input.entryItemId },
    data: { card: input.cardNumber },
  });

  return { entryId: item.entry.id };
}
