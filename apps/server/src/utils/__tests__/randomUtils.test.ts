import { describe, expect, it } from "vitest";

import { generateRandomHex } from "../../lib/crypto/random.js";

describe("generateRandomHex", () => {
  it("returns a string with requested length", () => {
    const result = generateRandomHex(16);

    expect(typeof result).toBe("string");
    expect(result).toHaveLength(16);
  });

  it("returns a hexadecimal string", () => {
    const result = generateRandomHex(32);

    expect(result).toMatch(/^[0-9a-fA-F]+$/);
  });

  it("throws for invalid length", () => {
    expect(() => generateRandomHex(0)).toThrow("Length must be a positive integer");
  });
});
