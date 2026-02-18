import { z } from "@hono/zod-openapi";

export const signinBodySchema = z.object({
  username: z.string().email(),
  password: z.string().min(1),
});

export const signupBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstname: z.string().min(1),
  lastname: z.string().min(1),
});

export const passwordResetRequestBodySchema = z.object({
  email: z.string().email(),
});

export const passwordResetConfirmBodySchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(1),
});

export const oauthTokenBodySchema = z.object({
  grant_type: z.literal("client_credentials"),
  scope: z.string().optional(),
});

export const oauthCredentialsBodySchema = z.object({
  grants: z.literal("client_credentials"),
  scopes: z.string().optional(),
  redirectUris: z.string().optional(),
});

export type SigninBody = z.infer<typeof signinBodySchema>;
export type SignupBody = z.infer<typeof signupBodySchema>;
export type PasswordResetRequestBody = z.infer<typeof passwordResetRequestBodySchema>;
export type PasswordResetConfirmBody = z.infer<typeof passwordResetConfirmBodySchema>;
export type OauthTokenBody = z.infer<typeof oauthTokenBodySchema>;
export type OauthCredentialsBody = z.infer<typeof oauthCredentialsBodySchema>;
