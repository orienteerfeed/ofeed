import {
  PAYMENT_METHOD_TYPES,
  getPaymentMethodConfigurationStatus,
  normalizeBankAccountIban,
  updateEventPaymentMethodsInputSchema,
  type EventPaymentMethodConfiguration,
  type AvailableEventPaymentMethod,
  type PaymentMethodConfigurationStatus,
  type PaymentMethodType,
  type UpdateEventPaymentMethodsInput,
} from '@repo/shared';

import type { AppPrismaClient } from '../../db/prisma-client.js';
import { ValidationError } from '../../exceptions/index.js';
import type { GraphQLAuthContext } from '../../graphql/context.types.js';
import { requireEventOwnerOrAdmin } from '../../utils/authz.js';

type StoredPaymentMethod = {
  type: PaymentMethodType;
  enabled: boolean;
  position: number;
  displayName: string | null;
  paymentLinkTemplate: string | null;
};

type PaymentCapabilityEvent = {
  id: string;
  entryPaymentLifetimeHours?: number | null;
  paymentReferencePrefix?: string | null;
  ofeedPaymentAvailable: boolean;
  bankAccountIban: string | null;
  bankAccountName: string | null;
  paymentMethods: StoredPaymentMethod[];
};

export type EventPaymentMethodSetting = EventPaymentMethodConfiguration & {
  status: PaymentMethodConfigurationStatus;
};

export type EventPaymentCapabilities = {
  ofeedPaymentAvailable: boolean;
  qrPaymentAvailable: boolean;
  bankAccountDisplay: string | null;
  bankAccountIban: string | null;
  bankAccountName: string | null;
};

export type EventPaymentMethodSettings = {
  entryPaymentLifetimeHours: number | null;
  paymentReferencePrefix: string | null;
  eventId: string;
  paymentMethods: EventPaymentMethodSetting[];
  paymentCapabilities: EventPaymentCapabilities;
};

type PublicPaymentMethodEvent = PaymentCapabilityEvent;

const DEFAULT_PAYMENT_METHODS: EventPaymentMethodConfiguration[] = [
  {
    type: 'OFEED_PAYMENT',
    enabled: false,
    position: 0,
    displayName: null,
    paymentLinkTemplate: null,
  },
  {
    type: 'CUSTOM_PAYMENT_LINK',
    enabled: false,
    position: 1,
    displayName: null,
    paymentLinkTemplate: null,
  },
  {
    type: 'QR_PAYMENT',
    enabled: false,
    position: 2,
    displayName: null,
    paymentLinkTemplate: null,
  },
  {
    type: 'CASH',
    enabled: true,
    position: 3,
    displayName: null,
    paymentLinkTemplate: null,
  },
];

function bankAccountDisplay(event: PaymentCapabilityEvent): string | null {
  const account = event.bankAccountIban
    ? (normalizeBankAccountIban(event.bankAccountIban) ?? event.bankAccountIban.trim())
    : null;
  const parts = [event.bankAccountName?.trim(), account].filter(Boolean);
  return parts.length > 0 ? parts.join(' - ') : null;
}

function capabilitiesForEvent(event: PaymentCapabilityEvent): EventPaymentCapabilities {
  const display = bankAccountDisplay(event);
  const iban = event.bankAccountIban ? normalizeBankAccountIban(event.bankAccountIban) : null;
  return {
    ofeedPaymentAvailable: event.ofeedPaymentAvailable,
    qrPaymentAvailable: iban !== null,
    bankAccountDisplay: display,
    bankAccountIban: iban ?? event.bankAccountIban,
    bankAccountName: event.bankAccountName,
  };
}

function completePaymentMethods(stored: StoredPaymentMethod[]): EventPaymentMethodConfiguration[] {
  const storedTypes = new Set(stored.map((method) => method.type));
  return [
    ...[...stored].sort((left, right) => left.position - right.position),
    ...DEFAULT_PAYMENT_METHODS.filter((method) => !storedTypes.has(method.type)),
  ].map((method, position) => ({ ...method, position }));
}

function toSettings(event: PaymentCapabilityEvent): EventPaymentMethodSettings {
  const capabilities = capabilitiesForEvent(event);
  const effectiveMethods = completePaymentMethods(event.paymentMethods).map((method) =>
    method.type === 'OFEED_PAYMENT' && !capabilities.ofeedPaymentAvailable
      ? { ...method, enabled: false }
      : method,
  );
  return {
    eventId: event.id,
    entryPaymentLifetimeHours: event.entryPaymentLifetimeHours ?? null,
    paymentReferencePrefix: event.paymentReferencePrefix ?? null,
    paymentCapabilities: capabilities,
    paymentMethods: effectiveMethods.map((method) => ({
      ...method,
      status: getPaymentMethodConfigurationStatus(method, capabilities),
    })),
  };
}

/**
 * Return only methods that a customer can actually select. Payment link
 * templates and bank-account details intentionally remain server-side.
 */
export function availablePaymentMethodsForEvent(
  event: PublicPaymentMethodEvent,
): AvailableEventPaymentMethod[] {
  const capabilities = capabilitiesForEvent(event);
  return completePaymentMethods(event.paymentMethods)
    .filter((method) => getPaymentMethodConfigurationStatus(method, capabilities) === 'READY')
    .map((method) => ({
      type: method.type,
      displayName: method.type === 'CUSTOM_PAYMENT_LINK' ? (method.displayName ?? null) : null,
    }));
}

export async function listAvailableEventPaymentMethods(
  prisma: AppPrismaClient,
  eventId: string,
): Promise<AvailableEventPaymentMethod[] | null> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
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
    },
  });

  return event ? availablePaymentMethodsForEvent(event as PaymentCapabilityEvent) : null;
}

export async function listEventPaymentMethods(
  prisma: AppPrismaClient,
  auth: GraphQLAuthContext,
  eventId: string,
): Promise<EventPaymentMethodSettings> {
  await requireEventOwnerOrAdmin(prisma, auth, eventId);

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      entryPaymentLifetimeHours: true,
      paymentReferencePrefix: true,
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
    },
  });

  if (!event) throw new Error('Event not found');
  return toSettings(event as PaymentCapabilityEvent);
}

export async function updateEventPaymentMethods(
  prisma: AppPrismaClient,
  auth: GraphQLAuthContext,
  eventId: string,
  input: UpdateEventPaymentMethodsInput,
): Promise<EventPaymentMethodSettings> {
  await requireEventOwnerOrAdmin(prisma, auth, eventId);

  const parsed = updateEventPaymentMethodsInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid payment methods.');
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      entryPaymentLifetimeHours: true,
      paymentReferencePrefix: true,
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
    },
  });
  if (!event) throw new Error('Event not found');

  const capabilities = capabilitiesForEvent(event as PaymentCapabilityEvent);
  const nextPaymentReferencePrefix =
    parsed.data.paymentReferencePrefix === undefined
      ? event.paymentReferencePrefix
      : parsed.data.paymentReferencePrefix || null;
  const bankAccount = parsed.data.bankAccount;
  const nextBankAccountIban =
    bankAccount === undefined ? event.bankAccountIban : bankAccount.bankAccountIban?.trim() || null;
  const nextBankAccountName =
    bankAccount === undefined ? event.bankAccountName : bankAccount.bankAccountName?.trim() || null;
  const nextCapabilities = capabilitiesForEvent({
    ...(event as PaymentCapabilityEvent),
    bankAccountIban: nextBankAccountIban,
    bankAccountName: nextBankAccountName,
  });
  const ofeedPayment = parsed.data.paymentMethods.find((method) => method.type === 'OFEED_PAYMENT');
  if (ofeedPayment?.enabled && !capabilities.ofeedPaymentAvailable) {
    throw new ValidationError('OFeed Payment is not available for this organization.');
  }

  const qrPayment = parsed.data.paymentMethods.find((method) => method.type === 'QR_PAYMENT');
  if (qrPayment?.enabled && !nextCapabilities.qrPaymentAvailable) {
    throw new ValidationError('A bank account is required to enable QR Payment.');
  }

  const normalizedMethods = parsed.data.paymentMethods.map((method) => ({
    eventId,
    type: method.type,
    enabled: method.enabled,
    position: method.position,
    displayName: method.type === 'CUSTOM_PAYMENT_LINK' ? method.displayName?.trim() || null : null,
    paymentLinkTemplate:
      method.type === 'CUSTOM_PAYMENT_LINK' ? method.paymentLinkTemplate?.trim() || null : null,
  }));

  await prisma.$transaction(async (transaction) => {
    if (
      bankAccount !== undefined ||
      parsed.data.paymentReferencePrefix !== undefined ||
      parsed.data.entryPaymentLifetimeHours !== undefined
    ) {
      await transaction.event.update({
        where: { id: eventId },
        data: {
          ...(parsed.data.entryPaymentLifetimeHours !== undefined
            ? { entryPaymentLifetimeHours: parsed.data.entryPaymentLifetimeHours }
            : {}),
          ...(parsed.data.paymentReferencePrefix !== undefined
            ? { paymentReferencePrefix: nextPaymentReferencePrefix }
            : {}),
          ...(bankAccount !== undefined
            ? { bankAccountIban: nextBankAccountIban, bankAccountName: nextBankAccountName }
            : {}),
        },
      });
    }
    await transaction.eventPaymentMethod.deleteMany({ where: { eventId } });
    await transaction.eventPaymentMethod.createMany({ data: normalizedMethods });
  });

  return toSettings({
    ...(event as PaymentCapabilityEvent),
    bankAccountIban: nextBankAccountIban,
    bankAccountName: nextBankAccountName,
    entryPaymentLifetimeHours:
      parsed.data.entryPaymentLifetimeHours === undefined
        ? event.entryPaymentLifetimeHours
        : parsed.data.entryPaymentLifetimeHours,
    paymentReferencePrefix: nextPaymentReferencePrefix,
    paymentMethods: normalizedMethods.map(({ eventId: _eventId, ...method }) => method),
  });
}
