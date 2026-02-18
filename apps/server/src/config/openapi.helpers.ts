import { z } from "@hono/zod-openapi";

type JsonResponseMode =
  | "legacy-with-meta"
  | "legacy-no-meta"
  | "object"
  | "oauth-token"
  | "oauth-error";

export const unknownObjectSchema = {
  type: "object",
  properties: {},
} as const;

const responseMetaSchema = {
  type: "object",
  required: ["requestId", "timestamp"],
  properties: {
    requestId: { type: "string" },
    timestamp: { type: "string", format: "date-time" },
  },
} as const;

const legacyResultsSchema = {
  type: "object",
  properties: {
    data: unknownObjectSchema,
    message: { type: "string" },
  },
} as const;

const legacyResponseSchema = {
  type: "object",
  required: ["message", "error", "code"],
  properties: {
    message: { type: "string" },
    error: { type: "boolean" },
    code: { type: "integer" },
    results: legacyResultsSchema,
    errors: unknownObjectSchema,
  },
} as const;

const legacyResponseWithMetaSchema = {
  type: "object",
  required: ["message", "error", "code", "meta"],
  properties: {
    message: { type: "string" },
    error: { type: "boolean" },
    code: { type: "integer" },
    results: legacyResultsSchema,
    errors: unknownObjectSchema,
    meta: responseMetaSchema,
  },
} as const;

const oauthTokenSchema = {
  type: "object",
  required: ["access_token", "token_type", "expires_in"],
  properties: {
    access_token: { type: "string" },
    token_type: { type: "string", enum: ["Bearer"] },
    expires_in: { type: "integer" },
    scope: { type: "string" },
  },
} as const;

const oauthErrorSchema = {
  type: "object",
  properties: {
    error: { type: "string" },
    error_description: { type: "string" },
    message: { type: "string" },
    code: { type: "integer" },
  },
} as const;

function resolveJsonSchema(mode: JsonResponseMode) {
  switch (mode) {
    case "object":
      return unknownObjectSchema;
    case "oauth-token":
      return oauthTokenSchema;
    case "oauth-error":
      return oauthErrorSchema;
    case "legacy-no-meta":
      return legacyResponseSchema;
    case "legacy-with-meta":
    default:
      return legacyResponseWithMetaSchema;
  }
}

export const okJson = (
  description: string,
  mode: JsonResponseMode = "legacy-with-meta",
) => ({
  description,
  content: {
    "application/json": {
      schema: resolveJsonSchema(mode),
    },
  },
});

export const okText = (description: string) => ({
  description,
  content: {
    "text/plain": {
      schema: { type: "string" as const },
    },
  },
});

export const jsonBody = (schema: unknown = unknownObjectSchema) => ({
  required: true,
  content: {
    "application/json": {
      schema: schema as never,
    },
  },
});

export const multipartBody = (schema: Record<string, unknown>) => ({
  required: true,
  content: {
    "multipart/form-data": {
      schema,
    },
  },
});

export const zodToOpenApiSchema = (
  schema: z.ZodTypeAny,
): Record<string, unknown> => {
  return JSON.parse(
    JSON.stringify(
      z.toJSONSchema(schema, {
        target: "openapi-3.0",
        io: "input",
        unrepresentable: "any",
      }),
    ),
  );
};
