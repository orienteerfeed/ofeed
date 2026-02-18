import { API_DEFAULTS } from "../../constants/index.js";
import {
  jsonBody,
  okJson,
  multipartBody,
  zodToOpenApiSchema,
} from "../../config/openapi.helpers";
import type { OpenApiOperation, OpenApiPathItem } from "../../config/openapi.types";
import {
  externalCompetitorUpdateBodySchema,
  generatePasswordBodySchema,
  stateChangeBodySchema,
} from "./event.schema.js";
import {
  createCompetitorSchema,
  updateCompetitorSchema,
} from "../../utils/validateCompetitor.js";
import eventWriteSchema from "../../utils/validateEvent.js";

export const EVENT_OPENAPI = {
  tag: "Events",
  basePath: `${API_DEFAULTS.BASE_PATH}/events`,
} as const;

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

const bearerOrBasicSecurity: NonNullable<OpenApiOperation["security"]> = [
  { BearerAuth: [] },
  { BasicAuth: [] },
];

const eventWriteBodySchema = zodToOpenApiSchema(eventWriteSchema);
const generatePasswordRequestBodySchema = zodToOpenApiSchema(
  generatePasswordBodySchema,
);
const competitorStatusChangeBodySchema = zodToOpenApiSchema(
  stateChangeBodySchema,
);
const competitorUpdateBodySchema = zodToOpenApiSchema(updateCompetitorSchema);
const competitorExternalUpdateRequestBodySchema = zodToOpenApiSchema(
  externalCompetitorUpdateBodySchema,
);
const createCompetitorBodySchema = {
  ...zodToOpenApiSchema(createCompetitorSchema),
  oneOf: [{ required: ["classId"] }, { required: ["classExternalId"] }],
};

const eventsBase = EVENT_OPENAPI.basePath;

export const EVENT_OPENAPI_PATHS: Record<string, OpenApiPathItem> = {
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
      requestBody: jsonBody(eventWriteBodySchema),
      responses: {
        200: okJson("Event created"),
        401: okJson("Unauthorized"),
        422: okJson("Validation error"),
        500: okJson("Internal server error"),
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
      requestBody: jsonBody(eventWriteBodySchema),
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
      requestBody: jsonBody(generatePasswordRequestBodySchema),
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
      requestBody: jsonBody(generatePasswordRequestBodySchema),
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
        {
          name: "class",
          in: "query",
          required: false,
          schema: { type: "integer" },
        },
        {
          name: "lastUpdate",
          in: "query",
          required: false,
          schema: { type: "string", format: "date-time" },
        },
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
      requestBody: jsonBody(createCompetitorBodySchema),
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
      requestBody: jsonBody(competitorUpdateBodySchema),
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
      requestBody: jsonBody(competitorStatusChangeBodySchema),
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
      requestBody: jsonBody(competitorExternalUpdateRequestBodySchema),
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
        {
          name: "since",
          in: "query",
          required: false,
          schema: { type: "string", format: "date-time" },
        },
        {
          name: "origin",
          in: "query",
          required: false,
          schema: {
            type: "string",
            enum: ["START", "FINISH", "IT", "OFFICE"],
          },
        },
        {
          name: "group",
          in: "query",
          required: false,
          schema: { type: "boolean" },
        },
        {
          name: "classId",
          in: "query",
          required: false,
          schema: { type: "integer" },
        },
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
};
