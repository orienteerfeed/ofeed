import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import userRouter from "../user.routes";

describe("user routes (hono)", () => {
  it("returns 401 for /my-events without jwt auth context", async () => {
    const app = new Hono();
    app.route("/", userRouter as any);

    const response = await app.request("http://localhost/", {
      method: "GET",
    });

    expect(response.status).toBe(401);
  });
});
