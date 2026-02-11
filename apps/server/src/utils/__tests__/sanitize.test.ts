import { describe, expect, it } from "vitest";

import { extractClientIp, sanitizeLogString, sanitizePath } from "../sanitize.js";

describe("sanitize utilities", () => {
  it("escapes line breaks and tabs and strips control chars in log strings", () => {
    const result = sanitizeLogString("line1\r\nline2\tvalue\x07");

    expect(result).toBe("line1\\r\\nline2\\tvalue");
  });

  it("returns undefined for non-string log values", () => {
    expect(sanitizeLogString(undefined)).toBeUndefined();
    expect(sanitizeLogString(null)).toBeUndefined();
    expect(sanitizeLogString(123 as unknown as string)).toBeUndefined();
  });

  it("redacts sensitive query params while preserving other params", () => {
    const result = sanitizePath("/events?token=abc123&page=2&PASSWORD=topsecret");
    const url = new URL(result, "http://localhost");

    expect(url.pathname).toBe("/events");
    expect(url.searchParams.get("token")).toBe("[REDACTED]");
    expect(url.searchParams.get("PASSWORD")).toBe("[REDACTED]");
    expect(url.searchParams.get("page")).toBe("2");
  });

  it("redacts sensitive params in fallback branch when URL parsing fails", () => {
    const result = sanitizePath("http://[::1?token=abc&auth=secret&foo=bar");

    expect(result).toContain("token=[REDACTED]");
    expect(result).toContain("auth=[REDACTED]");
    expect(result).toContain("foo=bar");
  });

  it("extracts first IP from x-forwarded-for and falls back correctly", () => {
    expect(extractClientIp("198.51.100.42, 10.0.0.1", "127.0.0.1")).toBe("198.51.100.42");
    expect(extractClientIp(undefined, "127.0.0.1")).toBe("127.0.0.1");
    expect(extractClientIp()).toBe("unknown");
  });
});
