import { beforeAll, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

type JwtTokenModule = typeof import("../jwtToken.js");

let jwtToken: JwtTokenModule;

beforeAll(async () => {
  process.env.JWT_TOKEN_SECRET_KEY = "test-jwt-secret";
  vi.resetModules();
  jwtToken = await import("../jwtToken.js");
});

describe("jwtToken helpers", () => {
  it("signs and verifies token payload", () => {
    const token = jwtToken.getJwtToken({ userId: 123 });
    const decoded = jwtToken.verifyToken(token) as { userId: number };

    expect(decoded.userId).toBe(123);
  });

  it("throws when verifyToken receives empty token", () => {
    expect(() => jwtToken.verifyToken("")).toThrow("No token provided");
  });
});

describe("buildAuthContextFromRequest", () => {
  it("returns unauthenticated context without authorization header", async () => {
    const context = await jwtToken.buildAuthContextFromRequest({ headers: {} });

    expect(context).toEqual({
      isAuthenticated: false,
      type: null,
      failureReason: "missing_authorization_header",
    });
  });

  it("returns authenticated jwt context for valid bearer token", async () => {
    const token = jwtToken.getJwtToken({ userId: 42 });
    const context = await jwtToken.buildAuthContextFromRequest({
      headers: { authorization: `Bearer ${token}` },
    });

    expect(context.isAuthenticated).toBe(true);
    expect(context.type).toBe("jwt");
    if (!context.isAuthenticated) {
      throw new Error("Expected authenticated context");
    }
    expect(context.userId).toBe(42);
  });
});

describe("verifyJwtToken middleware", () => {
  it("responds with 401 when request is unauthorized", async () => {
    const app = new Hono();
    app.use("*", jwtToken.verifyJwtToken);
    app.get("/", c => c.json({ ok: true }));

    const response = await app.request("http://localhost/");
    expect(response.status).toBe(401);
  });

  it("sets auth context and calls next when token is valid", async () => {
    const token = jwtToken.getJwtToken({ userId: 7 });
    const app = new Hono();
    app.use("*", jwtToken.verifyJwtToken);
    app.get("/", c => {
      const auth = (c as any).get("authContext") as {
        isAuthenticated: boolean;
        type: string | null;
        userId?: number | string;
      };

      return c.json({
        isAuthenticated: auth?.isAuthenticated,
        type: auth?.type,
        userId: auth?.userId,
      });
    });

    const response = await app.request("http://localhost/", {
      headers: { authorization: `Bearer ${token}` },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.isAuthenticated).toBe(true);
    expect(payload.type).toBe("jwt");
    expect(payload.userId).toBe(7);
  });
});
