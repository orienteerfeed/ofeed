import type { AppPrismaClient } from '../../db/prisma-client.js';
import { ValidationError } from '../../exceptions/index.js';
import type { GraphQLAuthContext } from '../../graphql/context.types.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { requireEventOwnerOrAdmin } from '../../utils/authz.js';

export const SYSTEM_EVENT_SERVICE_KEYS = [
  'CARD_CHANGE',
  'NAME_CHANGE',
  'CLASS_CHANGE',
  'START_TIME_CHANGE',
  'ENTRY_CANCEL',
  'CARD_RENTAL',
] as const;

export type EventServiceSystemKey = (typeof SYSTEM_EVENT_SERVICE_KEYS)[number];

type SystemServiceDefault = {
  systemKey: EventServiceSystemKey;
  name: string;
  description: string;
};

const SYSTEM_SERVICE_DEFAULTS: SystemServiceDefault[] = [
  {
    systemKey: 'CARD_CHANGE',
    name: 'Card change',
    description: 'Change of SI card number.',
  },
  {
    systemKey: 'NAME_CHANGE',
    name: 'Name change',
    description: 'Change of competitor name.',
  },
  {
    systemKey: 'CLASS_CHANGE',
    name: 'Class change',
    description: 'Change of competitor class.',
  },
  {
    systemKey: 'START_TIME_CHANGE',
    name: 'Start time change',
    description: 'Change of competitor start time.',
  },
  {
    systemKey: 'ENTRY_CANCEL',
    name: 'Entry cancellation',
    description: 'Cancellation of event registration.',
  },
  {
    systemKey: 'CARD_RENTAL',
    name: 'Card rental',
    description: 'Rental of an SI card.',
  },
];

type StoredEventService = {
  id: number;
  systemKey: EventServiceSystemKey | null;
  active: boolean;
  name: string;
  description: string | null;
  price: { toNumber(): number } | null;
  maxQuantity: number | null;
};

export type EventServiceSetting = {
  id: number | null;
  systemKey: EventServiceSystemKey | null;
  active: boolean;
  name: string;
  description: string | null;
  price: number | null;
  maxQuantity: number | null;
  custom: boolean;
};

export type EventServiceSettings = {
  eventId: string;
  lateEntryFeePercent: number | null;
  services: EventServiceSetting[];
};

export type UpdateSystemEventServiceInput = {
  eventId: string;
  systemKey: EventServiceSystemKey;
  active: boolean;
  price?: number | null;
};

export type SaveCustomEventServiceInput = {
  eventId: string;
  id?: number | null;
  active?: boolean;
  name: string;
  description?: string | null;
  price?: number | null;
  maxQuantity?: number | null;
};

const DECIMAL_SCALE_EPSILON = 1e-9;

function isSystemEventServiceKey(value: string): value is EventServiceSystemKey {
  return SYSTEM_EVENT_SERVICE_KEYS.includes(value as EventServiceSystemKey);
}

function validateMoney(value: number | null | undefined, fieldName: string): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value)) {
    throw new ValidationError(`${fieldName} must be a finite number.`);
  }
  if (value < 0) {
    throw new ValidationError(`${fieldName} must be greater than or equal to 0.`);
  }
  const scaled = value * 100;
  if (Math.abs(scaled - Math.round(scaled)) > DECIMAL_SCALE_EPSILON) {
    throw new ValidationError(`${fieldName} can have at most 2 decimal places.`);
  }
  return value;
}

function validatePercent(value: number | null | undefined): number | null {
  const percent = validateMoney(value, 'Late entry fee percent');
  if (percent !== null && percent > 999.99) {
    throw new ValidationError('Late entry fee percent must be less than or equal to 999.99.');
  }
  return percent;
}

function validateMaxQuantity(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 0) {
    throw new ValidationError('Maximum quantity must be a non-negative integer.');
  }
  return value;
}

function normalizeText(value: string, fieldName: string, maxLength: number): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new ValidationError(`${fieldName} is required.`);
  }
  if (normalized.length > maxLength) {
    throw new ValidationError(`${fieldName} must be at most ${maxLength} characters.`);
  }
  return normalized;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function toSetting(service: StoredEventService, custom: boolean): EventServiceSetting {
  return {
    id: service.id,
    systemKey: service.systemKey,
    active: service.active,
    name: service.name,
    description: service.description,
    price: service.price?.toNumber() ?? null,
    maxQuantity: service.maxQuantity,
    custom,
  };
}

export async function listEventServiceSettings(
  prisma: AppPrismaClient,
  auth: GraphQLAuthContext,
  eventId: string,
): Promise<EventServiceSettings> {
  await requireEventOwnerOrAdmin(prisma, auth, eventId);

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      lateEntryFeePercent: true,
      services: { orderBy: [{ systemKey: 'asc' }, { id: 'asc' }] },
    },
  });

  if (!event) {
    throw new Error('Event not found');
  }

  const services = event.services as StoredEventService[];
  const systemByKey = new Map(
    services
      .filter((service) => service.systemKey !== null)
      .map((service) => [service.systemKey as EventServiceSystemKey, service]),
  );
  const customServices = services.filter((service) => service.systemKey === null);

  return {
    eventId: event.id,
    lateEntryFeePercent: event.lateEntryFeePercent?.toNumber() ?? null,
    services: [
      ...SYSTEM_SERVICE_DEFAULTS.map((defaults) => {
        const stored = systemByKey.get(defaults.systemKey);
        return stored
          ? {
              ...toSetting(stored, false),
              name: defaults.name,
              description: defaults.description,
            }
          : {
              id: null,
              systemKey: defaults.systemKey,
              active: false,
              name: defaults.name,
              description: defaults.description,
              price: null,
              maxQuantity: null,
              custom: false,
            };
      }),
      ...customServices.map((service) => toSetting(service, true)),
    ],
  };
}

export async function updateLateEntryFeePercentForGraphQL(
  prisma: AppPrismaClient,
  auth: GraphQLAuthContext,
  eventId: string,
  lateEntryFeePercent: number | null | undefined,
) {
  await requireEventOwnerOrAdmin(prisma, auth, eventId);

  await prisma.event.update({
    where: { id: eventId },
    data: { lateEntryFeePercent: validatePercent(lateEntryFeePercent) },
  });

  return { message: 'Late entry fee percent updated' };
}

export async function updateSystemEventServiceForGraphQL(
  prisma: AppPrismaClient,
  auth: GraphQLAuthContext,
  input: UpdateSystemEventServiceInput,
) {
  await requireEventOwnerOrAdmin(prisma, auth, input.eventId);

  if (!isSystemEventServiceKey(input.systemKey)) {
    throw new ValidationError('Unsupported system event service.');
  }

  const defaults = SYSTEM_SERVICE_DEFAULTS.find((service) => service.systemKey === input.systemKey);
  if (!defaults) {
    throw new ValidationError('Unsupported system event service.');
  }

  const data = {
    active: input.active,
    name: defaults.name,
    description: defaults.description,
    price: validateMoney(input.price, 'Service price'),
    maxQuantity: null,
  };

  await prisma.eventService.upsert({
    where: { eventId_systemKey: { eventId: input.eventId, systemKey: input.systemKey } },
    create: { eventId: input.eventId, systemKey: input.systemKey, ...data },
    update: data,
  });

  return { message: 'Event service updated' };
}

export async function saveCustomEventServiceForGraphQL(
  prisma: AppPrismaClient,
  auth: GraphQLAuthContext,
  input: SaveCustomEventServiceInput,
): Promise<EventServiceSetting> {
  await requireEventOwnerOrAdmin(prisma, auth, input.eventId);

  const data: Prisma.EventServiceUncheckedCreateInput = {
    eventId: input.eventId,
    systemKey: null,
    active: input.active ?? true,
    name: normalizeText(input.name, 'Service name', 128),
    description: normalizeOptionalText(input.description),
    price: validateMoney(input.price, 'Service price'),
    maxQuantity: validateMaxQuantity(input.maxQuantity),
  };

  if (input.id != null) {
    const existing = await prisma.eventService.findUnique({
      where: { id: input.id },
      select: { eventId: true, systemKey: true },
    });

    if (!existing || existing.eventId !== input.eventId || existing.systemKey !== null) {
      throw new Error('Custom event service not found');
    }

    const updated = await prisma.eventService.update({
      where: { id: input.id },
      data,
    });
    return toSetting(updated as StoredEventService, true);
  }

  const created = await prisma.eventService.create({ data });
  return toSetting(created as StoredEventService, true);
}

export async function deleteCustomEventServiceForGraphQL(
  prisma: AppPrismaClient,
  auth: GraphQLAuthContext,
  eventId: string,
  id: number,
) {
  await requireEventOwnerOrAdmin(prisma, auth, eventId);

  const existing = await prisma.eventService.findUnique({
    where: { id },
    select: { eventId: true, systemKey: true },
  });

  if (!existing || existing.eventId !== eventId || existing.systemKey !== null) {
    throw new Error('Custom event service not found');
  }

  await prisma.eventService.delete({ where: { id } });
  return { message: 'Event service deleted' };
}
