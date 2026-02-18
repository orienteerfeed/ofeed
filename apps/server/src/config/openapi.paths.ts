import {
  AUTH_OPENAPI,
  AUTH_OPENAPI_PATHS,
} from "../modules/auth/auth.openapi";
import {
  EVENT_OPENAPI,
  EVENT_OPENAPI_PATHS,
} from "../modules/event/event.openapi";
import {
  GRAPHQL_OPENAPI,
  GRAPHQL_OPENAPI_PATHS,
} from "../modules/graphql/graphql.openapi";
import {
  UPLOAD_OPENAPI,
  UPLOAD_OPENAPI_PATHS,
} from "../modules/upload/upload.openapi";
import {
  USER_OPENAPI,
  USER_OPENAPI_PATHS,
} from "../modules/user/user.openapi";
import { okJson, okText } from "./openapi.helpers";
import type { OpenApiPathItem } from "./openapi.types";

export const OPENAPI_TAGS = [
  { name: "Index", description: "Service meta endpoints" },
  { name: "Health", description: "Health and readiness endpoints" },
  { name: "Monitoring", description: "Monitoring and metrics endpoints" },
  { name: GRAPHQL_OPENAPI.tag, description: "GraphQL HTTP endpoint" },
  { name: AUTH_OPENAPI.tag, description: "Authentication and OAuth2 endpoints" },
  {
    name: EVENT_OPENAPI.tag,
    description: "Events and competitor management endpoints",
  },
  { name: UPLOAD_OPENAPI.tag, description: "Upload and import endpoints" },
  { name: USER_OPENAPI.tag, description: "User scoped endpoints" },
] as const;

export const OPENAPI_PATHS: Record<string, OpenApiPathItem> = {
  "/doc": {
    get: {
      tags: ["Index"],
      operationId: "openapiDoc",
      summary: "OpenAPI JSON document",
      security: [],
      responses: {
        200: okJson("OpenAPI document", "object"),
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
  ...GRAPHQL_OPENAPI_PATHS,
  ...AUTH_OPENAPI_PATHS,
  ...EVENT_OPENAPI_PATHS,
  ...UPLOAD_OPENAPI_PATHS,
  ...USER_OPENAPI_PATHS,
};
