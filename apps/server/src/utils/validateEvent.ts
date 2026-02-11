import { z } from "@hono/zod-openapi";

export const eventWriteSchema = z.object({
  sportId: z.coerce.number().int().positive(),
  name: z.string().min(1).max(255),
  date: z.string().min(1),
  timezone: z.string().min(1),
  organizer: z.string().min(1).max(255),
  location: z.string().min(1).max(255),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
  zeroTime: z.string().min(1),
  relay: z.boolean().optional(),
  hundredthPrecision: z.boolean().optional(),
  published: z.boolean().optional(),
  ranking: z.boolean().optional(),
  startMode: z.string().optional(),
  coefRanking: z.coerce.number().optional().nullable(),
  countryCode: z.string().min(2).max(2).optional(),
  country: z.string().min(2).max(2).optional(),
}).passthrough();

export type EventWrite = z.infer<typeof eventWriteSchema>;

export default eventWriteSchema;
