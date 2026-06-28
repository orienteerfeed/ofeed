import type { AppPrismaClient } from '../../db/prisma-client.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { resolveEffectiveStartMode } from '@repo/shared';

import { computeClassFee } from '../class/class.fee.js';
import { computeClassCapacity, type CapacityMode } from '../class/class.capacity.js';
import {
  SYSTEM_EVENT_SERVICE_KEYS,
  type EventServiceSystemKey,
} from '../event/event-services.service.js';

/**
 * A start slot vacancy is an empty start slot in a specific race category
 * (`Class`). It is uniquely identified by its `classId` + `startTime` pair, and
 * is automatically removed once a competitor occupies that slot (see
 * {@link deleteMatchingStartSlotVacancy}).
 */
export interface CreateStartSlotVacancyInput {
  classId: number;
  startTime: Date;
  bibNumber?: number | null;
}

export interface StartSlotVacancySlot {
  startTime: Date;
  bibNumber?: number | null;
}

export interface MatchingStartSlotVacancyInput {
  classId: number;
  startTime?: Date | null;
}

export interface EventStartSlotVacancyGroup {
  classId: number;
  className: string;
  vacancies: { id: number; startTime: Date; bibNumber: number | null }[];
}

/**
 * Create a single vacancy for a class at a specific start time. Relies on the
 * `[classId, startTime]` unique constraint to reject duplicates.
 */
export function createStartSlotVacancy(
  prisma: AppPrismaClient,
  input: CreateStartSlotVacancyInput,
) {
  return prisma.startSlotVacancy.create({
    data: { classId: input.classId, startTime: input.startTime, bibNumber: input.bibNumber ?? null },
  });
}

/**
 * Bulk-create vacancies for a single class. Uses `createMany` with
 * `skipDuplicates` so re-importing the same start list does not error on the
 * `[classId, startTime]` unique constraint.
 */
export function bulkCreateStartSlotVacancies(
  prisma: AppPrismaClient,
  classId: number,
  slots: StartSlotVacancySlot[],
) {
  if (slots.length === 0) {
    return Promise.resolve({ count: 0 });
  }

  return prisma.startSlotVacancy.createMany({
    data: slots.map(({ startTime, bibNumber }) => ({
      classId,
      startTime,
      bibNumber: bibNumber ?? null,
    })),
    skipDuplicates: true,
  });
}

/**
 * List all vacancies for a single class, ordered chronologically.
 */
export function listStartSlotVacanciesByClass(prisma: AppPrismaClient, classId: number) {
  return prisma.startSlotVacancy.findMany({
    where: { classId },
    orderBy: { startTime: 'asc' },
  });
}

/**
 * List vacancies for an entire event, grouped by class. Classes without any
 * vacancy are excluded from the result so the payload only carries actionable
 * empty slots.
 */
export async function listEventStartSlotVacanciesGroupedByClass(
  prisma: AppPrismaClient,
  eventId: string,
): Promise<EventStartSlotVacancyGroup[]> {
  const classes = await prisma.class.findMany({
    where: { eventId },
    select: {
      id: true,
      name: true,
      startSlotVacancies: {
        select: { id: true, startTime: true, bibNumber: true },
        orderBy: { startTime: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });

  return classes
    .filter((eventClass) => eventClass.startSlotVacancies.length > 0)
    .map((eventClass) => ({
      classId: eventClass.id,
      className: eventClass.name,
      vacancies: eventClass.startSlotVacancies,
    }));
}

/**
 * Delete a vacancy by its primary key.
 */
export function deleteStartSlotVacancy(prisma: AppPrismaClient, id: number) {
  return prisma.startSlotVacancy.delete({ where: { id } });
}

/**
 * Restore a vacancy after a competitor is removed from a StartList class.
 *
 * Intended to be called inside the same transaction as the competitor delete so
 * that the slot is freed atomically. Uses `skipDuplicates` so an already-present
 * vacancy (e.g. from a data-repair operation) is silently ignored.
 *
 * - No-op when `startTime` is null.
 */
export async function restoreStartSlotVacancy(
  tx: Prisma.TransactionClient,
  input: CreateStartSlotVacancyInput,
): Promise<void> {
  if (!input.startTime) return;

  await tx.startSlotVacancy.createMany({
    data: [
      {
        classId: input.classId,
        startTime: input.startTime,
        bibNumber: input.bibNumber ?? null,
      },
    ],
    skipDuplicates: true,
  });
}

/**
 * Delete the vacancy (if any) that matches a competitor's class + start time.
 *
 * Intended to be called inside the same transaction as the competitor
 * create/update, so the slot is freed up atomically with the competitor write.
 *
 * - No-op when the competitor has no `startTime`.
 * - Scoped to the given `classId`, so a vacancy with the same start time in a
 *   different class is never touched.
 * - Matches the stored `DateTime` value exactly.
 */
export async function deleteMatchingStartSlotVacancy(
  tx: Prisma.TransactionClient,
  input: MatchingStartSlotVacancyInput,
): Promise<void> {
  if (!input.startTime) return;

  await tx.startSlotVacancy.deleteMany({
    where: {
      classId: input.classId,
      startTime: input.startTime,
    },
  });
}

export interface EntryAvailabilitySlot {
  id: number;
  startTime: Date;
  bibNumber: number | null;
}

export interface EntryAvailabilityFee {
  /** Effective price the competitor pays (after any late-entry surcharge). */
  amount: number;
  /** Net price (excl. VAT). Equals `amount` for non-VAT-payer events. */
  net: number;
  /** VAT component. Zero for non-VAT-payer events. */
  vat: number;
}

export interface EntryAvailabilityClass {
  id: number;
  name: string;
  sex: string;
  minAge: number | null;
  maxAge: number | null;
  /** Effective registration cap: min(dbMax, vacancyCount) for StartSlot, dbMax for FreeStart; 0 when unconfigured. */
  maxNumberOfCompetitors: number;
  competitorCount: number;
  startMode: string;
  /** null when no fee is configured for this class. */
  fee: EntryAvailabilityFee | null;
  availableCount: number;
  isFull: boolean;
  slots: EntryAvailabilitySlot[];
}

export interface EntryAvailabilityEntryAction {
  key: EventServiceSystemKey;
  enabled: boolean;
  price: number | null;
}

export interface EntryAvailabilityAddOn {
  id: number;
  enabled: boolean;
  name: string;
  description: string | null;
  price: number | null;
  maxQuantity: number | null;
}

export interface EventEntryAvailability {
  entriesOpenAt: Date | null;
  entriesCloseAt: Date | null;
  currency: { code: string; name: string };
  vatPayer: boolean;
  vatRate: number | null;
  defaultStartMode: string;
  entryActions: EntryAvailabilityEntryAction[];
  addOns: EntryAvailabilityAddOn[];
  classes: EntryAvailabilityClass[];
}

/**
 * Aggregate entry availability for an event: per-class capacity (vacant start
 * slots or FreeStart headroom) and computed entry fee. Returns null when the
 * event does not exist.
 *
 * Used by the public REST endpoint and the GraphQL query — both transports call
 * this function and get an identical data shape.
 */
export async function listEventEntryAvailability(
  prisma: AppPrismaClient,
  eventId: string,
): Promise<EventEntryAvailability | null> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      entriesOpenAt: true,
      entriesCloseAt: true,
      defaultStartMode: true,
      vatPayer: true,
      vatRate: true,
      lateEntryFeePercent: true,
      currency: { select: { iso4217Alpha3: true, name: true } },
      services: {
        select: {
          id: true,
          systemKey: true,
          active: true,
          name: true,
          description: true,
          price: true,
          maxQuantity: true,
        },
        orderBy: [{ systemKey: 'asc' }, { id: 'asc' }],
      },
      classes: {
        select: {
          id: true,
          name: true,
          sex: true,
          minAge: true,
          maxAge: true,
          maxNumberOfCompetitors: true,
          startMode: true,
          fee: true,
          lateEntryFeeDisabled: true,
          startSlotVacancies: {
            select: { id: true, startTime: true, bibNumber: true },
            orderBy: { startTime: 'asc' },
          },
          _count: { select: { competitors: true } },
        },
        orderBy: { name: 'asc' },
      },
    },
  });

  if (!event) return null;

  const now = new Date();
  const { entriesCloseAt, vatPayer, vatRate, lateEntryFeePercent } = event;
  const systemServicesByKey = new Map(
    event.services
      .filter((service) => service.systemKey !== null)
      .map((service) => [service.systemKey as EventServiceSystemKey, service]),
  );

  const classes: EntryAvailabilityClass[] = event.classes.map((eventClass) => {
    const effectiveStartMode = resolveEffectiveStartMode(
      eventClass.startMode,
      event.defaultStartMode,
    );
    const competitorCount = eventClass._count.competitors;
    const vacancyCount = eventClass.startSlotVacancies.length;

    const { currentFee, feeNet, feeVat } = computeClassFee({
      baseFee: eventClass.fee?.toNumber() ?? null,
      now,
      entriesCloseAt,
      lateEntryFeePercent: lateEntryFeePercent?.toNumber() ?? null,
      lateEntryFeeDisabled: eventClass.lateEntryFeeDisabled,
      vatPayer,
      vatRate: vatRate?.toNumber() ?? null,
    });

    const fee: EntryAvailabilityFee | null =
      currentFee !== null && feeNet !== null && feeVat !== null
        ? { amount: currentFee, net: feeNet, vat: feeVat }
        : null;

    const { availableCount, capacityMode, isFull } = computeClassCapacity({
      effectiveStartMode,
      maxNumberOfCompetitors: eventClass.maxNumberOfCompetitors,
      competitorCount,
      vacancyCount,
    });

    const effectiveMax =
      eventClass.maxNumberOfCompetitors === null
        ? 0
        : effectiveStartMode === 'FreeStart'
          ? eventClass.maxNumberOfCompetitors
          : Math.min(eventClass.maxNumberOfCompetitors, vacancyCount);

    return {
      id: eventClass.id,
      name: eventClass.name,
      sex: eventClass.sex as string,
      minAge: eventClass.minAge,
      maxAge: eventClass.maxAge,
      maxNumberOfCompetitors: effectiveMax,
      competitorCount,
      startMode: effectiveStartMode,
      fee,
      availableCount,
      isFull,
      slots: capacityMode === 'StartSlot' ? eventClass.startSlotVacancies : [],
    };
  });

  return {
    entriesOpenAt: event.entriesOpenAt,
    entriesCloseAt: event.entriesCloseAt,
    currency: { code: event.currency.iso4217Alpha3, name: event.currency.name },
    vatPayer: event.vatPayer,
    vatRate: event.vatRate?.toNumber() ?? null,
    defaultStartMode: event.defaultStartMode,
    entryActions: SYSTEM_EVENT_SERVICE_KEYS.map((systemKey) => {
      const service = systemServicesByKey.get(systemKey);
      return {
        key: systemKey,
        enabled: service?.active ?? false,
        price: service?.price?.toNumber() ?? null,
      };
    }),
    addOns: event.services
      .filter((service) => service.systemKey === null)
      .map((service) => ({
        id: service.id,
        enabled: service.active,
        name: service.name,
        description: service.description,
        price: service.price?.toNumber() ?? null,
        maxQuantity: service.maxQuantity,
      })),
    classes,
  };
}
