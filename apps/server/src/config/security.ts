export const OPENAPI_SECURITY_SCHEMES = {
  BearerAuth: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  },
  BasicAuth: {
    type: 'http',
    scheme: 'basic',
  },
} as const;

export const OPENAPI_SECURITY = [{ BearerAuth: [] }, { BasicAuth: [] }] as const;
export const SCALAR_CSP_SCRIPT_SOURCE = 'https://cdn.jsdelivr.net';

export function buildCSPDirectives(nodeEnv: string = 'development', nonce?: string) {
  const isDevelopment = nodeEnv === 'development';
  const nonceSource = nonce ? [`'nonce-${nonce}'`] : [];

  return {
    defaultSrc: ["'self'"],
    scriptSrc: [
      "'self'",
      ...nonceSource,
      ...(isDevelopment ? ["'unsafe-inline'", "'unsafe-eval'"] : []),
    ],
    styleSrc: ["'self'", "'unsafe-inline'", ...nonceSource],
    connectSrc: ["'self'", ...(isDevelopment ? ['http://localhost:*', 'ws://localhost:*'] : [])],
    imgSrc: ["'self'", 'data:', 'blob:'],
    fontSrc: ["'self'", 'data:'],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    frameAncestors: ["'none'"],
  } as const;
}

export function buildOpenApiReferenceCSPDirectives(
  nodeEnv: string = 'development',
  nonce?: string,
) {
  const directives = buildCSPDirectives(nodeEnv, nonce);

  return {
    ...directives,
    scriptSrc: [...directives.scriptSrc, SCALAR_CSP_SCRIPT_SOURCE],
  } as const;
}

const directiveKeyMap: Record<string, string> = {
  defaultSrc: 'default-src',
  scriptSrc: 'script-src',
  styleSrc: 'style-src',
  connectSrc: 'connect-src',
  imgSrc: 'img-src',
  fontSrc: 'font-src',
  objectSrc: 'object-src',
  baseUri: 'base-uri',
  frameAncestors: 'frame-ancestors',
};

export function buildCSPHeaderValue(nodeEnv: string = 'development', nonce?: string) {
  const directives = buildCSPDirectives(nodeEnv, nonce);

  return Object.entries(directives)
    .map(([key, values]) => `${directiveKeyMap[key] ?? key} ${values.join(' ')}`)
    .join('; ');
}

export function buildOpenApiReferenceCSPHeaderValue(
  nodeEnv: string = 'development',
  nonce?: string,
) {
  const directives = buildOpenApiReferenceCSPDirectives(nodeEnv, nonce);

  return Object.entries(directives)
    .map(([key, values]) => `${directiveKeyMap[key] ?? key} ${values.join(' ')}`)
    .join('; ');
}

export function isCSPEnabled(nodeEnv: string) {
  return nodeEnv === 'production';
}
