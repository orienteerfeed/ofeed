import { z } from "zod";

import { competitorSchema } from "./competitor";
import { dateLikeSchema, originSchema, protocolTypeSchema, resultStatusSchema } from "./common";

export const protocolSchema = z.object({
  id: z.number().int(),
  eventId: z.string(),
  competitorId: z.number().int(),
  origin: originSchema,
  type: protocolTypeSchema,
  previousValue: z.string().nullable().optional(),
  newValue: z.string(),
  authorId: z.number().int(),
  createdAt: dateLikeSchema,
});

export const changelogSchema = z.object({
  id: z.number().int(),
  eventId: z.string(),
  competitorId: z.number().int(),
  origin: originSchema,
  type: protocolTypeSchema,
  previousValue: z.string().nullable().optional(),
  newValue: z.string().nullable().optional(),
  authorId: z.number().int(),
  createdAt: dateLikeSchema,
});

export const competitorStatusChangeSchema = z.enum(["Active", "Inactive", "DidNotStart", "LateStart"]);

export const statusChangeInputSchema = z.object({
  eventId: z.string(),
  competitorId: z.number().int(),
  origin: z.literal("START"),
  status: competitorStatusChangeSchema,
});

export const updateCompetitorInputSchema = z.object({
  eventId: z.string(),
  competitorId: z.number().int(),
  origin: originSchema,
  classId: z.number().int().optional(),
  firstname: z.string().optional(),
  lastname: z.string().optional(),
  bibNumber: z.number().int().optional(),
  nationality: z.string().optional(),
  registration: z.string().optional(),
  license: z.string().optional(),
  ranking: z.number().int().optional(),
  rankPointsAvg: z.number().int().optional(),
  organisation: z.string().optional(),
  shortName: z.string().optional(),
  card: z.number().int().optional(),
  startTime: dateLikeSchema.optional(),
  finishTime: dateLikeSchema.optional(),
  time: z.number().int().optional(),
  teamId: z.number().int().optional(),
  leg: z.number().int().optional(),
  status: resultStatusSchema.optional(),
  lateStart: z.boolean().optional(),
  note: z.string().optional(),
  externalId: z.string().optional(),
});

export const storeCompetitorInputSchema = z.object({
  eventId: z.string(),
  classId: z.number().int(),
  origin: originSchema,
  firstname: z.string(),
  lastname: z.string(),
  bibNumber: z.number().int().optional(),
  nationality: z.string().optional(),
  registration: z.string().optional(),
  license: z.string().optional(),
  ranking: z.number().int().optional(),
  rankPointsAvg: z.number().int().optional(),
  organisation: z.string().optional(),
  shortName: z.string().optional(),
  card: z.number().int().optional(),
  startTime: dateLikeSchema.optional(),
  finishTime: dateLikeSchema.optional(),
  time: z.number().int().optional(),
  teamId: z.number().int().optional(),
  leg: z.number().int().optional(),
  status: resultStatusSchema.optional(),
  lateStart: z.boolean().optional(),
  note: z.string().optional(),
  externalId: z.string().optional(),
});

export const storeCompetitorResponseSchema = z.object({
  message: z.string(),
  competitor: competitorSchema,
});

export type Protocol = z.infer<typeof protocolSchema>;
export type Changelog = z.infer<typeof changelogSchema>;
export type CompetitorStatusChange = z.infer<typeof competitorStatusChangeSchema>;
export type StatusChangeInput = z.infer<typeof statusChangeInputSchema>;
export type UpdateCompetitorInput = z.infer<typeof updateCompetitorInputSchema>;
export type StoreCompetitorInput = z.infer<typeof storeCompetitorInputSchema>;
export type StoreCompetitorResponse = z.infer<typeof storeCompetitorResponseSchema>;
