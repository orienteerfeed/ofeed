import { z } from '@hono/zod-openapi';

export const createEntryPaymentSchema = z.strictObject({
  clientPaymentId: z.uuid(),
  method: z.enum(['CASH', 'QR']),
  amount: z.number().positive().max(99999999.99).multipleOf(0.01),
  currency: z.string().regex(/^[A-Z]{3}$/),
  paidAt: z.iso
    .datetime({ offset: true })
    .refine((value) => !/\.\d{4}/.test(value), 'Use at most millisecond precision'),
  deviceId: z
    .string()
    .min(1)
    .max(191)
    .refine((value) => value.trim().length > 0),
});

export const entryPaymentQuerySchema = z.strictObject({
  entryId: z.string().min(1).optional(),
  since: z.iso.datetime({ offset: true }).optional(),
  deviceId: z
    .string()
    .min(1)
    .max(191)
    .refine((value) => value.trim().length > 0)
    .optional(),
});

export const entryPaymentRecordSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  entryId: z.string(),
  clientPaymentId: z.uuid(),
  method: z.enum(['CASH', 'QR']),
  amount: z.number(),
  currency: z.string(),
  paidAt: z.iso.datetime(),
  deviceId: z.string(),
  operatorId: z.number().int(),
  recordedAt: z.iso.datetime(),
  source: z.enum(['MANUAL', 'BANK_IMPORT']),
  bankTransactionId: z.string().nullable(),
});
