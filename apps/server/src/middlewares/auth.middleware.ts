import type { Context, Next } from "hono";

import { buildAuthContextFromRequest } from "../utils/jwtToken.js";

const PUBLIC_PREFIXES = ["/", "/doc", "/reference", "/health", "/metrics", "/readyz"];

export function isPublicPath(path: string) {
  return PUBLIC_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`));
}

function requestLikeFromHono(c: Context) {
  const headers: Record<string, string> = {};

  for (const [key, value] of c.req.raw.headers.entries()) {
    headers[key.toLowerCase()] = value;
  }

  return { headers };
}

export async function authMiddleware(c: Context, next: Next) {
  try {
    const auth = await buildAuthContextFromRequest(requestLikeFromHono(c) as any);
    c.set("authContext", auth);
  } catch (error) {
    c.set("authContext", { isAuthenticated: false, type: null });
  }

  await next();
}
