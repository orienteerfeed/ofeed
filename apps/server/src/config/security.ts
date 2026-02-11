export const OPENAPI_SECURITY_SCHEMES = {
  BearerAuth: {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
  },
  BasicAuth: {
    type: "http",
    scheme: "basic",
  },
} as const;

export const OPENAPI_SECURITY = [{ BearerAuth: [] }, { BasicAuth: [] }] as const;

export function buildCSPDirectives(nodeEnv: string = "development", nonce?: string) {
  const isDevelopment = nodeEnv === "development";
  const nonceSource = nonce ? [`'nonce-${nonce}'`] : [];

  return {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", ...nonceSource, ...(isDevelopment ? ["'unsafe-inline'", "'unsafe-eval'"] : [])],
    styleSrc: ["'self'", "'unsafe-inline'", ...nonceSource],
    connectSrc: ["'self'", ...(isDevelopment ? ["http://localhost:*", "ws://localhost:*"] : [])],
    imgSrc: ["'self'", "data:", "blob:"],
    fontSrc: ["'self'", "data:"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    frameAncestors: ["'none'"],
  } as const;
}

const directiveKeyMap: Record<string, string> = {
  defaultSrc: "default-src",
  scriptSrc: "script-src",
  styleSrc: "style-src",
  connectSrc: "connect-src",
  imgSrc: "img-src",
  fontSrc: "font-src",
  objectSrc: "object-src",
  baseUri: "base-uri",
  frameAncestors: "frame-ancestors",
};

export function buildCSPHeaderValue(nodeEnv: string = "development", nonce?: string) {
  const directives = buildCSPDirectives(nodeEnv, nonce);

  return Object.entries(directives)
    .map(([key, values]) => `${directiveKeyMap[key] ?? key} ${values.join(" ")}`)
    .join("; ");
}

export function isCSPEnabled(nodeEnv: string) {
  return nodeEnv === "production";
}
