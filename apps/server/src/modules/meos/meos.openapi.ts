import { API_DEFAULTS } from "../../constants/index.js";
import type { OpenApiPathItem } from "../../config/openapi.types";

export const MEOS_OPENAPI = {
  tag: "MeOS",
  basePath: `${API_DEFAULTS.BASE_PATH}/meos`,
} as const;

const meosBase = MEOS_OPENAPI.basePath;

export const MEOS_OPENAPI_PATHS: Record<string, OpenApiPathItem> = {
  [`${meosBase}/mop`]: {
    post: {
      tags: [MEOS_OPENAPI.tag],
      operationId: "meosMopIngest",
      summary: "Ingest MeOS Online Protocol XML payload",
      security: [],
      parameters: [
        {
          in: "header",
          name: "competition",
          required: true,
          schema: { type: "integer" },
          description: "Generated MeOS competition ID mapped to OFeed event ID.",
        },
        {
          in: "header",
          name: "pwd",
          required: true,
          schema: { type: "string" },
          description: "Event password generated in OFeed.",
        },
      ],
      requestBody: {
        required: true,
        content: {
          "text/plain": {
            schema: { type: "string" },
          },
          "application/xml": {
            schema: { type: "string" },
          },
          "application/zip": {
            schema: { type: "string", format: "binary" },
          },
          "application/octet-stream": {
            schema: { type: "string", format: "binary" },
          },
        },
      },
      responses: {
        200: {
          description: "MOP processing status response",
          content: {
            "application/xml": {
              schema: { type: "string" },
              example: "<?xml version=\"1.0\" encoding=\"UTF-8\"?><MOPStatus status=\"OK\"></MOPStatus>",
            },
          },
        },
      },
    },
  },
};
