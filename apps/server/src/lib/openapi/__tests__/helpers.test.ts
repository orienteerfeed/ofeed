import { describe, expect, it } from "vitest";

import { emptyContent, jsonContent, jsonContentRequired } from "../helpers.js";

describe("openapi helpers", () => {
  it("builds optional JSON content descriptor", () => {
    const schema = { type: "object", properties: { id: { type: "number" } } } as any;
    const result = jsonContent(schema, "Entity response");

    expect(result.description).toBe("Entity response");
    expect(result.content["application/json"].schema).toBe(schema);
  });

  it("builds required JSON content descriptor", () => {
    const schema = { type: "object", properties: { name: { type: "string" } } } as any;
    const result = jsonContentRequired(schema, "Create payload");

    expect(result.required).toBe(true);
    expect(result.description).toBe("Create payload");
    expect(result.content["application/json"].schema).toBe(schema);
  });

  it("builds empty content descriptor", () => {
    const result = emptyContent("No body");

    expect(result).toEqual({
      content: {},
      description: "No body",
    });
  });
});
