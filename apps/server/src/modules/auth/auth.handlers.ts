import crypto from "node:crypto";

import OAuth2Server from "@node-oauth/oauth2-server";
import { z } from "@hono/zod-openapi";
import argon2 from "argon2";

import type { Context } from "hono";

import type { AppBindings, AppOpenAPI } from "../../types";

import { AuthenticationError, ValidationError } from "../../exceptions/index.js";
import { getErrorDetails, logEndpoint } from "../../lib/http/endpoint-logger.js";
import { toLowerCaseHeaderRecord } from "../../lib/http/headers.js";
import { getJwtNumericUserId, requireJwtAuth } from "../../middlewares/require-jwt";
import prisma from "../../utils/context.js";
import { error as errorResponse, success as successResponse, validation as validationResponse } from "../../utils/responseApi.js";
import { generateRandomHex } from "../../utils/randomUtils.js";
import {
  authenticateUser,
  passwordResetConfirm,
  passwordResetRequest,
  signupUser,
} from "./auth.service.js";
import {
  oauthCredentialsBodySchema,
  passwordResetConfirmBodySchema,
  passwordResetRequestBodySchema,
  signinBodySchema,
  signupBodySchema,
} from "./auth.schema.js";
import { oauth2Model } from "./oauth2.model.js";

const OAuthRequest = OAuth2Server.Request;
const OAuthResponse = OAuth2Server.Response;

const oauth = new OAuth2Server({
  model: oauth2Model as OAuth2Server.ClientCredentialsModel &
    OAuth2Server.PasswordModel &
    OAuth2Server.RefreshTokenModel,
});

function formatZodError(error: z.ZodError) {
  return error.issues
    .map(issue => {
      const field = issue.path.length > 0 ? issue.path.join(".") : "body";
      return `${field}: ${issue.message}`;
    })
    .join(", ");
}

async function parseJsonBody<T extends z.ZodTypeAny>(
  c: Context<AppBindings>,
  schema: T,
): Promise<
  | { ok: true; data: z.infer<T> }
  | { ok: false; response: Response }
> {
  let payload: unknown;

  try {
    payload = await c.req.json();
  } catch {
    logEndpoint(c, "warn", "Auth request contains invalid JSON payload", {
      path: c.req.path,
    });
    return {
      ok: false,
      response: c.json(validationResponse("body: Invalid JSON payload"), 422),
    };
  }

  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    logEndpoint(c, "warn", "Auth request validation failed", {
      path: c.req.path,
      issues: formatZodError(parsed.error),
    });
    return {
      ok: false,
      response: c.json(validationResponse(formatZodError(parsed.error)), 422),
    };
  }

  return { ok: true, data: parsed.data };
}

function toQueryRecord(url: string) {
  const parsedUrl = new URL(url);
  const query: Record<string, string> = {};

  for (const [key, value] of parsedUrl.searchParams.entries()) {
    query[key] = value;
  }

  return query;
}

export function registerAuthRoutes(router: AppOpenAPI) {
  router.post("/signin", async c => {
    const parsedBody = await parseJsonBody(c, signinBodySchema);

    if (parsedBody.ok === false) {
      return parsedBody.response;
    }

    const { username, password } = parsedBody.data;

    try {
      const loginSuccessPayload = await authenticateUser(username, password);
      logEndpoint(c, "info", "User sign-in completed");
      return c.json(successResponse("OK", { data: loginSuccessPayload }, 200), 200);
    } catch (error) {
      if (error instanceof ValidationError) {
        logEndpoint(c, "warn", "User sign-in validation failed", getErrorDetails(error));
        return c.json(validationResponse(error.message), 422);
      }

      if (error instanceof AuthenticationError) {
        logEndpoint(c, "warn", "User sign-in rejected", getErrorDetails(error));
        return c.json(errorResponse(error.message, 401), 401);
      }

      logEndpoint(c, "error", "User sign-in failed", getErrorDetails(error));
      return c.json(errorResponse("Internal Server Error", 500), 500);
    }
  });

  router.post("/signup", async c => {
    const parsedBody = await parseJsonBody(c, signupBodySchema);

    if (parsedBody.ok === false) {
      return parsedBody.response;
    }

    const { firstname, lastname, email, password } = parsedBody.data;

    try {
      const signUpPayload = await signupUser(
        email,
        password,
        firstname,
        lastname,
        c.req.header("x-orienteerfeed-app-activate-user-url") ?? "localhost",
      );

      logEndpoint(c, "info", "User sign-up completed");

      return c.json(
        successResponse(
          "OK",
          { data: signUpPayload, message: "User successfuly created" },
          200,
        ),
        200,
      );
    } catch (error) {
      if (error instanceof ValidationError) {
        logEndpoint(c, "warn", "User sign-up validation failed", getErrorDetails(error));
        return c.json(errorResponse(error.message, 422), 422);
      }

      const message = error instanceof Error ? error.message : "Internal Server Error";
      logEndpoint(c, "error", "User sign-up failed", getErrorDetails(error));
      return c.json(errorResponse(message, 500), 500);
    }
  });

  router.post("/request-password-reset", async c => {
    const parsedBody = await parseJsonBody(c, passwordResetRequestBodySchema);

    if (parsedBody.ok === false) {
      return parsedBody.response;
    }

    const { email } = parsedBody.data;

    try {
      const passwordResetPayload = await passwordResetRequest(
        email,
        c.req.header("x-ofeed-app-reset-password-url") ?? "localhost",
      );

      logEndpoint(c, "info", "Password reset request completed");

      return c.json(
        successResponse(
          "OK",
          {
            data: passwordResetPayload,
            message: passwordResetPayload.message,
          },
          200,
        ),
        200,
      );
    } catch (error) {
      if (error instanceof ValidationError) {
        logEndpoint(c, "warn", "Password reset request validation failed", getErrorDetails(error));
        return c.json(errorResponse(error.message, 422), 422);
      }

      const message = error instanceof Error ? error.message : "Internal Server Error";
      logEndpoint(c, "error", "Password reset request failed", getErrorDetails(error));
      return c.json(errorResponse(message, 500), 500);
    }
  });

  router.post("/reset-password", async c => {
    const parsedBody = await parseJsonBody(c, passwordResetConfirmBodySchema);

    if (parsedBody.ok === false) {
      return parsedBody.response;
    }

    const { token, newPassword } = parsedBody.data;

    try {
      const passwordResetPayload = await passwordResetConfirm(token, newPassword);
      logEndpoint(c, "info", "Password reset confirm completed");

      return c.json(
        successResponse(
          "OK",
          {
            data: {
              token: passwordResetPayload.jwtToken,
              user: passwordResetPayload.user,
              message: "Password reset successful",
            },
            message: "Password reset successful",
          },
          200,
        ),
        200,
      );
    } catch (error) {
      if (error instanceof ValidationError) {
        logEndpoint(c, "warn", "Password reset confirm validation failed", getErrorDetails(error));
        return c.json(errorResponse(error.message, 422), 422);
      }

      const message = error instanceof Error ? error.message : "Internal Server Error";
      logEndpoint(c, "error", "Password reset confirm failed", getErrorDetails(error));
      return c.json(errorResponse(message, 500), 500);
    }
  });

  router.post("/oauth2/token", async c => {
    c.header("Content-Type", "application/json;charset=UTF-8");
    c.header("Cache-Control", "no-store");
    c.header("Pragma", "no-cache");

    const authHeader = c.req.header("authorization");

    if (!authHeader || !authHeader.startsWith("Basic ")) {
      logEndpoint(c, "warn", "OAuth2 token request missing valid authorization header");
      return c.json(
        {
          error: "invalid_request",
          error_description: "Missing or invalid authorization header",
        },
        400,
      );
    }

    const base64Credentials = authHeader.split(" ")[1];
    const credentials = Buffer.from(base64Credentials, "base64").toString("ascii");
    const [clientId, clientSecret] = credentials.split(":");

    if (!clientId || !clientSecret) {
      logEndpoint(c, "warn", "OAuth2 token request has invalid client credentials format");
      return c.json(
        {
          error: "invalid_client",
          error_description: "Invalid client credentials format",
        },
        400,
      );
    }

    const parsedBody = await c.req.parseBody();
    const grantType = typeof parsedBody.grant_type === "string" ? parsedBody.grant_type : undefined;
    const scope = typeof parsedBody.scope === "string" ? parsedBody.scope : undefined;

    if (!grantType || grantType !== "client_credentials") {
      logEndpoint(c, "warn", "OAuth2 token request has unsupported grant type");
      return c.json(
        {
          error: "invalid_grant",
          error_description: "Unsupported grant_type",
        },
        400,
      );
    }

    try {
      const requestedScopes = scope ? scope.split(" ") : [];
      const client = await oauth2Model.getClient(clientId, clientSecret);

      if (!client) {
        logEndpoint(c, "warn", "OAuth2 token request rejected: unknown client");
        return c.json(
          {
            error: "unauthorized_client",
            error_description: "Invalid client credentials",
          },
          401,
        );
      }

      if (!oauth2Model.validateRequestedScopes(requestedScopes, client.scopes)) {
        logEndpoint(c, "warn", "OAuth2 token request rejected: invalid scope");
        return c.json(
          {
            error: "invalid_scope",
            error_description: "Invalid scope requested",
          },
          400,
        );
      }

      const oauthRequest = new OAuthRequest({
        method: c.req.method,
        headers: toLowerCaseHeaderRecord(c.req.raw.headers),
        query: toQueryRecord(c.req.url),
        body: {
          grant_type: grantType,
          scope,
        },
      });

      const oauthResponse = new OAuthResponse();
      const token = await oauth.token(oauthRequest, oauthResponse);

      for (const [key, value] of Object.entries(oauthResponse.headers)) {
        c.header(key, String(value));
      }

      const accessTokenResponse = {
        access_token: token.accessToken,
        token_type: "Bearer",
        expires_in: Math.floor((token.accessTokenExpiresAt.getTime() - Date.now()) / 1000),
        scope,
      };

      logEndpoint(c, "info", "OAuth2 access token issued", {
        grantType,
      });

      return c.json(accessTokenResponse, 200);
    } catch (err) {
      const statusCode =
        typeof err === "object" && err !== null && "code" in err && typeof err.code === "number"
          ? err.code
          : 500;
      const message = err instanceof Error ? err.message : "Internal Server Error";

      logEndpoint(
        c,
        statusCode >= 500 ? "error" : "warn",
        "OAuth2 token request failed",
        {
          statusCode,
          ...getErrorDetails(err),
        },
      );

      return c.json(errorResponse(message, statusCode), statusCode);
    }
  });

  router.get("/oauth2-credentials", requireJwtAuth, async c => {
    const userId = getJwtNumericUserId(c) as number;

    try {
      const oAuth2Credentials = await prisma.oAuthClient.findFirst({
        where: { userId },
        select: { clientId: true },
      });

      logEndpoint(c, "info", "OAuth2 credentials retrieved");

      return c.json(
        successResponse(
          "OK",
          {
            data: { client_id: oAuth2Credentials?.clientId },
          },
          200,
        ),
        200,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Internal Server Error";
      logEndpoint(c, "error", "OAuth2 credentials lookup failed", getErrorDetails(error));
      return c.json(errorResponse(message, 500), 500);
    }
  });

  router.post("/generate-oauth2-credentials", requireJwtAuth, async c => {
    const userId = getJwtNumericUserId(c) as number;

    const parsedBody = await parseJsonBody(c, oauthCredentialsBodySchema);

    if (parsedBody.ok === false) {
      return parsedBody.response;
    }

    const { grants, redirectUris, scopes } = parsedBody.data;

    const grantArray = grants.split(",").map(grant => grant.trim());
    const redirectUriArray = redirectUris ? redirectUris.split(",").map(uri => uri.trim()) : [];
    const scopeArray = scopes ? scopes.split(",").map(scope => scope.trim()) : [];

    const clientId = generateRandomHex(32);
    const clientSecret = generateRandomHex(32);

    const salt = crypto.randomBytes(16);
    const hashedSecret = await argon2.hash(clientSecret, { salt });

    try {
      const clientData: Record<string, unknown> = {
        clientId,
        clientSecret: hashedSecret,
        userId,
        grants: {
          create: grantArray.map(grant => ({ grantType: grant })),
        },
      };

      if (redirectUriArray.length > 0) {
        clientData.redirectUris = {
          create: redirectUriArray.map(uri => ({ uri })),
        };
      }

      if (scopeArray.length > 0) {
        clientData.scopes = {
          create: scopeArray.map(scopeValue => ({ scope: scopeValue })),
        };
      }

      await prisma.oAuthClient.create({
        data: clientData as never,
      });

      logEndpoint(c, "info", "OAuth2 client credentials generated", {
        grants: grantArray,
        hasRedirectUris: redirectUriArray.length > 0,
        hasScopes: scopeArray.length > 0,
      });

      return c.json(
        successResponse(
          "OK",
          {
            data: {
              client_id: clientId,
              client_secret: clientSecret,
              redirect_uri: redirectUris,
            },
            message: "OAuth2 Client successfuly created",
          },
          200,
        ),
        200,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Internal Server Error";
      logEndpoint(c, "error", "OAuth2 client credential generation failed", getErrorDetails(error));
      return c.json(errorResponse(message, 500), 500);
    }
  });
}
