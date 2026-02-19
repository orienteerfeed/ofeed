import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { registerAuthRoutes } from "../auth.handlers";

describe("auth routes (hono)", () => {
  const app = new Hono();
  registerAuthRoutes(app as any);

  it("returns 422 for invalid signin payload", async () => {
    const response = await app.request("http://localhost/signin", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload).toHaveProperty("message", "Validation errors");
    expect(payload).toHaveProperty("error", true);
  });

  it("returns 400 for oauth token without basic authorization", async () => {
    const response = await app.request("http://localhost/oauth2/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toHaveProperty("error", "invalid_request");
  });

  it("returns 401 for oauth2 credentials without authenticated user", async () => {
    const response = await app.request("http://localhost/oauth2-credentials", {
      method: "GET",
    });

    expect(response.status).toBe(401);
  });

  it("returns 401 for oauth2 credential revoke without authenticated user", async () => {
    const response = await app.request("http://localhost/revoke-oauth2-credentials", {
      method: "DELETE",
    });

    expect(response.status).toBe(401);
  });
});
