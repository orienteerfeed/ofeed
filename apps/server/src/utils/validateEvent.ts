import { z } from "@hono/zod-openapi";

export const eventWriteSchema = z.object({
  sportId: z.coerce.number().int().min(1),
  name: z.string().min(1).max(255),
  date: z.string().min(1),
  timezone: z.string().min(1),
  organizer: z.string().min(1).max(255),
  location: z.string().min(1).max(255),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
  zeroTime: z
    .string()
    .min(1)
    .regex(
      /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/,
      "Invalid zero time. Expected HH:mm or HH:mm:ss.",
    ),
  relay: z.boolean().optional(),
  hundredthPrecision: z.boolean().optional(),
  published: z.boolean().optional(),
  ranking: z.boolean().optional(),
  startMode: z.string().optional(),
  coefRanking: z.coerce.number().optional().nullable(),
  countryCode: z.string().min(2).max(2).optional(),
  country: z.string().min(2).max(2).optional(),
  externalSource: z.enum(["ORIS", "EVENTOR"]).optional().nullable(),
  externalEventId: z.string().min(1).max(128).optional().nullable(),
}).refine(
  value =>
    Boolean(value.externalSource) === Boolean(value.externalEventId),
  {
    message: "externalSource and externalEventId must be provided together.",
    path: ["externalSource"],
  },
).passthrough();

export type EventWrite = z.infer<typeof eventWriteSchema>;

export default eventWriteSchema;
