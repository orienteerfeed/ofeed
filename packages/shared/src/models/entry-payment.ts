import { z } from 'zod';

export const entryPaymentMethodSchema = z.enum(['CASH', 'QR']);
export type EntryPaymentMethod = z.infer<typeof entryPaymentMethodSchema>;

export const entryPaymentRecordSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  entryId: z.string(),
  clientPaymentId: z.uuid(),
  method: entryPaymentMethodSchema,
  amount: z.number(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  paidAt: z.iso.datetime(),
  deviceId: z.string(),
  operatorId: z.number().int(),
  recordedAt: z.iso.datetime(),
});
export type EntryPaymentRecord = z.infer<typeof entryPaymentRecordSchema>;

export const entryPaymentInsightSchema = entryPaymentRecordSchema.extend({
  paymentReference: z.string(),
  contactFirstname: z.string(),
  contactLastname: z.string(),
});
export type EntryPaymentInsight = z.infer<typeof entryPaymentInsightSchema>;

export const createEntryPaymentInputSchema = z.object({
  clientPaymentId: z.uuid(),
  method: entryPaymentMethodSchema,
  amount: z.number().positive().max(99999999.99).multipleOf(0.01),
  currency: z.string().regex(/^[A-Z]{3}$/),
  paidAt: z.iso.datetime({ offset: true }),
  deviceId: z.string().trim().min(1).max(191),
});
export type CreateEntryPaymentInput = z.infer<typeof createEntryPaymentInputSchema>;
