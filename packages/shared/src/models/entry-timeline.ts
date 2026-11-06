import { z } from 'zod';

/** Calendar date (YYYY-MM-DD) in the event timezone. */
const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const entryTimelineDaySchema = z.object({
  date: localDateSchema,
  classId: z.number().int(),
  className: z.string(),
  entries: z.number().int().nonnegative(),
  lateEntries: z.number().int().nonnegative(),
});
export type EntryTimelineDay = z.infer<typeof entryTimelineDaySchema>;

export const entryReportItemSchema = z.object({
  id: z.number().int(),
  classId: z.number().int(),
  className: z.string(),
  firstname: z.string(),
  lastname: z.string(),
  organisation: z.string().nullable(),
  card: z.number().nullable(),
  cardRental: z.boolean(),
  amount: z.number(),
});
export const entryReportOrderSchema = z.object({
  id: z.string(),
  receivedAt: z.string().datetime(),
  status: z.string(),
  paymentReference: z.string(),
  paymentMethod: z.string().nullable(),
  currency: z.string(),
  totalAmount: z.number(),
  receivedAmount: z.number(),
  outstandingAmount: z.number(),
  legacyPaid: z.boolean(),
  paid: z.boolean(),
  promoCode: z.string().nullable(),
  promoDiscountAmount: z.number(),
  items: z.array(entryReportItemSchema),
});
export type EntryReportOrder = z.infer<typeof entryReportOrderSchema>;
export type EntryReportItem = z.infer<typeof entryReportItemSchema>;

export const eventEntryTimelineSchema = z.object({
  eventName: z.string().optional(),
  location: z.string().nullable().optional(),
  startAt: z.string().datetime().optional(),
  orders: z.array(entryReportOrderSchema).optional(),
  timezone: z.string(),
  entriesOpenOn: localDateSchema.nullable(),
  entriesCloseOn: localDateSchema.nullable(),
  eventOn: localDateSchema,
  days: z.array(entryTimelineDaySchema),
});
export type EventEntryTimeline = z.infer<typeof eventEntryTimelineSchema>;
