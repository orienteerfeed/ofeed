import { z } from "@hono/zod-openapi";

const validInputOrigin = ["START", "FINISH", "OFFICE", "IT"] as const;

export const createCompetitorSchema = z.object({
  origin: z.enum(validInputOrigin),
  classId: z.coerce.number().int().positive().optional().nullable(),
  classExternalId: z.string().max(191).optional().nullable(),
  firstname: z.string().min(1),
  lastname: z.string().min(1),
  externalId: z.string().max(191).optional().nullable(),
}).passthrough().refine(
  value => Boolean(value.classId) !== Boolean(value.classExternalId),
  { message: "Either classId or classExternalId must be provided, but not both", path: ["classId"] },
);

export const updateCompetitorSchema = z.object({
  origin: z.enum(validInputOrigin),
}).passthrough();

export type CreateCompetitorInput = z.infer<typeof createCompetitorSchema>;
export type UpdateCompetitorInput = z.infer<typeof updateCompetitorSchema>;
