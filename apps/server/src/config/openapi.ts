import type { RouteConfig } from '@hono/zod-openapi';

import type { AppOpenAPI } from '../types/index.js';

import env from './env.js';
import packageJson from '../../../../package.json' with { type: 'json' };
import { buildOpenApiReferenceHtml } from './openapi-reference.js';
import { OPENAPI_PATHS, OPENAPI_TAGS } from './openapi.paths.js';
import { buildOpenApiReferenceCSPHeaderValue, OPENAPI_SECURITY_SCHEMES } from './security.js';
import type { OpenApiPathItem } from './openapi.types.js';

export const OPENAPI_CONFIG = {
  title: env.OPENAPI_TITLE,
  version: packageJson.version ?? '1.0.0',
  docPath: env.OPENAPI_DOC_PATH,
  referencePath: env.OPENAPI_REFERENCE_PATH,
} as const;

function registerDocumentedRoutes(app: AppOpenAPI) {
  for (const [path, pathItem] of Object.entries(OPENAPI_PATHS)) {
    const entries = Object.entries(pathItem as OpenApiPathItem) as Array<
      [RouteConfig['method'], NonNullable<OpenApiPathItem[RouteConfig['method']]>]
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
    openapi: '3.0.0',
    info: {
      title: OPENAPI_CONFIG.title,
      version: OPENAPI_CONFIG.version,
    },
    tags: [...OPENAPI_TAGS],
    components: {
      securitySchemes: OPENAPI_SECURITY_SCHEMES,
    },
    servers: [{ url: '' }],
  };

  app.doc(OPENAPI_CONFIG.docPath, documentConfig as never);

  // Register routes that are not declared via `router.openapi(...)`.
  registerDocumentedRoutes(app);

  app.get(OPENAPI_CONFIG.referencePath, (c) => {
    const nonce = c.get('cspNonce');

    if (env.NODE_ENV === 'production') {
      c.header('Content-Security-Policy', buildOpenApiReferenceCSPHeaderValue(env.NODE_ENV, nonce));
    }

    return c.html(
      buildOpenApiReferenceHtml(
        {
          url: OPENAPI_CONFIG.docPath,
          theme: 'kepler',
          layout: 'classic',
          defaultHttpClient: {
            targetKey: 'js',
            clientKey: 'fetch',
          },
        },
        {
          nonce,
          pageTitle: `${OPENAPI_CONFIG.title} Reference`,
        },
      ),
    );
  });
}
