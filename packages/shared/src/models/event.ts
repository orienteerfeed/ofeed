import { z } from "zod";

import { dateLikeSchema, eventFilterSchema, startModeSchema } from "./common";

export const eventSchema = z.object({
  id: z.string(),
  sportId: z.number().int(),
  name: z.string(),
  organizer: z.string().nullable().optional(),
  date: dateLikeSchema,
  timezone: z.string(),
  location: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  countryId: z.string().nullable().optional(),
  featuredImageKey: z.string().nullable().optional(),
  zeroTime: z
    .string()
    .regex(/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/, "Expected UTC time as HH:mm:ss"),
  relay: z.boolean(),
  startMode: startModeSchema,
  ranking: z.boolean(),
  coefRanking: z.number().nullable().optional(),
  hundredthPrecision: z.boolean(),
  published: z.boolean(),
  demo: z.boolean(),
  authorId: z.number().int().nullable().optional(),
  createdAt: dateLikeSchema,
  updatedAt: dateLikeSchema,
});

export const eventPasswordSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  password: z.string(),
  expiresAt: dateLikeSchema,
  createdAt: dateLikeSchema,
  updatedAt: dateLikeSchema,
});

export const pageInfoSchema = z.object({
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
  startCursor: z.string().nullable().optional(),
  endCursor: z.string().nullable().optional(),
});

export const eventEdgeSchema = z.object({
  node: eventSchema,
  cursor: z.string(),
});

export const eventConnectionSchema = z.object({
  edges: z.array(eventEdgeSchema),
  pageInfo: pageInfoSchema,
});

export const eventsInputSchema = z.object({
  filter: eventFilterSchema.optional(),
  sportId: z.number().int().optional(),
  search: z.string().optional(),
  first: z.number().int().optional(),
  after: z.string().optional(),
});

export const eventResponseSchema = z.object({
  message: z.string(),
  event: eventSchema.nullable().optional(),
});

export const winnerNotificationSchema = z.object({
  eventId: z.string(),
  classId: z.number().int(),
  className: z.string(),
  name: z.string(),
});

export const organisationSchema = z.object({
  name: z.string(),
  competitors: z.number().int(),
});

export type Event = z.infer<typeof eventSchema>;
export type EventPassword = z.infer<typeof eventPasswordSchema>;
export type PageInfo = z.infer<typeof pageInfoSchema>;
export type EventEdge = z.infer<typeof eventEdgeSchema>;
export type EventConnection = z.infer<typeof eventConnectionSchema>;
export type EventsInput = z.infer<typeof eventsInputSchema>;
export type EventResponse = z.infer<typeof eventResponseSchema>;
export type WinnerNotification = z.infer<typeof winnerNotificationSchema>;
export type Organisation = z.infer<typeof organisationSchema>;
