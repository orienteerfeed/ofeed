import { z } from "zod";

import { dateLikeSchema } from "./common";

export const loginInputSchema = z.object({
  username: z.string(),
  password: z.string(),
});

export const signupInputSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  firstname: z.string(),
  lastname: z.string(),
  organisation: z.string().optional(),
});

export const authPayloadSchema = z.object({
  token: z.string().nullable().optional(),
  user: z
    .object({
      id: z.number().int(),
      email: z.string().email(),
      firstname: z.string(),
      lastname: z.string(),
    })
    .nullable()
    .optional(),
});

export const resetResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().nullable().optional(),
});

export const responseMessageSchema = z.object({
  message: z.string(),
});

export const passwordResetSchema = z.object({
  email: z.string().email(),
  token: z.string(),
  createdAt: dateLikeSchema,
});

export type LoginInput = z.infer<typeof loginInputSchema>;
export type SignupInput = z.infer<typeof signupInputSchema>;
export type AuthPayload = z.infer<typeof authPayloadSchema>;
export type ResetResponse = z.infer<typeof resetResponseSchema>;
export type ResponseMessage = z.infer<typeof responseMessageSchema>;
export type PasswordReset = z.infer<typeof passwordResetSchema>;
