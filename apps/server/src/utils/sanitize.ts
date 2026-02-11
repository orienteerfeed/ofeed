export const SENSITIVE_PARAMS = new Set([
  "token",
  "access_token",
  "refresh_token",
  "code",
  "password",
  "secret",
  "api_key",
  "apikey",
  "key",
  "auth",
  "credential",
  "session",
  "jwt",
  "bearer",
]);

export function sanitizeLogString(str: string | undefined | null): string | undefined {
  if (str == null || typeof str !== "string") {
    return undefined;
  }

  return str
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")
    .replace(/[\x00-\x08\v\f\x0E-\x1F\x7F]/g, "");
}

export function sanitizePath(urlString: string): string {
  try {
    const url = new URL(urlString, "http://localhost");
    const params = new URLSearchParams(url.search);

    for (const key of params.keys()) {
      if (SENSITIVE_PARAMS.has(key.toLowerCase())) {
        params.set(key, "[REDACTED]");
      }
    }

    const query = params.toString();
    return `${url.pathname}${query ? `?${query}` : ""}`;
  } catch {
    return urlString.replace(
      /([?&](token|password|secret|code|api_key|key|auth|jwt|bearer)=)[^&]*/gi,
      "$1[REDACTED]",
    );
  }
}

export function extractClientIp(xForwardedFor?: string, xRealIp?: string): string {
  if (xForwardedFor) {
    return xForwardedFor.split(",")[0].trim();
  }
  return xRealIp ?? "unknown";
}
