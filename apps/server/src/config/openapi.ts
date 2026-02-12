import { Scalar } from "@scalar/hono-api-reference";
import type { RouteConfig } from "@hono/zod-openapi";

import type { AppOpenAPI } from "../types";

import env from "./env";
import packageJson from "../../../../package.json" with { type: "json" };
import { OPENAPI_PATHS, OPENAPI_TAGS, type OpenApiPathItem } from "./openapi.paths";
import { OPENAPI_SECURITY_SCHEMES } from "./security";

export const OPENAPI_CONFIG = {
  title: env.OPENAPI_TITLE,
  version: packageJson.version ?? "1.0.0",
  docPath: env.OPENAPI_DOC_PATH,
  referencePath: env.OPENAPI_REFERENCE_PATH,
} as const;

function registerDocumentedRoutes(app: AppOpenAPI) {
  for (const [path, pathItem] of Object.entries(OPENAPI_PATHS)) {
    const entries = Object.entries(pathItem as OpenApiPathItem) as Array<
      [RouteConfig["method"], NonNullable<OpenApiPathItem[RouteConfig["method"]]>]
    >;

    for (const [method, operation] of entries) {
      app.openAPIRegistry.registerPath({
        method,
        path,
        ...operation,
      });
    }
  }
}

export function configureOpenAPI(app: AppOpenAPI) {
  const documentConfig = {
    openapi: "3.0.0",
    info: {
      title: OPENAPI_CONFIG.title,
      version: OPENAPI_CONFIG.version,
    },
    tags: [...OPENAPI_TAGS],
    components: {
      securitySchemes: OPENAPI_SECURITY_SCHEMES,
    },
    servers: [{ url: "" }],
  };

  app.doc(OPENAPI_CONFIG.docPath, documentConfig as never);

  // Register routes that are not declared via `router.openapi(...)`.
  registerDocumentedRoutes(app);

  app.get(
    OPENAPI_CONFIG.referencePath,
    Scalar({
      url: `${OPENAPI_CONFIG.docPath}?cache=${Date.now()}`,
      theme: "kepler",
      layout: "classic",
      defaultHttpClient: {
        targetKey: "js",
        clientKey: "fetch",
      },
    }),
  );
}
