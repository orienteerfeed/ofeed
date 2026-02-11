import { z } from "zod";

import { dateLikeSchema } from "./common";

export const oAuthClientSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  clientSecret: z.string(),
  createdAt: dateLikeSchema,
  userId: z.number().int(),
});

export const oAuthGrantSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  grantType: z.string(),
});

export const oAuthScopeSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  scope: z.string(),
});

export const oAuthRedirectUriSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  uri: z.string(),
});

export const oAuthAccessTokenSchema = z.object({
  id: z.string(),
  token: z.string(),
  clientId: z.string(),
  userId: z.number().int().nullable().optional(),
  expiresAt: dateLikeSchema,
});

export const oAuthAuthorizationCodeSchema = z.object({
  id: z.string(),
  code: z.string(),
  clientId: z.string(),
  userId: z.number().int().nullable().optional(),
  expiresAt: dateLikeSchema,
  redirectUri: z.string(),
});

export const oAuthRefreshTokenSchema = z.object({
  id: z.string(),
  token: z.string(),
  clientId: z.string(),
  userId: z.number().int().nullable().optional(),
  expiresAt: dateLikeSchema,
});

export const oauthTokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number().int(),
  scope: z.string().optional(),
});

export type OAuthClient = z.infer<typeof oAuthClientSchema>;
export type OAuthGrant = z.infer<typeof oAuthGrantSchema>;
export type OAuthScope = z.infer<typeof oAuthScopeSchema>;
export type OAuthRedirectUri = z.infer<typeof oAuthRedirectUriSchema>;
export type OAuthAccessToken = z.infer<typeof oAuthAccessTokenSchema>;
export type OAuthAuthorizationCode = z.infer<typeof oAuthAuthorizationCodeSchema>;
export type OAuthRefreshToken = z.infer<typeof oAuthRefreshTokenSchema>;
export type OAuthTokenResponse = z.infer<typeof oauthTokenResponseSchema>;
