import { z } from "@hono/zod-openapi";
import { updateCompetitorSchema } from "../../utils/validateCompetitor.js";

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

export const generatePasswordBodySchema = z.object({
  eventId: z.string().min(1),
});

export const stateChangeBodySchema = z.object({
  origin: z.enum(["START"]),
  status: z.enum(["Inactive", "Active", "DidNotStart", "Cancelled", "LateStart"]),
});

export const externalCompetitorUpdateBodySchema = updateCompetitorSchema.extend({
  useExternalId: z.boolean(),
  classExternalId: z.string().max(191).optional().nullable(),
}).refine(
  value => !(value.classId && value.classExternalId),
  { message: "Only one of classId or classExternalId should be provided, not both.", path: ["classId"] },
);

export type EventIdParams = z.infer<typeof eventIdParamsSchema>;
export type EventCompetitorParams = z.infer<typeof eventCompetitorParamsSchema>;
export type EventCompetitorExternalParams = z.infer<typeof eventCompetitorExternalParamsSchema>;
export type ChangelogQuery = z.infer<typeof changelogQuerySchema>;
export type GeneratePasswordBody = z.infer<typeof generatePasswordBodySchema>;
export type StateChangeBody = z.infer<typeof stateChangeBodySchema>;
export type ExternalCompetitorUpdateBody = z.infer<typeof externalCompetitorUpdateBodySchema>;
