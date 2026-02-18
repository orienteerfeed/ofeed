import { API_DEFAULTS } from "../../constants/index.js";
import { multipartBody, okJson } from "../../config/openapi.helpers";
import type { OpenApiOperation, OpenApiPathItem } from "../../config/openapi.types";

export const UPLOAD_OPENAPI = {
  tag: "Upload",
  basePath: `${API_DEFAULTS.BASE_PATH}/upload`,
} as const;

const bearerOrBasicSecurity: NonNullable<OpenApiOperation["security"]> = [
  { BearerAuth: [] },
  { BasicAuth: [] },
];

const uploadBase = UPLOAD_OPENAPI.basePath;

export const UPLOAD_OPENAPI_PATHS: Record<string, OpenApiPathItem> = {
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
};
