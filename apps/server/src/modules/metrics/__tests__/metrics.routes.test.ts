import { describe, expect, it } from "vitest";

import { getMetrics } from "../metrics.routes";

describe("metrics.routes", () => {
  it("defines /metrics path", () => {
    expect(getMetrics.path).toBe("/metrics");
  });
});
