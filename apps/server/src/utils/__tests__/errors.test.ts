import { describe, expect, it } from "vitest";

import { formatErrors } from "../errors.js";

describe("formatErrors", () => {
  it("formats array validation errors", () => {
    const errors = [
      { msg: "Error 1", param: "param1" },
      { msg: "Error 2", param: "param2" },
    ];

    expect(formatErrors(errors)).toBe("Error 1: param1, Error 2: param2");
  });

  it("returns empty string for empty array", () => {
    expect(formatErrors([])).toBe("");
  });

  it("uses .array() when error object is provided", () => {
    const errors = {
      array: () => "formatted error",
    };

    expect(formatErrors(errors)).toBe("formatted error");
  });

  it("throws for unsupported input type", () => {
    expect(() => formatErrors("invalid input")).toThrow("Expected an array or object of errors");
  });
});
