import { createRoute, z } from "@hono/zod-openapi";

import { HTTP_STATUS } from "../constants";
import { createRouter } from "../lib/create-app";
import { success } from "../utils/responseApi.js";
import packageJson from "../../../../package.json" with { type: "json" };

const rootResponseSchema = z.string();
const readyResponseSchema = z.string();

const versionResponseSchema = z.object({
  message: z.string(),
  error: z.literal(false),
  code: z.number().optional(),
  results: z.unknown().optional(),
});

const rootRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Index"],
  summary: "Root endpoint",
  responses: {
    [HTTP_STATUS.OK]: {
      description: "Server root response",
      content: {
        "text/plain": {
          schema: rootResponseSchema,
        },
      },
    },
  },
});

const readyRoute = createRoute({
  method: "get",
  path: "/readyz",
  tags: ["Health"],
  summary: "Legacy readiness endpoint",
  responses: {
    [HTTP_STATUS.OK]: {
      description: "Server is ready",
      content: {
        "text/plain": {
          schema: readyResponseSchema,
        },
      },
    },
  },
});

const versionRoute = createRoute({
  method: "get",
  path: "/version",
  tags: ["Index"],
  summary: "Application version",
  responses: {
    [HTTP_STATUS.OK]: {
      description: "Application version payload",
      content: {
        "application/json": {
          schema: versionResponseSchema,
        },
      },
    },
  },
});

const router = createRouter()
  .openapi(rootRoute, (c) => {
    return c.text("Hello World!", HTTP_STATUS.OK);
  })
  .openapi(readyRoute, (c) => {
    return c.text("OK", HTTP_STATUS.OK);
  })
  .openapi(versionRoute, (c) => {
    return c.json(success(`Version: ${packageJson.version}`), HTTP_STATUS.OK);
  });

export default router;
