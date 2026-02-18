import { API_DEFAULTS } from "../../constants/index.js";
import { jsonBody, okJson, zodToOpenApiSchema } from "../../config/openapi.helpers";
import type { OpenApiOperation, OpenApiPathItem } from "../../config/openapi.types";
import {
  oauthCredentialsBodySchema,
  passwordResetConfirmBodySchema,
  passwordResetRequestBodySchema,
  signinBodySchema,
  signupBodySchema,
} from "./auth.schema.js";

export const AUTH_OPENAPI = {
  tag: "Auth",
  basePath: `${API_DEFAULTS.BASE_PATH}/auth`,
} as const;

const bearerSecurity: NonNullable<OpenApiOperation["security"]> = [
  { BearerAuth: [] },
];

const signinRequestBodySchema = zodToOpenApiSchema(signinBodySchema);
const signupRequestBodySchema = zodToOpenApiSchema(signupBodySchema);
const passwordResetRequestRequestBodySchema = zodToOpenApiSchema(
  passwordResetRequestBodySchema,
);
const passwordResetConfirmRequestBodySchema = zodToOpenApiSchema(
  passwordResetConfirmBodySchema,
);
const oauthCredentialsRequestBodySchema = zodToOpenApiSchema(
  oauthCredentialsBodySchema,
);

const authBase = AUTH_OPENAPI.basePath;

export const AUTH_OPENAPI_PATHS: Record<string, OpenApiPathItem> = {
  [`${authBase}/signin`]: {
    post: {
      tags: [AUTH_OPENAPI.tag],
      operationId: "authSignin",
      summary: "Sign in",
      security: [],
      requestBody: jsonBody(signinRequestBodySchema),
      responses: {
        200: okJson("User signed in"),
        401: okJson("Invalid credentials"),
        422: okJson("Validation error"),
      },
    },
  },
  [`${authBase}/signup`]: {
    post: {
      tags: [AUTH_OPENAPI.tag],
      operationId: "authSignup",
      summary: "Sign up",
      security: [],
      requestBody: jsonBody(signupRequestBodySchema),
      responses: {
        200: okJson("User created"),
        422: okJson("Validation error"),
      },
    },
  },
  [`${authBase}/request-password-reset`]: {
    post: {
      tags: [AUTH_OPENAPI.tag],
      operationId: "authRequestPasswordReset",
      summary: "Request password reset",
      security: [],
      requestBody: jsonBody(passwordResetRequestRequestBodySchema),
      responses: {
        200: okJson("Password reset requested"),
        422: okJson("Validation error"),
      },
    },
  },
  [`${authBase}/reset-password`]: {
    post: {
      tags: [AUTH_OPENAPI.tag],
      operationId: "authResetPassword",
      summary: "Reset password",
      security: [],
      requestBody: jsonBody(passwordResetConfirmRequestBodySchema),
      responses: {
        200: okJson("Password reset completed"),
        422: okJson("Validation error"),
      },
    },
  },
  [`${authBase}/oauth2/token`]: {
    post: {
      tags: [AUTH_OPENAPI.tag],
      operationId: "authOAuth2Token",
      summary: "OAuth2 client credentials token",
      security: [{ BasicAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/x-www-form-urlencoded": {
            schema: {
              type: "object",
              properties: {
                grant_type: { type: "string", enum: ["client_credentials"] },
                scope: { type: "string" },
              },
              required: ["grant_type"],
            },
          },
        },
      },
      responses: {
        200: okJson("OAuth2 access token", "oauth-token"),
        400: okJson("Invalid request", "oauth-error"),
        401: okJson("Invalid client credentials", "oauth-error"),
      },
    },
  },
  [`${authBase}/oauth2-credentials`]: {
    get: {
      tags: [AUTH_OPENAPI.tag],
      operationId: "authGetOAuth2Credentials",
      summary: "Get OAuth2 credentials",
      security: bearerSecurity,
      responses: {
        200: okJson("OAuth2 client identifier", "legacy-no-meta"),
        401: okJson("Unauthorized", "legacy-no-meta"),
      },
    },
  },
  [`${authBase}/generate-oauth2-credentials`]: {
    post: {
      tags: [AUTH_OPENAPI.tag],
      operationId: "authGenerateOAuth2Credentials",
      summary: "Generate OAuth2 credentials",
      security: bearerSecurity,
      requestBody: jsonBody(oauthCredentialsRequestBodySchema),
      responses: {
        200: okJson("OAuth2 credentials generated", "legacy-no-meta"),
        401: okJson("Unauthorized", "legacy-no-meta"),
        422: okJson("Validation error", "legacy-no-meta"),
      },
    },
  },
};
