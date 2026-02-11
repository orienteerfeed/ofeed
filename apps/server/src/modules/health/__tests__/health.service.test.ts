import { describe, expect, it } from "vitest";

import { calculateHealthStatus, isReady } from "../health.service";

describe("health.service", () => {
  it("returns UP when all checks pass", () => {
    const status = calculateHealthStatus([
      { name: "database", status: "UP" },
      { name: "memory", status: "UP" },
    ] as any);

    expect(status).toBe("UP");
  });

  it("returns DOWN when any check fails", () => {
    const status = calculateHealthStatus([
      { name: "database", status: "DOWN" },
      { name: "memory", status: "UP" },
    ] as any);

    expect(status).toBe("DOWN");
  });

  it("is ready only when database is UP", () => {
    expect(isReady([{ name: "database", status: "UP" }] as any)).toBe(true);
    expect(isReady([{ name: "database", status: "DOWN" }] as any)).toBe(false);
  });
});
