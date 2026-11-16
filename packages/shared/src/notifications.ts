import { z } from 'zod';

export const notificationKindSchema = z.enum([
  'ENTRY_ORDER_RECEIVED',
  'ENTRY_PAYMENT_RECEIVED',
  'COMPETITOR_STARTED',
  'COMPETITOR_RADIO',
  'COMPETITOR_FINISHED',
  'COMPETITOR_READOUT',
  'COMPETITOR_RESULT_CHANGED',
]);
export const notificationPageInputSchema = z.object({
  first: z.number().int().min(1).max(100).default(20),
  after: z.string().max(512).nullable().optional(),
});
export const userNotificationSchema = z.object({
  id: z.string(),
  kind: notificationKindSchema,
  eventId: z.string(),
  entryId: z.string().nullable(),
  competitorId: z.number().int().positive().nullable().optional(),
  competitorName: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  raceTime: z.number().int().nullable().optional(),
  controlCode: z.number().int().nullable().optional(),
  splitTime: z.number().int().nullable().optional(),
  eventName: z.string(),
  itemCount: z.number().int().nonnegative().nullable(),
  amount: z
    .string()
    .regex(/^\d+\.\d{2}$/)
    .nullable(),
  currency: z.string().nullable(),
  method: z.string().nullable(),
  createdAt: z.string().datetime(),
  readAt: z.string().datetime().nullable(),
});
export type UserNotification = z.infer<typeof userNotificationSchema>;
export type NotificationPageInput = z.infer<typeof notificationPageInputSchema>;
export const notificationPageSchema = z.object({
  notifications: z.array(userNotificationSchema),
  unreadCount: z.number().int().nonnegative(),
  endCursor: z.string().nullable(),
  hasNextPage: z.boolean(),
});
export type NotificationPage = z.infer<typeof notificationPageSchema>;
