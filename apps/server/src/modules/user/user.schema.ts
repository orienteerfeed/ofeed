import { z } from '@hono/zod-openapi';

import { UserCardType } from '../../generated/prisma/enums.js';

export const loginInputSchema = z.object({
  username: z.string().max(255),
  password: z.string().max(255),
});

export const userInputSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().max(255),
  firstname: z.string().max(255),
  lastname: z.string().max(255),
  organisation: z.string().max(191).nullable().optional(),
});

export const updateCurrentUserInputSchema = z.object({
  email: z.string().email().max(255).nullable().optional(),
  firstname: z.string().min(1).max(255).nullable().optional(),
  lastname: z.string().min(1).max(255).nullable().optional(),
  organisation: z.string().max(191).nullable().optional(),
  emergencyContact: z.string().max(255).nullable().optional(),
});

export const createUserCardInputSchema = z.object({
  sportId: z.number().int(),
  type: z.enum([UserCardType.SPORTIDENT]),
  cardNumber: z.string().min(1).max(64),
  isDefault: z.boolean().nullable().optional(),
});

export const updateUserCardInputSchema = z.object({
  id: z.number().int(),
  sportId: z.number().int(),
  type: z.enum([UserCardType.SPORTIDENT]),
  cardNumber: z.string().min(1).max(64),
});

export const changeCurrentUserPasswordInputSchema = z.object({
  currentPassword: z.string().min(1).max(255),
  newPassword: z.string().min(8).max(255),
});

export const deleteCurrentAccountInputSchema = z.object({
  currentPassword: z.string().min(1).max(255),
  deleteEvents: z.boolean().optional().default(false),
});

export const myEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  organizer: z.string().nullable().optional(),
  date: z.union([z.string(), z.date()]),
  location: z.string().nullable().optional(),
  relay: z.boolean(),
  published: z.boolean(),
  statusSummary: z.object({
    primary: z.enum(['DRAFT', 'UPCOMING', 'LIVE', 'DONE']),
  }),
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
export type LoginInput = z.infer<typeof loginInputSchema>;
export type UserInput = z.infer<typeof userInputSchema>;
export type UpdateCurrentUserInput = z.infer<typeof updateCurrentUserInputSchema>;
export type CreateUserCardInput = z.infer<typeof createUserCardInputSchema>;
export type UpdateUserCardInput = z.infer<typeof updateUserCardInputSchema>;
export type ChangeCurrentUserPasswordInput = z.infer<typeof changeCurrentUserPasswordInputSchema>;
export type DeleteCurrentAccountInput = z.infer<typeof deleteCurrentAccountInputSchema>;
