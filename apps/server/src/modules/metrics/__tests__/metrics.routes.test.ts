import { describe, expect, it } from "vitest";

import { getMetrics } from "../metrics.routes.js";

describe("metrics.routes", () => {
  it("defines /metrics path", () => {
    expect(getMetrics.path).toBe("/metrics");
  });
});
