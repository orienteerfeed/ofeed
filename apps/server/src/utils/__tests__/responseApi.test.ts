import { describe, expect, it } from "vitest";

import { error, success, validation } from "../responseApi.js";

describe("responseApi.success", () => {
  it("returns success envelope with provided payload", () => {
    const result = success("OK", { id: 1 }, 200);

    expect(result).toEqual({
      message: "OK",
      error: false,
      code: 200,
      results: { id: 1 },
    });
  });
});

describe("responseApi.error", () => {
  it("returns known status codes unchanged", () => {
    expect(error("Not found", 404)).toEqual({
      message: "Not found",
      code: 404,
      error: true,
    });
  });

  it("accepts status code as string due loose equality", () => {
    expect(error("Unauthorized", "401" as unknown as number)).toEqual({
      message: "Unauthorized",
      code: 401,
      error: true,
    });
  });

  it("falls back to 500 for unsupported status codes", () => {
    expect(error("Unknown", 418)).toEqual({
      message: "Unknown",
      code: 500,
      error: true,
    });
  });
});

describe("responseApi.validation", () => {
  it("returns validation envelope", () => {
    const errors = [{ field: "email", message: "Invalid email" }];

    expect(validation(errors)).toEqual({
      message: "Validation errors",
      error: true,
      code: 422,
      errors,
    });
  });
});
