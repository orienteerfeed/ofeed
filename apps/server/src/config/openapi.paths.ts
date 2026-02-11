import type { RouteConfig } from "@hono/zod-openapi";

import { AUTH_OPENAPI } from "../modules/auth/auth.openapi";
import { EVENT_OPENAPI } from "../modules/event/event.openapi";
import { GRAPHQL_OPENAPI } from "../modules/graphql/graphql.openapi";
import { UPLOAD_OPENAPI } from "../modules/upload/upload.openapi";
import { USER_OPENAPI } from "../modules/user/user.openapi";

type OpenApiMethod = RouteConfig["method"];

type OpenApiOperation = Omit<RouteConfig, "method" | "path">;

export type OpenApiPathItem = Partial<Record<OpenApiMethod, OpenApiOperation>>;

const anyJsonSchema = {
  type: "object",
  additionalProperties: true,
} as const;

const okJson = (description: string) => ({
  description,
  content: {
    "application/json": {
      schema: anyJsonSchema,
    },
  },
});

const okText = (description: string) => ({
  description,
  content: {
    "text/plain": {
      schema: { type: "string" },
    },
  },
});

const jsonBody = {
  required: true,
  content: {
    "application/json": {
      schema: anyJsonSchema,
    },
  },
} as const;

const multipartBody = (schema: Record<string, unknown>) => ({
  required: true,
  content: {
    "multipart/form-data": {
      schema,
    },
  },
});

const eventIdParam = {
  name: "eventId",
  in: "path",
  required: true,
  schema: { type: "string" },
} as const;

const competitorIdParam = {
  name: "competitorId",
  in: "path",
  required: true,
  schema: { type: "integer" },
} as const;

const competitorExternalIdParam = {
  name: "competitorExternalId",
  in: "path",
  required: true,
  schema: { type: "string" },
} as const;

const bearerSecurity = [{ BearerAuth: [] }] as const;
const bearerOrBasicSecurity = [{ BearerAuth: [] }, { BasicAuth: [] }] as const;

const authBase = AUTH_OPENAPI.basePath;
const eventsBase = EVENT_OPENAPI.basePath;
const uploadBase = UPLOAD_OPENAPI.basePath;
const userBase = USER_OPENAPI.basePath;

export const OPENAPI_TAGS = [
  { name: "Index", description: "Service meta endpoints" },
  { name: "Health", description: "Health and readiness endpoints" },
  { name: "Monitoring", description: "Monitoring and metrics endpoints" },
  { name: GRAPHQL_OPENAPI.tag, description: "GraphQL HTTP endpoint" },
  { name: AUTH_OPENAPI.tag, description: "Authentication and OAuth2 endpoints" },
  { name: EVENT_OPENAPI.tag, description: "Events and competitor management endpoints" },
  { name: UPLOAD_OPENAPI.tag, description: "Upload and import endpoints" },
  { name: USER_OPENAPI.tag, description: "User scoped endpoints" },
] as const;

export const OPENAPI_PATHS: Record<string, OpenApiPathItem> = {
  "/": {
    get: {
      tags: ["Index"],
      operationId: "indexRoot",
      summary: "Root endpoint",
      security: [],
      responses: {
        200: okText("Service root"),
      },
    },
  },
  "/readyz": {
    get: {
      tags: ["Health"],
      operationId: "indexReadyz",
      summary: "Legacy readiness endpoint",
      security: [],
      responses: {
        200: okText("Service ready"),
      },
    },
  },
  "/version": {
    get: {
      tags: ["Index"],
      operationId: "indexVersion",
      summary: "Application version",
      security: [],
      responses: {
        200: okJson("Version payload"),
      },
    },
  },
  "/health/live": {
    get: {
      tags: ["Health"],
      operationId: "healthLive",
      summary: "Liveness probe",
      security: [],
      responses: {
        200: okJson("Service is alive"),
      },
    },
  },
  "/health/ready": {
    get: {
      tags: ["Health"],
      operationId: "healthReady",
      summary: "Readiness probe",
      security: [],
      responses: {
        200: okJson("Service is ready"),
        503: okJson("Service is not ready"),
      },
    },
  },
  "/health": {
    get: {
      tags: ["Health"],
      operationId: "healthOverall",
      summary: "Full health check",
      security: [],
      responses: {
        200: okJson("Service is healthy"),
        503: okJson("Service is unhealthy"),
      },
    },
  },
  "/metrics": {
    get: {
      tags: ["Monitoring"],
      operationId: "metricsGet",
      summary: "Get Prometheus metrics",
      security: [],
      responses: {
        200: okText("Prometheus metrics"),
      },
    },
  },
  "/doc": {
    get: {
      tags: ["Index"],
      operationId: "openapiDoc",
      summary: "OpenAPI JSON document",
      security: [],
      responses: {
        200: okJson("OpenAPI document"),
      },
    },
  },
  "/reference": {
    get: {
      tags: ["Index"],
      operationId: "openapiReference",
      summary: "API reference UI",
      security: [],
      responses: {
        200: okText("Scalar API reference"),
      },
    },
  },

  [GRAPHQL_OPENAPI.path]: {
    get: {
      tags: [GRAPHQL_OPENAPI.tag],
      operationId: "graphqlGet",
      summary: "GraphQL endpoint (GET)",
      description: "GraphQL endpoint for queries",
      security: [],
      responses: {
        200: okJson("GraphQL response"),
      },
    },
    post: {
      tags: [GRAPHQL_OPENAPI.tag],
      operationId: "graphqlPost",
      summary: "GraphQL endpoint (POST)",
      description: "GraphQL endpoint for queries and mutations",
      security: [],
      requestBody: jsonBody,
      responses: {
        200: okJson("GraphQL response"),
      },
    },
    options: {
      tags: [GRAPHQL_OPENAPI.tag],
      operationId: "graphqlOptions",
      summary: "GraphQL CORS preflight",
      description: "CORS preflight for GraphQL endpoint",
      security: [],
      responses: {
        200: okText("CORS preflight response"),
      },
    },
  },

  [`${authBase}/signin`]: {
    post: {
      tags: [AUTH_OPENAPI.tag],
      operationId: "authSignin",
      summary: "Sign in",
      security: [],
      requestBody: jsonBody,
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
      requestBody: jsonBody,
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
      requestBody: jsonBody,
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
      requestBody: jsonBody,
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
        200: okJson("OAuth2 access token"),
        400: okJson("Invalid request"),
        401: okJson("Invalid client credentials"),
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
        200: okJson("OAuth2 client identifier"),
        401: okJson("Unauthorized"),
      },
    },
  },
  [`${authBase}/generate-oauth2-credentials`]: {
    post: {
      tags: [AUTH_OPENAPI.tag],
      operationId: "authGenerateOAuth2Credentials",
      summary: "Generate OAuth2 credentials",
      security: bearerSecurity,
      requestBody: jsonBody,
      responses: {
        200: okJson("OAuth2 credentials generated"),
        401: okJson("Unauthorized"),
        422: okJson("Validation error"),
      },
    },
  },

  [eventsBase]: {
    get: {
      tags: [EVENT_OPENAPI.tag],
      operationId: "eventListPublic",
      summary: "List public events",
      security: [],
      responses: {
        200: okJson("Published events"),
      },
    },
    post: {
      tags: [EVENT_OPENAPI.tag],
      operationId: "eventCreate",
      summary: "Create event",
      security: bearerOrBasicSecurity,
      requestBody: jsonBody,
      responses: {
        200: okJson("Event created"),
        401: okJson("Unauthorized"),
        422: okJson("Validation error"),
      },
    },
  },
  [`${eventsBase}/{eventId}`]: {
    get: {
      tags: [EVENT_OPENAPI.tag],
      operationId: "eventDetailPublic",
      summary: "Get event detail",
      security: [],
      parameters: [eventIdParam],
      responses: {
        200: okJson("Event detail"),
        422: okJson("Validation error"),
      },
    },
    put: {
      tags: [EVENT_OPENAPI.tag],
      operationId: "eventUpdate",
      summary: "Update event",
      security: bearerOrBasicSecurity,
      parameters: [eventIdParam],
      requestBody: jsonBody,
      responses: {
        200: okJson("Event updated"),
        401: okJson("Unauthorized"),
        403: okJson("Forbidden"),
        404: okJson("Event not found"),
        422: okJson("Validation error"),
      },
    },
    delete: {
      tags: [EVENT_OPENAPI.tag],
      operationId: "eventDelete",
      summary: "Delete event",
      security: bearerOrBasicSecurity,
      parameters: [eventIdParam],
      responses: {
        200: okJson("Event deleted"),
        401: okJson("Unauthorized"),
        403: okJson("Forbidden"),
        404: okJson("Event not found"),
      },
    },
  },
  [`${eventsBase}/{eventId}/image`]: {
    get: {
      tags: [EVENT_OPENAPI.tag],
      operationId: "eventImagePublic",
      summary: "Get event featured image",
      security: [],
      parameters: [eventIdParam],
      responses: {
        200: {
          description: "Image stream",
          content: {
            "image/jpeg": { schema: { type: "string", format: "binary" } },
            "image/png": { schema: { type: "string", format: "binary" } },
            "image/webp": { schema: { type: "string", format: "binary" } },
          },
        },
        404: okJson("Image not found"),
      },
    },
    post: {
      tags: [EVENT_OPENAPI.tag],
      operationId: "eventImageUpload",
      summary: "Upload event featured image",
      security: bearerOrBasicSecurity,
      parameters: [eventIdParam],
      requestBody: multipartBody({
        type: "object",
        required: ["file"],
        properties: {
          file: { type: "string", format: "binary" },
        },
      }),
      responses: {
        200: okJson("Image uploaded"),
        401: okJson("Unauthorized"),
        403: okJson("Forbidden"),
        404: okJson("Event not found"),
        422: okJson("Validation error"),
      },
    },
  },
  [`${eventsBase}/{eventId}/ranking`]: {
    post: {
      tags: [EVENT_OPENAPI.tag],
      operationId: "eventRankingRecalculate",
      summary: "Recalculate ranking for event",
      security: [],
      parameters: [eventIdParam],
      responses: {
        200: okJson("Ranking recalculated"),
      },
    },
  },
  [`${eventsBase}/generate-password`]: {
    post: {
      tags: [EVENT_OPENAPI.tag],
      operationId: "eventGeneratePassword",
      summary: "Generate event password",
      security: bearerOrBasicSecurity,
      requestBody: jsonBody,
      responses: {
        200: okJson("Event password generated"),
        401: okJson("Unauthorized"),
        403: okJson("Forbidden"),
        404: okJson("Event not found"),
      },
    },
  },
  [`${eventsBase}/revoke-password`]: {
    post: {
      tags: [EVENT_OPENAPI.tag],
      operationId: "eventRevokePassword",
      summary: "Revoke event password",
      security: bearerOrBasicSecurity,
      requestBody: jsonBody,
      responses: {
        200: okJson("Event password revoked"),
        401: okJson("Unauthorized"),
        403: okJson("Forbidden"),
        404: okJson("Event not found"),
      },
    },
  },
  [`${eventsBase}/{eventId}/password`]: {
    get: {
      tags: [EVENT_OPENAPI.tag],
      operationId: "eventGetPassword",
      summary: "Get event password",
      security: bearerOrBasicSecurity,
      parameters: [eventIdParam],
      responses: {
        200: okJson("Event password"),
        401: okJson("Unauthorized"),
        403: okJson("Forbidden"),
        404: okJson("Event not found"),
      },
    },
  },
  [`${eventsBase}/{eventId}/competitors`]: {
    get: {
      tags: [EVENT_OPENAPI.tag],
      operationId: "eventListCompetitors",
      summary: "List event competitors",
      security: [],
      parameters: [
        eventIdParam,
        { name: "class", in: "query", required: false, schema: { type: "integer" } },
        { name: "lastUpdate", in: "query", required: false, schema: { type: "string", format: "date-time" } },
      ],
      responses: {
        200: okJson("Event competitors"),
        422: okJson("Validation error"),
      },
    },
    post: {
      tags: [EVENT_OPENAPI.tag],
      operationId: "eventCreateCompetitor",
      summary: "Create competitor",
      security: bearerOrBasicSecurity,
      parameters: [eventIdParam],
      requestBody: jsonBody,
      responses: {
        200: okJson("Competitor created"),
        401: okJson("Unauthorized"),
        403: okJson("Forbidden"),
        404: okJson("Event or class not found"),
        422: okJson("Validation error"),
      },
    },
    delete: {
      tags: [EVENT_OPENAPI.tag],
      operationId: "eventDeleteCompetitors",
      summary: "Delete all competitors in event",
      security: bearerOrBasicSecurity,
      parameters: [eventIdParam],
      responses: {
        200: okJson("Competitors deleted"),
        401: okJson("Unauthorized"),
        403: okJson("Forbidden"),
      },
    },
  },
  [`${eventsBase}/{eventId}/competitors/{competitorId}`]: {
    get: {
      tags: [EVENT_OPENAPI.tag],
      operationId: "eventGetCompetitorById",
      summary: "Get competitor detail by id",
      security: [],
      parameters: [eventIdParam, competitorIdParam],
      responses: {
        200: okJson("Competitor detail"),
        404: okJson("Competitor not found"),
      },
    },
    put: {
      tags: [EVENT_OPENAPI.tag],
      operationId: "eventUpdateCompetitorById",
      summary: "Update competitor by id",
      security: bearerOrBasicSecurity,
      parameters: [eventIdParam, competitorIdParam],
      requestBody: jsonBody,
      responses: {
        200: okJson("Competitor updated"),
        401: okJson("Unauthorized"),
        403: okJson("Forbidden"),
        422: okJson("Validation error"),
      },
    },
    delete: {
      tags: [EVENT_OPENAPI.tag],
      operationId: "eventDeleteCompetitorById",
      summary: "Delete competitor by id",
      security: bearerOrBasicSecurity,
      parameters: [eventIdParam, competitorIdParam],
      responses: {
        200: okJson("Competitor deleted"),
        401: okJson("Unauthorized"),
        403: okJson("Forbidden"),
        404: okJson("Competitor not found"),
      },
    },
  },
  [`${eventsBase}/{eventId}/competitors/{competitorId}/status-change`]: {
    post: {
      tags: [EVENT_OPENAPI.tag],
      operationId: "eventCompetitorStatusChange",
      summary: "Change competitor status",
      security: bearerOrBasicSecurity,
      parameters: [eventIdParam, competitorIdParam],
      requestBody: jsonBody,
      responses: {
        200: okJson("Competitor status changed"),
        401: okJson("Unauthorized"),
        403: okJson("Forbidden"),
        422: okJson("Validation error"),
      },
    },
  },
  [`${eventsBase}/{eventId}/competitors/{competitorExternalId}/external-id`]: {
    get: {
      tags: [EVENT_OPENAPI.tag],
      operationId: "eventGetCompetitorByExternalId",
      summary: "Get competitor detail by external id",
      security: [],
      parameters: [eventIdParam, competitorExternalIdParam],
      responses: {
        200: okJson("Competitor detail"),
        404: okJson("Competitor not found"),
      },
    },
    put: {
      tags: [EVENT_OPENAPI.tag],
      operationId: "eventUpdateCompetitorByExternalId",
      summary: "Update competitor by external id",
      security: bearerOrBasicSecurity,
      parameters: [eventIdParam, competitorExternalIdParam],
      requestBody: jsonBody,
      responses: {
        200: okJson("Competitor updated"),
        401: okJson("Unauthorized"),
        403: okJson("Forbidden"),
        404: okJson("Competitor not found"),
        422: okJson("Validation error"),
      },
    },
    delete: {
      tags: [EVENT_OPENAPI.tag],
      operationId: "eventDeleteCompetitorByExternalId",
      summary: "Delete competitor by external id",
      security: bearerOrBasicSecurity,
      parameters: [eventIdParam, competitorExternalIdParam],
      responses: {
        200: okJson("Competitor deleted"),
        401: okJson("Unauthorized"),
        403: okJson("Forbidden"),
        404: okJson("Competitor not found"),
      },
    },
  },
  [`${eventsBase}/{eventId}/changelog`]: {
    get: {
      tags: [EVENT_OPENAPI.tag],
      operationId: "eventChangelog",
      summary: "Get event changelog",
      security: bearerOrBasicSecurity,
      parameters: [
        eventIdParam,
        { name: "since", in: "query", required: false, schema: { type: "string", format: "date-time" } },
        { name: "origin", in: "query", required: false, schema: { type: "string", enum: ["START", "FINISH", "IT", "OFFICE"] } },
        { name: "group", in: "query", required: false, schema: { type: "boolean" } },
        { name: "classId", in: "query", required: false, schema: { type: "integer" } },
      ],
      responses: {
        200: okJson("Event changelog"),
        401: okJson("Unauthorized"),
        403: okJson("Forbidden"),
        422: okJson("Validation error"),
      },
    },
  },
  [`${eventsBase}/{eventId}/delete-data`]: {
    delete: {
      tags: [EVENT_OPENAPI.tag],
      operationId: "eventDeleteData",
      summary: "Delete all event-related data",
      security: bearerOrBasicSecurity,
      parameters: [eventIdParam],
      responses: {
        200: okJson("Event related data deleted"),
        401: okJson("Unauthorized"),
        403: okJson("Forbidden"),
        404: okJson("Event not found"),
      },
    },
  },

  [`${uploadBase}/iof`]: {
    post: {
      tags: [UPLOAD_OPENAPI.tag],
      operationId: "uploadIofXml",
      summary: "Upload IOF XML data",
      security: bearerOrBasicSecurity,
      requestBody: multipartBody({
        type: "object",
        properties: {
          eventId: { type: "string" },
          validateXml: { type: "boolean" },
          file: { type: "string", format: "binary" },
        },
        required: ["eventId", "file"],
      }),
      responses: {
        200: okJson("IOF XML imported"),
        401: okJson("Unauthorized"),
        403: okJson("Forbidden"),
        422: okJson("Validation error"),
      },
    },
  },
  [`${uploadBase}/czech-ranking`]: {
    post: {
      tags: [UPLOAD_OPENAPI.tag],
      operationId: "uploadCzechRankingCsv",
      summary: "Upload Czech ranking CSV",
      security: bearerOrBasicSecurity,
      requestBody: multipartBody({
        type: "object",
        properties: {
          file: { type: "string", format: "binary" },
        },
        required: ["file"],
      }),
      responses: {
        200: okJson("Czech ranking CSV imported"),
        401: okJson("Unauthorized"),
        422: okJson("Validation error"),
      },
    },
  },

  [userBase]: {
    get: {
      tags: [USER_OPENAPI.tag],
      operationId: "userMyEvents",
      summary: "Get my events",
      security: bearerSecurity,
      responses: {
        200: okJson("User events"),
        401: okJson("Unauthorized"),
      },
    },
  },
};
