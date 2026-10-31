import { sessionCredentialSchema } from '@repo/shared';
import { API_DEFAULTS } from '../../constants/index.js';
import { jsonBody, okJson, zodToOpenApiSchema } from '../../config/openapi.helpers.js';
import type { OpenApiOperation, OpenApiPathItem } from '../../config/openapi.types.js';
import {
  emailVerificationBodySchema,
  oauthCredentialsBodySchema,
  passwordResetConfirmBodySchema,
  passwordResetRequestBodySchema,
  signinBodySchema,
  signupBodySchema,
} from './auth.schema.js';

export const AUTH_OPENAPI = {
  tag: 'Auth',
  basePath: `${API_DEFAULTS.BASE_PATH}/auth`,
} as const;

const bearerSecurity: NonNullable<OpenApiOperation['security']> = [{ BearerAuth: [] }];

const signinRequestBodySchema = zodToOpenApiSchema(signinBodySchema);
const signupRequestBodySchema = zodToOpenApiSchema(signupBodySchema);
const passwordResetRequestRequestBodySchema = zodToOpenApiSchema(passwordResetRequestBodySchema);
const passwordResetConfirmRequestBodySchema = zodToOpenApiSchema(passwordResetConfirmBodySchema);
const emailVerificationRequestBodySchema = zodToOpenApiSchema(emailVerificationBodySchema);
const oauthCredentialsRequestBodySchema = zodToOpenApiSchema(oauthCredentialsBodySchema);

const authBase = AUTH_OPENAPI.basePath;

const ssoProviderParam = {
  name: 'provider',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, enum: ['oris'] },
};

export const AUTH_OPENAPI_PATHS: Record<string, OpenApiPathItem> = {
  [`${authBase}/signin`]: {
    post: {
      tags: [AUTH_OPENAPI.tag],
      operationId: 'authSignin',
      summary: 'Sign in to a device session',
      description:
        'Requires device metadata. Returns a 900-second ES256 access token and an opaque rotating refresh token (30-day sliding, 90-day absolute expiry). Existing legacy user JWTs are no longer accepted.',
      security: [],
      requestBody: jsonBody(signinRequestBodySchema),
      responses: {
        200: okJson('User signed in'),
        401: okJson('Invalid credentials'),
        422: okJson('Validation error'),
      },
    },
  },
  [`${authBase}/refresh`]: {
    post: {
      tags: [AUTH_OPENAPI.tag],
      operationId: 'authRefresh',
      summary: 'Rotate a device refresh token',
      security: [],
      description:
        'Native: refreshToken + deviceId in JSON, new pair in results.data. Browser: HttpOnly ofeed-refresh cookie + deviceId, X-Ofeed-Session: web and allowed Origin; refreshToken omitted from response. Every consumed-token replay revokes its family, including retries after lost responses.',
      requestBody: jsonBody(zodToOpenApiSchema(sessionCredentialSchema)),
      responses: {
        200: okJson('Rotated credentials in results.data; expiresIn is 900'),
        401: okJson('Expired, revoked or invalid credentials'),
        403: okJson('Rejected browser origin or headers'),
        422: okJson('Invalid or ambiguous credentials'),
      },
    },
  },
  [`${authBase}/logout`]: {
    post: {
      tags: [AUTH_OPENAPI.tag],
      operationId: 'authLogout',
      summary: 'Revoke the current refresh family',
      security: [],
      description:
        'Uses the same cookie/body credential transport as refresh. Does not require an unexpired access JWT. Idempotent; access tokens expire within 15 minutes.',
      requestBody: jsonBody(zodToOpenApiSchema(sessionCredentialSchema)),
      responses: {
        200: okJson('Family revoked; browser cookie cleared'),
        403: okJson('Rejected browser origin or headers'),
        422: okJson('Invalid or ambiguous credentials'),
      },
    },
  },
  [`${authBase}/signup`]: {
    post: {
      tags: [AUTH_OPENAPI.tag],
      operationId: 'authSignup',
      summary: 'Sign up',
      security: [],
      requestBody: jsonBody(signupRequestBodySchema),
      responses: {
        200: okJson('User created'),
        422: okJson('Validation error'),
      },
    },
  },
  [`${authBase}/verify-email`]: {
    post: {
      tags: [AUTH_OPENAPI.tag],
      operationId: 'authVerifyEmail',
      summary: 'Verify email address from email link',
      security: [],
      requestBody: jsonBody(emailVerificationRequestBodySchema),
      responses: {
        200: okJson('Email verified'),
        422: okJson('Validation error'),
      },
    },
  },
  [`${authBase}/request-password-reset`]: {
    post: {
      tags: [AUTH_OPENAPI.tag],
      operationId: 'authRequestPasswordReset',
      summary: 'Request password reset',
      security: [],
      requestBody: jsonBody(passwordResetRequestRequestBodySchema),
      responses: {
        200: okJson('Password reset requested'),
        422: okJson('Validation error'),
      },
    },
  },
  [`${authBase}/reset-password`]: {
    post: {
      tags: [AUTH_OPENAPI.tag],
      operationId: 'authResetPassword',
      summary: 'Reset password',
      security: [],
      requestBody: jsonBody(passwordResetConfirmRequestBodySchema),
      responses: {
        200: okJson('Password reset completed'),
        422: okJson('Validation error'),
      },
    },
  },
  [`${authBase}/oauth2/token`]: {
    post: {
      tags: [AUTH_OPENAPI.tag],
      operationId: 'authOAuth2Token',
      summary: 'OAuth2 client credentials token',
      security: [{ BasicAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/x-www-form-urlencoded': {
            schema: {
              type: 'object',
              properties: {
                grant_type: { type: 'string', enum: ['client_credentials'] },
                scope: { type: 'string' },
              },
              required: ['grant_type'],
            },
          },
        },
      },
      responses: {
        200: okJson('OAuth2 access token', 'oauth-token'),
        400: okJson('Invalid request', 'oauth-error'),
        401: okJson('Invalid client credentials', 'oauth-error'),
      },
    },
  },
  [`${authBase}/oauth2-credentials`]: {
    get: {
      tags: [AUTH_OPENAPI.tag],
      operationId: 'authGetOAuth2Credentials',
      summary: 'Get OAuth2 credentials',
      security: bearerSecurity,
      responses: {
        200: okJson('OAuth2 client identifier', 'legacy-no-meta'),
        401: okJson('Unauthorized', 'legacy-no-meta'),
      },
    },
  },
  [`${authBase}/revoke-oauth2-credentials`]: {
    delete: {
      tags: [AUTH_OPENAPI.tag],
      operationId: 'authRevokeOAuth2Credentials',
      summary: 'Revoke OAuth2 credentials',
      security: bearerSecurity,
      responses: {
        200: okJson('OAuth2 credentials revoked', 'legacy-no-meta'),
        401: okJson('Unauthorized', 'legacy-no-meta'),
      },
    },
  },
  [`${authBase}/generate-oauth2-credentials`]: {
    post: {
      tags: [AUTH_OPENAPI.tag],
      operationId: 'authGenerateOAuth2Credentials',
      summary: 'Generate OAuth2 credentials',
      security: bearerSecurity,
      requestBody: jsonBody(oauthCredentialsRequestBodySchema),
      responses: {
        200: okJson('OAuth2 credentials generated', 'legacy-no-meta'),
        401: okJson('Unauthorized', 'legacy-no-meta'),
        422: okJson('Validation error', 'legacy-no-meta'),
      },
    },
  },
  [`${authBase}/sso/providers`]: {
    get: {
      tags: [AUTH_OPENAPI.tag],
      operationId: 'authSsoProviders',
      summary: 'List enabled external sign-in providers',
      description:
        'results.data.providers lists provider slugs (e.g. "oris"). A provider is listed only when it is enabled and its client credentials are configured.',
      security: [],
      responses: { 200: okJson('Enabled provider slugs') },
    },
  },
  [`${authBase}/sso/identities`]: {
    get: {
      tags: [AUTH_OPENAPI.tag],
      operationId: 'authSsoIdentities',
      summary: 'List external identities linked to the current user',
      security: bearerSecurity,
      responses: { 200: okJson('Linked identities'), 401: okJson('Unauthorized') },
    },
  },
  [`${authBase}/sso/{provider}/start`]: {
    get: {
      tags: [AUTH_OPENAPI.tag],
      operationId: 'authSsoStart',
      summary: 'Start external sign-in',
      description:
        'Sets a signed, single-use, 10-minute HttpOnly state cookie and returns results.data.authorizeUrl; the browser then navigates there. Call with credentials included. mode=link links the provider to the bearer user instead of signing in.',
      security: [],
      parameters: [
        ssoProviderParam,
        {
          name: 'deviceId',
          in: 'query' as const,
          required: true,
          schema: { type: 'string' as const, format: 'uuid' },
        },
        {
          name: 'deviceName',
          in: 'query' as const,
          required: true,
          schema: { type: 'string' as const, minLength: 1, maxLength: 100 },
        },
        {
          name: 'mode',
          in: 'query' as const,
          required: false,
          schema: { type: 'string' as const, enum: ['login', 'link'], default: 'login' },
          description: 'link requires a bearer access token',
        },
      ],
      responses: {
        200: okJson('Provider authorize URL'),
        401: okJson('Bearer token missing for link mode'),
        404: okJson('Provider unknown or disabled'),
        422: okJson('Validation error'),
      },
    },
  },
  [`${authBase}/sso/{provider}/callback`]: {
    get: {
      tags: [AUTH_OPENAPI.tag],
      operationId: 'authSsoCallback',
      summary: 'External sign-in redirect target',
      description:
        'Registered at the provider. Validates the state cookie, verifies the identity server-side and redirects (302) to CLIENT_APP_URL/auth/sso/callback?status=ok|error&mode=login|link&reason=<code>. On sign-in it sets the ofeed-refresh cookie; tokens never appear in URLs.',
      security: [],
      parameters: [ssoProviderParam],
      responses: {
        302: { description: 'Redirect to the client callback page' },
        404: okJson('Provider unknown or disabled'),
      },
    },
  },
  [`${authBase}/sso/{provider}/link`]: {
    delete: {
      tags: [AUTH_OPENAPI.tag],
      operationId: 'authSsoUnlink',
      summary: 'Unlink an external identity from the current user',
      security: bearerSecurity,
      parameters: [ssoProviderParam],
      responses: {
        200: okJson('Identity unlinked'),
        401: okJson('Unauthorized'),
        404: okJson('Provider unknown or disabled'),
        409: okJson('last_sign_in_method: the account has no password and no other identity'),
      },
    },
  },
};
