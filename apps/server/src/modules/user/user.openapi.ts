import { API_DEFAULTS } from "../../constants/index.js";
import { okJson } from "../../config/openapi.helpers";
import type { OpenApiOperation, OpenApiPathItem } from "../../config/openapi.types";

export const USER_OPENAPI = {
  tag: "Users",
  basePath: `${API_DEFAULTS.BASE_PATH}/my-events`,
} as const;

const bearerSecurity: NonNullable<OpenApiOperation["security"]> = [
  { BearerAuth: [] },
];

export const USER_OPENAPI_PATHS: Record<string, OpenApiPathItem> = {
  [USER_OPENAPI.basePath]: {
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
