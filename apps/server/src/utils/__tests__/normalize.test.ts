import { describe, expect, it } from "vitest";

import { normalizeValue } from "../normalize.js";

describe("normalizeValue", () => {
  it("returns null for undefined and null", () => {
    expect(normalizeValue("string", undefined)).toBeNull();
    expect(normalizeValue("number", null)).toBeNull();
  });

  it("normalizes date string and Date instance to timestamp", () => {
    const iso = "2026-02-10T12:34:56.000Z";
    const date = new Date(iso);

    expect(normalizeValue("date", iso)).toBe(date.getTime());
    expect(normalizeValue("date", date)).toBe(date.getTime());
  });

  it("returns NaN for invalid date string and null for unsupported date value", () => {
    expect(Number.isNaN(normalizeValue("date", "not-a-date"))).toBe(true);
    expect(normalizeValue("date", 42)).toBeNull();
  });

  it("normalizes numbers from string and number values", () => {
    expect(normalizeValue("number", "42")).toBe(42);
    expect(normalizeValue("number", 3.14)).toBe(3.14);
  });

  it("returns null for invalid numeric input", () => {
    expect(normalizeValue("number", "abc")).toBeNull();
  });

  it("trims strings and stringifies non-string values", () => {
    expect(normalizeValue("string", "  hello  ")).toBe("hello");
    expect(normalizeValue("string", 123)).toBe("123");
  });

  it("returns original value for unknown type", () => {
    const input = { nested: true };
    expect(normalizeValue("custom", input)).toBe(input);
  });
});
