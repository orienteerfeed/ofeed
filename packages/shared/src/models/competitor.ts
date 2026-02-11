import { z } from "zod";

import { dateLikeSchema, resultStatusSchema } from "./common";

export const competitorSchema = z.object({
  id: z.number().int(),
  classId: z.number().int(),
  firstname: z.string(),
  lastname: z.string(),
  bibNumber: z.number().int().nullable().optional(),
  nationality: z.string().nullable().optional(),
  registration: z.string(),
  license: z.string().nullable().optional(),
  ranking: z.number().int().nullable().optional(),
  rankPointsAvg: z.number().int().nullable().optional(),
  organisation: z.string().nullable().optional(),
  shortName: z.string().nullable().optional(),
  card: z.number().int().nullable().optional(),
  startTime: dateLikeSchema.nullable().optional(),
  finishTime: dateLikeSchema.nullable().optional(),
  time: z.number().int().nullable().optional(),
  teamId: z.number().int().nullable().optional(),
  leg: z.number().int().nullable().optional(),
  status: resultStatusSchema.optional(),
  lateStart: z.boolean().optional(),
  note: z.string().nullable().optional(),
  externalId: z.string().nullable().optional(),
  updatedAt: dateLikeSchema.optional(),
});

export type Competitor = z.infer<typeof competitorSchema>;
