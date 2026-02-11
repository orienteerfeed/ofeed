import { z } from "@hono/zod-openapi";

export const eventIdParamsSchema = z.object({
  eventId: z.string().min(1),
});

export const eventCompetitorParamsSchema = z.object({
  eventId: z.string().min(1),
  competitorId: z.string().regex(/^\d+$/),
});

export const eventCompetitorExternalParamsSchema = z.object({
  eventId: z.string().min(1),
  competitorExternalId: z.string().min(1),
});

export const changelogQuerySchema = z.object({
  since: z.string().datetime({ offset: true }).optional(),
  origin: z.enum(["START", "FINISH", "IT", "OFFICE"]).optional(),
  group: z.boolean().optional(),
  classId: z.string().regex(/^\d+$/).optional(),
});

export type EventIdParams = z.infer<typeof eventIdParamsSchema>;
export type EventCompetitorParams = z.infer<typeof eventCompetitorParamsSchema>;
export type EventCompetitorExternalParams = z.infer<typeof eventCompetitorExternalParamsSchema>;
export type ChangelogQuery = z.infer<typeof changelogQuerySchema>;

