import { z } from 'zod';

import { classStatusSchema, dateLikeSchema, sexSchema, startModeSchema } from './common.js';

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
    awardedPlaces: z.number().int().min(1).nullable().optional(),
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
    value =>
      !value.startWindowFrom ||
      !value.startWindowTo ||
      new Date(value.startWindowFrom).getTime() < new Date(value.startWindowTo).getTime(),
    { message: 'startWindowFrom must be before startWindowTo.', path: ['startWindowTo'] }
  );

export type Class = z.infer<typeof classSchema>;

export const classUpdateInputSchema = z
  .object({
    classId: z.number().int().positive(),
    maxNumberOfCompetitors: z.number().int().nonnegative().nullable().optional(),
    minAge: z.number().int().nonnegative().nullable().optional(),
    maxAge: z.number().int().nonnegative().nullable().optional(),
    minTeamMembers: z.number().int().min(1).nullable().optional(),
    maxTeamMembers: z.number().int().min(1).nullable().optional(),
    sex: sexSchema.optional(),
    resultListMode: z.enum(['Default', 'Unordered', 'UnorderedNoTimes']).nullable().optional(),
    startMode: startModeSchema.nullable().optional(),
    awardedPlaces: z.number().int().min(1).nullable().optional(),
    fee: z
      .number()
      .nonnegative()
      .nullable()
      .optional()
      .refine(value => value == null || Number.isInteger(value * 100), {
        message: 'Class fee can have at most 2 decimal places.',
      }),
  })
  .refine(value => value.minAge == null || value.maxAge == null || value.minAge <= value.maxAge, {
    message: 'minAge must be less than or equal to maxAge.',
    path: ['maxAge'],
  })
  .refine(
    value =>
      value.minTeamMembers == null ||
      value.maxTeamMembers == null ||
      value.minTeamMembers <= value.maxTeamMembers,
    {
      message: 'minTeamMembers must be less than or equal to maxTeamMembers.',
      path: ['maxTeamMembers'],
    }
  );

export type ClassUpdateInput = z.infer<typeof classUpdateInputSchema>;
