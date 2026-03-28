import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import restRouter from "../index.js";

describe("rest router registry", () => {
  it("mounts auth module routes", async () => {
    const app = new Hono();
    app.route("/", restRouter as any);

    const response = await app.request("http://localhost/rest/v1/auth/signin", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(422);
  });

  it("mounts map module routes under /rest/v1/maps", async () => {
    const app = new Hono();
    app.route("/", restRouter as any);

    const response = await app.request(
      "http://localhost/rest/v1/maps/tiles/raster/outdoor/512/9/277/172",
    );

    expect(response.status).toBe(422);
  });
});
