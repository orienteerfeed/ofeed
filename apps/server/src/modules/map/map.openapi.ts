import { API_DEFAULTS } from "../../constants/index.js";
import type { OpenApiPathItem } from "../../config/openapi.types";

const SUPPORTED_LANGS = [
  "cs",
  "de",
  "el",
  "en",
  "es",
  "fr",
  "it",
  "nl",
  "pl",
  "pt",
  "ru",
  "sk",
  "tr",
  "uk",
] as const;

export const MAP_OPENAPI = {
  tag: "Map",
  basePath: `${API_DEFAULTS.BASE_PATH}/map`,
} as const;

const mapTilesPath = `${MAP_OPENAPI.basePath}/tiles/{z}/{x}/{y}`;

export const MAP_OPENAPI_PATHS: Record<string, OpenApiPathItem> = {
  [mapTilesPath]: {
    get: {
      tags: [MAP_OPENAPI.tag],
      operationId: "mapTileProxy",
      summary: "Get localized outdoor map tile",
      description:
        "App-specific proxy for Mapy.cz outdoor raster tiles with a fixed 256 tile size.",
      security: [],
      parameters: [
        {
          name: "z",
          in: "path",
          required: true,
          schema: { type: "integer", minimum: 0, maximum: 20 },
        },
        {
          name: "x",
          in: "path",
          required: true,
          schema: { type: "integer", minimum: 0 },
        },
        {
          name: "y",
          in: "path",
          required: true,
          schema: { type: "integer", minimum: 0 },
        },
        {
          name: "lang",
          in: "query",
          required: false,
          schema: { type: "string", enum: [...SUPPORTED_LANGS] },
        },
      ],
      responses: {
        200: {
          description: "Map tile image",
          content: {
            "image/png": {
              schema: { type: "string", format: "binary" },
            },
          },
        },
        422: {
          description: "Invalid tile request",
        },
        502: {
          description: "Upstream map provider error",
        },
        503: {
          description: "Map provider is not configured",
        },
      },
    },
  },
};
