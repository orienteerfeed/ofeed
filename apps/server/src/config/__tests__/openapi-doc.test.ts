import { describe, expect, it } from "vitest";

import app from "../../app";
import { OPENAPI_PATHS } from "../openapi.paths";
import { AUTH_OPENAPI } from "../../modules/auth/auth.openapi";
import { EVENT_OPENAPI } from "../../modules/event/event.openapi";
import { UPLOAD_OPENAPI } from "../../modules/upload/upload.openapi";

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

  it("documents request body schemas for write endpoints", async () => {
    const response = await app.request("/doc");
    expect(response.status).toBe(200);

    const document = await response.json();
    const paths = document?.paths ?? {};

    const checks = [
      {
        method: "post",
        path: `${AUTH_OPENAPI.basePath}/signin`,
        contentType: "application/json",
        properties: ["username", "password"],
        required: ["username", "password"],
      },
      {
        method: "post",
        path: `${AUTH_OPENAPI.basePath}/signup`,
        contentType: "application/json",
        properties: ["email", "password", "firstname", "lastname"],
        required: ["email", "password", "firstname", "lastname"],
      },
      {
        method: "post",
        path: `${AUTH_OPENAPI.basePath}/request-password-reset`,
        contentType: "application/json",
        properties: ["email"],
        required: ["email"],
      },
      {
        method: "post",
        path: `${AUTH_OPENAPI.basePath}/reset-password`,
        contentType: "application/json",
        properties: ["token", "newPassword"],
        required: ["token", "newPassword"],
      },
      {
        method: "post",
        path: `${AUTH_OPENAPI.basePath}/oauth2/token`,
        contentType: "application/x-www-form-urlencoded",
        properties: ["grant_type", "scope"],
        required: ["grant_type"],
      },
      {
        method: "post",
        path: `${AUTH_OPENAPI.basePath}/generate-oauth2-credentials`,
        contentType: "application/json",
        properties: ["grants", "scopes", "redirectUris"],
        required: ["grants"],
      },
      {
        method: "post",
        path: EVENT_OPENAPI.basePath,
        contentType: "application/json",
        properties: ["sportId", "name", "date", "timezone", "organizer", "location", "zeroTime"],
        required: ["sportId", "name", "date", "timezone", "organizer", "location", "zeroTime"],
      },
      {
        method: "put",
        path: `${EVENT_OPENAPI.basePath}/{eventId}`,
        contentType: "application/json",
        properties: ["sportId", "name", "date", "timezone", "organizer", "location", "zeroTime"],
        required: ["sportId", "name", "date", "timezone", "organizer", "location", "zeroTime"],
      },
      {
        method: "post",
        path: `${EVENT_OPENAPI.basePath}/{eventId}/image`,
        contentType: "multipart/form-data",
        properties: ["file"],
        required: ["file"],
      },
      {
        method: "post",
        path: `${EVENT_OPENAPI.basePath}/generate-password`,
        contentType: "application/json",
        properties: ["eventId"],
        required: ["eventId"],
      },
      {
        method: "post",
        path: `${EVENT_OPENAPI.basePath}/import/search`,
        contentType: "application/json",
        properties: ["provider", "query", "apiKey", "limit"],
        required: ["provider", "query"],
      },
      {
        method: "post",
        path: `${EVENT_OPENAPI.basePath}/import/preview`,
        contentType: "application/json",
        properties: ["provider", "externalEventId", "apiKey"],
        required: ["provider", "externalEventId"],
      },
      {
        method: "post",
        path: `${EVENT_OPENAPI.basePath}/revoke-password`,
        contentType: "application/json",
        properties: ["eventId"],
        required: ["eventId"],
      },
      {
        method: "post",
        path: `${EVENT_OPENAPI.basePath}/{eventId}/competitors`,
        contentType: "application/json",
        properties: ["origin", "classId", "classExternalId", "firstname", "lastname"],
        required: ["origin", "firstname", "lastname"],
      },
      {
        method: "put",
        path: `${EVENT_OPENAPI.basePath}/{eventId}/competitors/{competitorId}`,
        contentType: "application/json",
        properties: ["origin", "firstname", "lastname", "status", "splits"],
        required: ["origin"],
      },
      {
        method: "post",
        path: `${EVENT_OPENAPI.basePath}/{eventId}/competitors/{competitorId}/status-change`,
        contentType: "application/json",
        properties: ["origin", "status"],
        required: ["origin", "status"],
      },
      {
        method: "put",
        path: `${EVENT_OPENAPI.basePath}/{eventId}/competitors/{competitorExternalId}/external-id`,
        contentType: "application/json",
        properties: ["origin", "useExternalId", "firstname", "lastname", "status", "splits"],
        required: ["origin", "useExternalId"],
      },
      {
        method: "post",
        path: `${UPLOAD_OPENAPI.basePath}/iof`,
        contentType: "multipart/form-data",
        properties: ["eventId", "validateXml", "file"],
        required: ["eventId", "file"],
      },
      {
        method: "post",
        path: `${UPLOAD_OPENAPI.basePath}/czech-ranking`,
        contentType: "multipart/form-data",
        properties: ["file"],
        required: ["file"],
      },
    ] as const;

    for (const check of checks) {
      const operation = paths[check.path]?.[check.method];
      expect(operation).toBeDefined();

      const schema = operation?.requestBody?.content?.[check.contentType]?.schema;
      expect(schema).toBeDefined();
      expect(schema?.type).toBe("object");
      const schemaPropertyKeys = Object.keys(schema?.properties ?? {});
      expect(
        schemaPropertyKeys.length,
        `${check.method.toUpperCase()} ${check.path} should expose at least one request property`,
      ).toBeGreaterThan(0);

      for (const property of check.properties) {
        expect(schema?.properties?.[property]).toBeDefined();
      }

      if (check.required) {
        const requiredFields = schema?.required ?? [];
        for (const requiredProperty of check.required) {
          expect(requiredFields).toContain(requiredProperty);
        }
      }
    }
  });
});
