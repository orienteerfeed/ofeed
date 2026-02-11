import { z } from "@hono/zod-openapi";

export const myEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  organizer: z.string().nullable().optional(),
  date: z.union([z.string(), z.date()]),
  location: z.string().nullable().optional(),
  relay: z.boolean(),
  published: z.boolean(),
});

export const myEventsResponseSchema = z.object({
  message: z.string(),
  error: z.literal(false),
  code: z.number(),
  results: z.object({
    data: z.array(myEventSchema),
  }),
});

export type MyEvent = z.infer<typeof myEventSchema>;
export type MyEventsResponse = z.infer<typeof myEventsResponseSchema>;

