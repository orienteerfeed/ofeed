import { describe, expect, it } from "vitest";

import {
  OPENAPI_SECURITY,
  OPENAPI_SECURITY_SCHEMES,
  buildCSPDirectives,
  buildCSPHeaderValue,
  isCSPEnabled,
} from "../security";

describe("config/security", () => {
  it("exposes Bearer and Basic OpenAPI security schemes", () => {
    expect(OPENAPI_SECURITY_SCHEMES).toHaveProperty("BearerAuth");
    expect(OPENAPI_SECURITY_SCHEMES).toHaveProperty("BasicAuth");
    expect(OPENAPI_SECURITY).toEqual([{ BearerAuth: [] }, { BasicAuth: [] }]);
  });

  it("builds relaxed CSP directives for development", () => {
    const directives = buildCSPDirectives("development");

    expect(directives.scriptSrc).toContain("'unsafe-inline'");
    expect(directives.scriptSrc).toContain("'unsafe-eval'");
    expect(directives.connectSrc).toContain("http://localhost:*");
    expect(directives.connectSrc).toContain("ws://localhost:*");
  });

  it("builds stricter CSP directives for production", () => {
    const directives = buildCSPDirectives("production");

    expect(directives.scriptSrc).not.toContain("'unsafe-inline'");
    expect(directives.scriptSrc).not.toContain("'unsafe-eval'");
    expect(directives.connectSrc).toEqual(["'self'"]);
  });

  it("injects nonce source into script and style directives", () => {
    const directives = buildCSPDirectives("production", "abc123");

    expect(directives.scriptSrc).toContain("'nonce-abc123'");
    expect(directives.styleSrc).toContain("'nonce-abc123'");
  });

  it("builds CSP header with normalized directive keys", () => {
    const header = buildCSPHeaderValue("production", "nonce-value");

    expect(header).toContain("default-src 'self'");
    expect(header).toContain("script-src 'self' 'nonce-nonce-value'");
    expect(header).toContain("frame-ancestors 'none'");
    expect(header).toContain("; ");
  });

  it("enables CSP only in production", () => {
    expect(isCSPEnabled("production")).toBe(true);
    expect(isCSPEnabled("development")).toBe(false);
    expect(isCSPEnabled("test")).toBe(false);
  });
});
