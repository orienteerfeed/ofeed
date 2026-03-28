import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import mapRouter from "../map.routes.js";

describe("map routes (hono)", () => {
  it("returns 422 for unsupported tile size on raster tile route", async () => {
    const app = new Hono();
    app.route("/", mapRouter as any);

    const response = await app.request(
      "http://localhost/tiles/raster/outdoor/512/9/277/172",
    );

    expect(response.status).toBe(422);
  });

  it("does not expose the legacy tile route shape", async () => {
    const app = new Hono();
    app.route("/", mapRouter as any);

    const response = await app.request("http://localhost/tiles/9/277/172");

    expect(response.status).toBe(404);
  });
});
