import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { registerAuthRoutes } from "../auth.handlers.js";

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

  it("returns 422 for invalid email verification token", async () => {
    const response = await app.request("http://localhost/verify-email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ token: "invalid-token" }),
    });

    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload).toHaveProperty("error", true);
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

  describe("POST /request-password-reset", () => {
    it("returns 422 for empty body", async () => {
      const response = await app.request("http://localhost/request-password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });

      const payload = await response.json();

      expect(response.status).toBe(422);
      expect(payload).toHaveProperty("message", "Validation errors");
      expect(payload).toHaveProperty("error", true);
    });

    it("returns 422 for invalid email format", async () => {
      const response = await app.request("http://localhost/request-password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "not-an-email" }),
      });

      const payload = await response.json();

      expect(response.status).toBe(422);
      expect(payload).toHaveProperty("error", true);
    });

    it("returns 422 for invalid JSON body", async () => {
      const response = await app.request("http://localhost/request-password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      });

      const payload = await response.json();

      expect(response.status).toBe(422);
      expect(payload).toHaveProperty("error", true);
    });
  });

  describe("POST /reset-password", () => {
    it("returns 422 for empty body", async () => {
      const response = await app.request("http://localhost/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });

      const payload = await response.json();

      expect(response.status).toBe(422);
      expect(payload).toHaveProperty("message", "Validation errors");
      expect(payload).toHaveProperty("error", true);
    });

    it("returns 422 when newPassword is missing", async () => {
      const response = await app.request("http://localhost/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "some-reset-token" }),
      });

      const payload = await response.json();

      expect(response.status).toBe(422);
      expect(payload).toHaveProperty("error", true);
    });

    it("returns 422 when token is missing", async () => {
      const response = await app.request("http://localhost/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newPassword: "validpassword" }),
      });

      const payload = await response.json();

      expect(response.status).toBe(422);
      expect(payload).toHaveProperty("error", true);
    });

    it("returns 422 when newPassword is shorter than 8 characters", async () => {
      const response = await app.request("http://localhost/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "some-reset-token", newPassword: "short" }),
      });

      const payload = await response.json();

      expect(response.status).toBe(422);
      expect(payload).toHaveProperty("error", true);
    });

    it("returns 422 for invalid JSON body", async () => {
      const response = await app.request("http://localhost/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      });

      const payload = await response.json();

      expect(response.status).toBe(422);
      expect(payload).toHaveProperty("error", true);
    });
  });
});
