import { z } from "zod";

import { classStatusSchema, dateLikeSchema, sexSchema, startModeSchema } from "./common.js";

export const classSchema = z
  .object({
    id: z.number().int(),
    eventId: z.string(),
    externalId: z.string().nullable().optional(),
    name: z.string(),
    startName: z.string().nullable().optional(),
    length: z.number().int().nullable().optional(),
    climb: z.number().int().nullable().optional(),
    controlsCount: z.number().int().nullable().optional(),
    competitorsCount: z.number().int().nullable().optional(),
    maxNumberOfCompetitors: z.number().int().nullable().optional(),
    resultListMode: z.enum(['Default', 'Unordered', 'UnorderedNoTimes']).nullable().optional(),
    startMode: startModeSchema.nullable().optional(),
    startWindowFrom: dateLikeSchema.nullable().optional(),
    startWindowTo: dateLikeSchema.nullable().optional(),
    fee: z.number().nullable().optional(),
    currentFee: z.number().nullable().optional(),
    feeNet: z.number().nullable().optional(),
    feeVat: z.number().nullable().optional(),
    minAge: z.number().int().nullable().optional(),
    maxAge: z.number().int().nullable().optional(),
    minTeamMembers: z.number().int().nullable().optional(),
    maxTeamMembers: z.number().int().nullable().optional(),
    sex: sexSchema.optional(),
    status: classStatusSchema.optional(),
  })
  .refine(
    (value) =>
      !value.startWindowFrom ||
      !value.startWindowTo ||
      new Date(value.startWindowFrom).getTime() < new Date(value.startWindowTo).getTime(),
    { message: 'startWindowFrom must be before startWindowTo.', path: ['startWindowTo'] },
  );

export type Class = z.infer<typeof classSchema>;
