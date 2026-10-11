import { z } from 'zod';

import { dateLikeSchema, sexSchema, type Sex } from './common.js';
import { paymentMethodTypeSchema, qrPaymentInstructionSchema } from './payment-method.js';

export const entryStatusSchema = z.enum([
  'RECEIVED',
  'APPROVED',
  'PROCESSED',
  'REJECTED',
  'CANCELLED',
]);
export type EntryStatus = z.infer<typeof entryStatusSchema>;

/**
 * Czech-style registration number: 3-letter club code followed by 4 digits
 * where the first two digits encode the birth year (e.g. `CHC9501` -> 1995).
 */
export const registrationPattern = /^[A-Z]{3}\d{4}$/;

/**
 * Derive the birth year from a registration number. Returns null when the
 * registration does not match {@link registrationPattern}.
 *
 * The two-digit year is resolved against `referenceYear`: values greater than
 * the reference year's last two digits belong to the previous century
 * (`95` -> 1995, `01` -> 2001 for a 2026 reference year).
 */
/**
 * Resolve a 2-digit year against a reference year: values greater than the
 * reference year's last two digits belong to the previous century (`95` ->
 * 1995, `01` -> 2001 for a 2026 reference year). Shared by registration
 * decoding and by sources (e.g. ORIS) that report birth year as 2 digits
 * directly.
 */
export function resolveTwoDigitYear(twoDigitYear: number, referenceYear: number): number {
  const referenceTwoDigit = referenceYear % 100;
  const century =
    twoDigitYear > referenceTwoDigit
      ? referenceYear - referenceTwoDigit - 100
      : referenceYear - referenceTwoDigit;
  return century + twoDigitYear;
}

export function parseBirthYearFromRegistration(
  registration: string,
  referenceYear: number
): number | null {
  const normalized = registration.trim().toUpperCase();
  const match = registrationPattern.exec(normalized);
  if (!match) return null;

  const twoDigitYear = Number.parseInt(normalized.slice(3, 5), 10);
  return resolveTwoDigitYear(twoDigitYear, referenceYear);
}

/**
 * Derive sex from the registration sequence digits (Czech convention: 01-50
 * = male, 51-99 = female, 00 or malformed = unknown). Sources that report
 * gender directly (e.g. ORIS `Gender`) should prefer that value and use this
 * only as a fallback.
 */
export function parseSexFromRegistration(registration: string): Sex | null {
  const normalized = registration.trim().toUpperCase();
  const match = registrationPattern.exec(normalized);
  if (!match) return null;

  const sequence = Number.parseInt(normalized.slice(5, 7), 10);
  if (sequence >= 1 && sequence <= 50) return 'M';
  if (sequence >= 51 && sequence <= 99) return 'F';
  return null;
}

export interface ResolveBirthYearInput {
  birthYear?: number | null | undefined;
  registration?: string | null | undefined;
}

/**
 * Resolve the effective birth year of an entry: an explicit birth year wins,
 * otherwise it is derived from the registration number. Returns null when
 * neither source yields a year.
 */
export function resolveEntryBirthYear(
  input: ResolveBirthYearInput,
  referenceYear: number
): number | null {
  if (input.birthYear !== null && input.birthYear !== undefined) {
    return input.birthYear;
  }
  if (input.registration) {
    return parseBirthYearFromRegistration(input.registration, referenceYear);
  }
  return null;
}

export interface ClassBirthYearLimits {
  /** Oldest allowed birth year (inclusive), or null when unlimited. */
  birthYearFrom?: number | null | undefined;
  /** Youngest allowed birth year (inclusive), or null when unlimited. */
  birthYearTo?: number | null | undefined;
  /** Minimum allowed age (inclusive), or null when unlimited. */
  ageFrom?: number | null | undefined;
  /** Maximum allowed age (inclusive), or null when unlimited. */
  ageTo?: number | null | undefined;
  /** Year used to convert age limits into birth-year limits. */
  referenceYear?: number | null | undefined;
}

export type ClassEligibilityReason = 'UNKNOWN_BIRTH_YEAR' | 'TOO_OLD' | 'TOO_YOUNG';

export interface ClassEligibilityResult {
  eligible: boolean;
  reason?: ClassEligibilityReason;
}

/**
 * Check whether a competitor with the given birth year may start in a class
 * restricted by `birthYearFrom`/`birthYearTo`. A missing birth year only
 * fails when the class actually has an age restriction.
 */
export function checkClassEligibility(
  birthYear: number | null,
  limits: ClassBirthYearLimits
): ClassEligibilityResult {
  const referenceYear = limits.referenceYear ?? null;
  const from =
    limits.birthYearFrom ??
    (referenceYear !== null && limits.ageTo != null ? referenceYear - limits.ageTo : null);
  const to =
    limits.birthYearTo ??
    (referenceYear !== null && limits.ageFrom != null ? referenceYear - limits.ageFrom : null);

  if (from === null && to === null) {
    return { eligible: true };
  }
  if (birthYear === null) {
    return { eligible: false, reason: 'UNKNOWN_BIRTH_YEAR' };
  }
  if (from !== null && birthYear < from) {
    return { eligible: false, reason: 'TOO_OLD' };
  }
  if (to !== null && birthYear > to) {
    return { eligible: false, reason: 'TOO_YOUNG' };
  }
  return { eligible: true };
}

export const entryOrderItemInputSchema = z
  .object({
    classId: z.number().int().positive(),
    firstname: z.string().trim().min(1).max(191),
    lastname: z.string().trim().min(1).max(191),
    registration: z
      .string()
      .trim()
      .toUpperCase()
      .regex(registrationPattern, 'Invalid registration format.')
      .optional(),
    birthYear: z.number().int().min(1900).max(2100).optional(),
    organisation: z.string().trim().max(191).optional(),
    license: z.string().trim().toUpperCase().length(1).optional(),
    note: z.string().trim().max(191).optional(),
    card: z.number().int().positive().optional(),
    cardRental: z.boolean().default(false),
    /** Required for StartList classes; must match an available start slot. */
    startTime: z.string().datetime({ offset: true }).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.registration === undefined && value.birthYear === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Either registration or birthYear is required.',
        path: ['registration'],
      });
    }
    if (value.card === undefined && !value.cardRental) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Either card or cardRental is required.',
        path: ['card'],
      });
    }
  });

export type EntryOrderItemInput = z.infer<typeof entryOrderItemInputSchema>;

export const createEntryOrderInputSchema = z.object({
  contactEmail: z.string().trim().email().max(254),
  contactFirstname: z.string().trim().min(1).max(191),
  contactLastname: z.string().trim().min(1).max(191),
  paymentMethod: paymentMethodTypeSchema,
  items: z.array(entryOrderItemInputSchema).min(1).max(50),
});

export type CreateEntryOrderInput = z.infer<typeof createEntryOrderInputSchema>;

/**
 * What kind of request an entry item represents: a brand-new registration, or
 * a change requested against an already-submitted one. Distinct from
 * {@link entryActionKeySchema}, which prices *available* change services at
 * the event level — this tags what a specific `EntryItem` actually *is*.
 */
export const entryItemActionKeySchema = z.enum([
  'NEW_ENTRY',
  'CARD_CHANGE',
  'NAME_CHANGE',
  'CLASS_CHANGE',
  'START_TIME_CHANGE',
]);

export type EntryItemActionKey = z.infer<typeof entryItemActionKeySchema>;

/**
 * Snapshot of the field(s) an entry item's action replaced. Shape depends on
 * `actionKey` (e.g. only `card` is set for `CARD_CHANGE`); null for
 * `NEW_ENTRY`, which has nothing to compare against.
 */
export const entryItemPreviousValueSchema = z.object({
  card: z.number().int().nullable().optional(),
  startTime: dateLikeSchema.nullable().optional(),
  firstname: z.string().optional(),
  lastname: z.string().optional(),
  className: z.string().optional(),
});

export type EntryItemPreviousValue = z.infer<typeof entryItemPreviousValueSchema>;

export const entryOrderItemSchema = z.object({
  id: z.number().int(),
  classId: z.number().int(),
  className: z.string().optional(),
  firstname: z.string(),
  lastname: z.string(),
  registration: z.string().nullable(),
  birthYear: z.number().int().nullable(),
  organisation: z.string().nullable(),
  license: z.string().nullable(),
  note: z.string().nullable(),
  card: z.number().int().nullable(),
  cardRental: z.boolean(),
  startTime: dateLikeSchema.nullable(),
  fee: z.number(),
  cardRentalFee: z.number().nullable(),
  competitorId: z.number().int().nullable(),
  actionKey: entryItemActionKeySchema,
  previousValue: entryItemPreviousValueSchema.nullable(),
});

export type EntryOrderItem = z.infer<typeof entryOrderItemSchema>;

export const entryOrderSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  status: entryStatusSchema,
  paid: z.boolean(),
  paymentMethod: paymentMethodTypeSchema.nullable(),
  paymentReference: z.string(),
  userId: z.number().int().nullable(),
  contactEmail: z.string(),
  contactFirstname: z.string(),
  contactLastname: z.string(),
  totalAmount: z.number(),
  currency: z.string(),
  createdAt: dateLikeSchema,
  items: z.array(entryOrderItemSchema),
  /** Present only in the immediate create-order response for QR payments. */
  qrPayment: qrPaymentInstructionSchema.optional(),
  /** Present only in the immediate create-order response for a custom payment link. */
  paymentUrl: z.string().url().optional(),
  /** Present only in the immediate create-order response for cash payments. */
  detailAccessToken: z.string().min(1).optional(),
});

export type EntryOrder = z.infer<typeof entryOrderSchema>;

export const entryAvailabilitySlotSchema = z.object({
  id: z.number().int(),
  startTime: dateLikeSchema,
  bibNumber: z.number().int().nullable(),
});

export type EntryAvailabilitySlot = z.infer<typeof entryAvailabilitySlotSchema>;

export const entryAvailabilityFeeSchema = z.object({
  amount: z.number(),
  net: z.number(),
  vat: z.number(),
});

export const entryAvailabilityClassSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  sex: sexSchema,
  birthYearFrom: z.number().int().nullable(),
  birthYearTo: z.number().int().nullable(),
  maxNumberOfCompetitors: z.number().int(),
  competitorCount: z.number().int(),
  startMode: z.string(),
  fee: entryAvailabilityFeeSchema.nullable(),
  availableCount: z.number().int(),
  isFull: z.boolean(),
  slots: z.array(entryAvailabilitySlotSchema),
});

export type EntryAvailabilityClass = z.infer<typeof entryAvailabilityClassSchema>;

export const entryActionKeySchema = z.enum([
  'CARD_CHANGE',
  'NAME_CHANGE',
  'CLASS_CHANGE',
  'START_TIME_CHANGE',
  'ENTRY_CANCEL',
  'CARD_RENTAL',
]);

export type EntryActionKey = z.infer<typeof entryActionKeySchema>;

export const entryAvailabilityActionSchema = z.object({
  key: entryActionKeySchema,
  enabled: z.boolean(),
  price: z.number().nullable(),
});

export const eventEntryAvailabilitySchema = z.object({
  entriesOpenAt: dateLikeSchema.nullable(),
  entriesCloseAt: dateLikeSchema.nullable(),
  currency: z.object({ code: z.string(), name: z.string() }),
  vatPayer: z.boolean(),
  vatRate: z.number().nullable(),
  defaultStartMode: z.string(),
  entryActions: z.array(entryAvailabilityActionSchema),
  addOns: z.array(
    z.object({
      id: z.number().int(),
      enabled: z.boolean(),
      name: z.string(),
      description: z.string().nullable(),
      price: z.number().nullable(),
      maxQuantity: z.number().int().nullable(),
    })
  ),
  classes: z.array(entryAvailabilityClassSchema),
});

export type EventEntryAvailability = z.infer<typeof eventEntryAvailabilitySchema>;

export const eventEntryStatsSchema = z.object({
  entriesCount: z.number().int(),
  changesCount: z.number().int(),
});

export type EventEntryStats = z.infer<typeof eventEntryStatsSchema>;
