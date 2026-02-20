import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import eventRouter from "../event.routes";

describe("event routes (hono)", () => {
  it("returns 401 for /import/search without jwt auth context", async () => {
    const app = new Hono();
    app.route("/", eventRouter as any);

    const response = await app.request("http://localhost/import/search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        provider: "ORIS",
        query: "praha",
      }),
    });

    expect(response.status).toBe(401);
  });

  it("returns 401 for /import/preview without jwt auth context", async () => {
    const app = new Hono();
    app.route("/", eventRouter as any);

    const response = await app.request("http://localhost/import/preview", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        provider: "ORIS",
        externalEventId: "8300",
      }),
    });

    expect(response.status).toBe(401);
  });
});
