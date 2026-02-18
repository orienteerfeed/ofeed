import { z } from "@hono/zod-openapi";

const validInputOrigin = ["START", "FINISH", "OFFICE", "IT"] as const;

const competitorSplitsSchema = z.array(
  z.object({
    controlCode: z.coerce.number().int().optional(),
    time: z.coerce.number().int().optional().nullable(),
  }),
);

const competitorMutableFieldsSchema = {
  classId: z.coerce.number().int().min(1).optional().nullable(),
  classExternalId: z.string().max(191).optional().nullable(),
  firstname: z.string().min(1).optional(),
  lastname: z.string().min(1).optional(),
  externalId: z.string().max(191).optional().nullable(),
  nationality: z.string().max(3).optional(),
  registration: z.string().max(10).optional(),
  license: z.string().max(1).optional(),
  ranking: z.coerce.number().int().optional(),
  rankPointsAvg: z.coerce.number().int().optional(),
  organisation: z.string().optional(),
  shortName: z.string().max(10).optional(),
  card: z.coerce.number().int().optional(),
  bibNumber: z.coerce.number().int().optional(),
  startTime: z.string().min(1).optional().nullable(),
  finishTime: z.string().min(1).optional().nullable(),
  time: z.coerce.number().int().optional().nullable(),
  teamId: z.coerce.number().int().optional().nullable(),
  leg: z.coerce.number().int().optional().nullable(),
  status: z.string().optional(),
  lateStart: z.boolean().optional(),
  note: z.string().optional(),
  splits: competitorSplitsSchema.optional(),
};

export const createCompetitorSchema = z.object({
  origin: z.enum(validInputOrigin),
  ...competitorMutableFieldsSchema,
  firstname: z.string().min(1),
  lastname: z.string().min(1),
}).passthrough().refine(
  value => Boolean(value.classId) !== Boolean(value.classExternalId),
  { message: "Either classId or classExternalId must be provided, but not both", path: ["classId"] },
);

export const updateCompetitorSchema = z.object({
  origin: z.enum(validInputOrigin),
  ...competitorMutableFieldsSchema,
}).passthrough();

export type CreateCompetitorInput = z.infer<typeof createCompetitorSchema>;
export type UpdateCompetitorInput = z.infer<typeof updateCompetitorSchema>;
