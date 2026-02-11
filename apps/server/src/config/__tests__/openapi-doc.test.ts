import { describe, expect, it } from "vitest";

import app from "../../app";
import { OPENAPI_PATHS } from "../openapi.paths";

describe("openapi doc", () => {
  it("documents all registered API endpoint groups", async () => {
    const response = await app.request("/doc");

    expect(response.status).toBe(200);

    const document = await response.json();
    const paths = document?.paths ?? {};

    for (const [path, pathItem] of Object.entries(OPENAPI_PATHS)) {
      expect(paths[path]).toBeDefined();

      for (const method of Object.keys(pathItem)) {
        expect(paths[path][method]).toBeDefined();
      }
    }
  });
});
