import { describe, expect, it } from "vitest";

import { createShortCompetitorHash, generateResetPasswordToken } from "../hashUtils.js";

describe("createShortCompetitorHash", () => {
  it("is deterministic and case-insensitive", () => {
    const upper = createShortCompetitorHash(10, "NOVAK", "JAN");
    const lower = createShortCompetitorHash(10, "novak", "jan");

    expect(upper).toBe(lower);
  });

  it("changes when source data changes", () => {
    const base = createShortCompetitorHash(10, "Novak", "Jan");
    const changed = createShortCompetitorHash(11, "Novak", "Jan");

    expect(changed).not.toBe(base);
  });

  it("returns numeric string up to 10 characters", () => {
    const hash = createShortCompetitorHash(1, "Family", "Given");

    expect(hash).toMatch(/^\d+$/);
    expect(hash.length).toBeGreaterThan(0);
    expect(hash.length).toBeLessThanOrEqual(10);
  });
});

describe("generateResetPasswordToken", () => {
  it("returns sha256-like hex token", () => {
    const token = generateResetPasswordToken(42);

    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns unique values for repeated calls", () => {
    const token1 = generateResetPasswordToken(42);
    const token2 = generateResetPasswordToken(42);

    expect(token1).not.toBe(token2);
  });
});
