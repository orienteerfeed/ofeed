import { z } from '@hono/zod-openapi';
import { normalizeBankAccountIban } from '@repo/shared';

export const BATCH_MAX = 200;

const money = z
  .string()
  .regex(/^\d{1,12}\.\d{2}$/, 'Use a decimal string with two places, e.g. "1490.00"')
  .refine((value) => Number(value) > 0, 'Amount must be positive');
const isoDate = z.iso.date();
const variableSymbolPrefix = z.string().regex(/^\d{1,10}$/);
const iban = z.string().transform((value, ctx) => {
  const normalized = normalizeBankAccountIban(value);
  if (!normalized) ctx.addIssue({ code: 'custom', message: 'Invalid IBAN or account number' });
  return normalized ?? z.NEVER;
});

export const createBankConnectionSchema = z.strictObject({
  provider: z.enum(['FIO']),
  mode: z.enum(['LIVE', 'TEST']),
  name: z.string().trim().min(1).max(100),
  accountIdentifier: iban,
  variableSymbolPrefix,
  prefixEffectiveFrom: isoDate,
  deviceId: z.uuid(),
});

export const updateBankConnectionSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(100).optional(),
    variableSymbolPrefix: variableSymbolPrefix.optional(),
    prefixEffectiveFrom: isoDate.optional(),
    status: z.enum(['ACTIVE', 'PAUSED', 'REVOKED']).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field');

export const bankTransactionBatchSchema = z.strictObject({
  deviceId: z.uuid(),
  // Items are validated one by one so a bad item cannot fail the batch.
  transactions: z.array(z.unknown()).min(1).max(BATCH_MAX),
});

export const bankTransactionItemSchema = z.strictObject({
  providerTransactionId: z.string().regex(/^\d{1,20}$/),
  amount: money,
  currency: z.string().regex(/^[A-Z]{3}$/),
  variableSymbol: z.string().regex(/^\d{1,10}$/),
  bookingDate: isoDate,
  source: z.enum(['BANK_API', 'SIMULATED']),
});

export const bankSyncReportSchema = z
  .strictObject({
    deviceId: z.uuid(),
    startedAt: z.iso.datetime({ offset: true }),
    finishedAt: z.iso.datetime({ offset: true }),
    status: z.enum(['OK', 'ERROR']),
    fetchedCount: z.number().int().min(0).max(1_000_000),
    relevantCount: z.number().int().min(0).max(1_000_000),
    matchedCount: z.number().int().min(0).max(1_000_000).default(0),
    errorCode: z
      .string()
      .regex(/^[A-Za-z0-9_.-]{1,64}$/)
      .nullable()
      .default(null),
  })
  .refine((value) => Date.parse(value.startedAt) <= Date.parse(value.finishedAt), {
    message: 'startedAt must not be after finishedAt',
    path: ['finishedAt'],
  });

export const BANK_MATCHING_STATUSES = [
  'MATCHED',
  'UNMATCHED',
  'AMBIGUOUS',
  'PARTIALLY_PAID',
  'OVERPAID',
  'IGNORED',
] as const;

export const bankTransactionQuerySchema = z.strictObject({
  status: z.enum(BANK_MATCHING_STATUSES).optional(),
  since: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(BATCH_MAX).default(50),
  cursor: z.string().min(1).max(64).optional(),
});

export const eventBankTransactionQuerySchema = z.strictObject({
  status: z.enum(BANK_MATCHING_STATUSES).optional(),
});

export const manualMatchSchema = z.strictObject({ entryId: z.string().min(1).max(191) });

export const bankConnectionRecordSchema = z.object({
  id: z.string(),
  provider: z.enum(['FIO']),
  mode: z.enum(['LIVE', 'TEST']),
  name: z.string(),
  accountIdentifier: z.string(),
  variableSymbolPrefix: z.string(),
  prefixEffectiveFrom: isoDate,
  status: z.enum(['ACTIVE', 'PAUSED', 'REVOKED']),
  collectorDeviceId: z.string().nullable(),
  lastSeenAt: z.iso.datetime().nullable(),
  lastSuccessfulSyncAt: z.iso.datetime().nullable(),
  lastRelevantAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
});

export const bankTransactionRecordSchema = z.object({
  id: z.string(),
  connectionId: z.string(),
  providerTransactionId: z.string(),
  amount: z.string(),
  currency: z.string(),
  variableSymbol: z.string(),
  bookingDate: isoDate,
  source: z.enum(['BANK_API', 'SIMULATED']),
  trust: z.literal('CLIENT_REPORTED'),
  matchingStatus: z.enum(BANK_MATCHING_STATUSES),
  matchedEntryId: z.string().nullable(),
  matchedAmount: z.string().nullable(),
  reportedByDeviceId: z.string(),
  receivedAt: z.iso.datetime(),
});

export const bankBatchResultSchema = z.object({
  providerTransactionId: z.string().nullable(),
  status: z.enum([...BANK_MATCHING_STATUSES, 'DUPLICATE', 'INVALID']),
  entryId: z.string().optional(),
  label: z.string().optional(),
  matchedAmount: z.string().optional(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});

export type BankTransactionItem = z.infer<typeof bankTransactionItemSchema>;
export type BankBatchResult = z.infer<typeof bankBatchResultSchema>;
