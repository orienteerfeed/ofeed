import { parse } from 'csv-parse/sync';

import type { AppPrismaClient } from '../../db/prisma-client.js';
import { NotFoundError, ValidationError } from '../../exceptions/index.js';
import { requireEventOwnerOrAdmin, type AuthzAuthContext } from '../../utils/authz.js';

export type EventRentalCard = {
  id: number;
  cardNumber: number;
  active: boolean;
  returned: boolean;
  isLent: boolean;
};

export type CreateEventRentalCardInput = {
  eventId: string;
  cardNumber: number;
  active?: boolean;
};

export type UpdateEventRentalCardInput = {
  eventId: string;
  id: number;
  active?: boolean;
  returned?: boolean;
};

export type UpdateEventRentalCardReturnedInput = {
  eventId: string;
  cardNumber: number;
  returned: boolean;
};

const RENTAL_CARD_LOCKING_ENTRY_STATUSES = ['RECEIVED', 'APPROVED'] as const;

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

function validateCardNumber(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ValidationError('Card number must be a positive integer.');
  }
  return value;
}

export async function loadLockedCardNumbers(
  prisma: AppPrismaClient,
  eventId: string,
): Promise<Set<number>> {
  const [competitorRows, entryItemRows] = await Promise.all([
    prisma.competitor.findMany({
      where: { card: { not: null }, class: { eventId } },
      select: { card: true },
    }),
    prisma.entryItem.findMany({
      where: {
        cardRental: true,
        card: { not: null },
        entry: { eventId, status: { in: [...RENTAL_CARD_LOCKING_ENTRY_STATUSES] } },
      },
      select: { card: true },
    }),
  ]);

  const locked = new Set<number>();
  for (const row of competitorRows) {
    if (row.card != null) locked.add(row.card);
  }
  for (const row of entryItemRows) {
    if (row.card != null) locked.add(row.card);
  }
  return locked;
}

export async function listEventRentalCards(
  prisma: AppPrismaClient,
  auth: AuthzAuthContext,
  eventId: string,
): Promise<EventRentalCard[]> {
  await requireEventOwnerOrAdmin(prisma, auth, eventId);

  const [rows, lockedCardNumbers] = await Promise.all([
    prisma.eventRentalCard.findMany({
      where: { eventId },
      orderBy: { cardNumber: 'asc' },
    }),
    loadLockedCardNumbers(prisma, eventId),
  ]);

  return rows.map((row) => ({
    id: row.id,
    cardNumber: row.cardNumber,
    active: row.active,
    returned: row.returned,
    isLent: lockedCardNumbers.has(row.cardNumber),
  }));
}

export async function createEventRentalCardForGraphQL(
  prisma: AppPrismaClient,
  auth: AuthzAuthContext,
  input: CreateEventRentalCardInput,
): Promise<EventRentalCard> {
  await requireEventOwnerOrAdmin(prisma, auth, input.eventId);

  const cardNumber = validateCardNumber(input.cardNumber);

  try {
    const created = await prisma.eventRentalCard.create({
      data: {
        eventId: input.eventId,
        cardNumber,
        active: input.active ?? true,
      },
    });

    return {
      id: created.id,
      cardNumber: created.cardNumber,
      active: created.active,
      returned: created.returned,
      isLent: false,
    };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ValidationError('Card number already exists for this event.');
    }
    throw error;
  }
}

async function requireOwnedRentalCard(prisma: AppPrismaClient, eventId: string, id: number) {
  const existing = await prisma.eventRentalCard.findUnique({
    where: { id },
    select: { eventId: true },
  });

  if (!existing || existing.eventId !== eventId) {
    throw new Error('Rental card not found');
  }
}

export async function updateEventRentalCardForGraphQL(
  prisma: AppPrismaClient,
  auth: AuthzAuthContext,
  input: UpdateEventRentalCardInput,
): Promise<EventRentalCard> {
  await requireEventOwnerOrAdmin(prisma, auth, input.eventId);
  await requireOwnedRentalCard(prisma, input.eventId, input.id);

  const updated = await prisma.eventRentalCard.update({
    where: { id: input.id },
    data: {
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.returned !== undefined ? { returned: input.returned } : {}),
    },
  });

  const lockedCardNumbers = await loadLockedCardNumbers(prisma, input.eventId);

  return {
    id: updated.id,
    cardNumber: updated.cardNumber,
    active: updated.active,
    returned: updated.returned,
    isLent: lockedCardNumbers.has(updated.cardNumber),
  };
}

/** Update a rental card's returned flag using its event-scoped card number. */
export async function updateEventRentalCardReturned(
  prisma: AppPrismaClient,
  auth: AuthzAuthContext,
  input: UpdateEventRentalCardReturnedInput,
): Promise<EventRentalCard> {
  await requireEventOwnerOrAdmin(prisma, auth, input.eventId);

  const cardNumber = validateCardNumber(input.cardNumber);
  const existing = await prisma.eventRentalCard.findUnique({
    where: { eventId_cardNumber: { eventId: input.eventId, cardNumber } },
    select: { id: true },
  });
  if (!existing) {
    throw new NotFoundError(`Rental card ${cardNumber} does not exist for this event.`);
  }

  const updated = await prisma.eventRentalCard.update({
    where: { id: existing.id },
    data: { returned: input.returned },
  });
  const lockedCardNumbers = await loadLockedCardNumbers(prisma, input.eventId);

  return {
    id: updated.id,
    cardNumber: updated.cardNumber,
    active: updated.active,
    returned: updated.returned,
    isLent: lockedCardNumbers.has(updated.cardNumber),
  };
}

export async function deleteEventRentalCardForGraphQL(
  prisma: AppPrismaClient,
  auth: AuthzAuthContext,
  eventId: string,
  id: number,
) {
  await requireEventOwnerOrAdmin(prisma, auth, eventId);
  await requireOwnedRentalCard(prisma, eventId, id);

  await prisma.eventRentalCard.delete({ where: { id } });

  return { message: 'Rental card deleted' };
}

export async function deleteAllEventRentalCardsForGraphQL(
  prisma: AppPrismaClient,
  auth: AuthzAuthContext,
  eventId: string,
) {
  await requireEventOwnerOrAdmin(prisma, auth, eventId);

  await prisma.eventRentalCard.deleteMany({ where: { eventId } });

  return { message: 'Rental cards deleted' };
}

type ParsedRentalCardRow = {
  cardNumber: number;
  active: boolean;
};

function parseRentalCardCsv(csvData: string): ParsedRentalCardRow[] {
  const records = parse(csvData, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  const seen = new Set<number>();
  const duplicates = new Set<number>();

  const rows = records.map((record, index) => {
    const rawCardNumber = record.cardNumber;
    if (!rawCardNumber) {
      throw new ValidationError(`Row ${index + 1}: "cardNumber" column is required.`);
    }

    const cardNumber = Number.parseInt(rawCardNumber, 10);
    if (!Number.isInteger(cardNumber) || cardNumber <= 0) {
      throw new ValidationError(`Row ${index + 1}: "${rawCardNumber}" is not a valid card number.`);
    }

    if (seen.has(cardNumber)) {
      duplicates.add(cardNumber);
    }
    seen.add(cardNumber);

    const rawActive = record.active?.trim().toLowerCase();
    const active = rawActive === undefined || rawActive === '' ? true : rawActive === 'true';

    return { cardNumber, active };
  });

  if (duplicates.size > 0) {
    throw new ValidationError(`Duplicate card numbers in file: ${[...duplicates].join(', ')}.`);
  }

  return rows;
}

export async function importEventRentalCardsFromCsv(
  prisma: AppPrismaClient,
  auth: AuthzAuthContext,
  eventId: string,
  csvData: string,
): Promise<{ imported: number }> {
  await requireEventOwnerOrAdmin(prisma, auth, eventId);

  const rows = parseRentalCardCsv(csvData);

  await prisma.$transaction(
    rows.map((row) =>
      prisma.eventRentalCard.upsert({
        where: { eventId_cardNumber: { eventId, cardNumber: row.cardNumber } },
        create: { eventId, cardNumber: row.cardNumber, active: row.active },
        update: { active: row.active },
      }),
    ),
  );

  return { imported: rows.length };
}
