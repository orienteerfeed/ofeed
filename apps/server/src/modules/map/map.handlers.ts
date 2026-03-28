import type { Context } from "hono";
import { z } from "@hono/zod-openapi";
import {
  getMapTileLangCandidate,
  isSupportedMapTileMapset,
  isSupportedMapTileSize,
  resolveSupportedMapTileLang,
  supportsRetinaMapTileSize,
} from "@repo/shared";

import env from "../../config/env.js";
import { getErrorDetails, logEndpoint } from "../../lib/http/endpoint-logger.js";
import { error, validation } from "../../utils/responseApi.js";

const mapTileParamsSchema = z.object({
  mapset: z.string().min(1),
  tileSize: z.string().min(1),
  z: z.string().regex(/^\d+$/),
  x: z.string().regex(/^\d+$/),
  y: z.string().regex(/^\d+$/),
});

function normalizeMapLang(value: string | undefined) {
  const lang = resolveSupportedMapTileLang(value);

  if (lang) {
    return lang;
  }

  if (!getMapTileLangCandidate(value)) {
    return undefined;
  }

  return "en";
}

export const getMapTileHandler = async (c: Context) => {
  const parsedParams = mapTileParamsSchema.safeParse(c.req.param());

  if (!parsedParams.success) {
    return c.json(validation("Invalid map tile coordinates"), 422);
  }

  if (!env.MAPY_API_KEY) {
    return c.json(error("Map tiles are not configured on the server", 503), 503);
  }

  const {
    mapset,
    tileSize,
    z: zoom,
    x,
    y,
  } = parsedParams.data;
  const zoomNumber = Number(zoom);
  const xNumber = Number(x);
  const yNumber = Number(y);

  if (!isSupportedMapTileMapset(mapset)) {
    return c.json(error("Unsupported mapset", 422), 422);
  }

  if (!isSupportedMapTileSize(tileSize)) {
    return c.json(error("Unsupported tile size", 422), 422);
  }

  if (!supportsRetinaMapTileSize(mapset, tileSize)) {
    return c.json(
      error("Tile size 256@2x is supported only for basic and outdoor mapsets", 422),
      422,
    );
  }

  if (zoomNumber < 0 || zoomNumber > 20) {
    return c.json(error("Unsupported zoom level", 422), 422);
  }

  if (xNumber < 0 || yNumber < 0) {
    return c.json(error("Unsupported tile coordinates", 422), 422);
  }

  const search = new URLSearchParams();
  const lang = normalizeMapLang(c.req.query("lang"));
  if (lang) {
    search.set("lang", lang);
  }

  const tileUrl = `https://api.mapy.com/v1/maptiles/${mapset}/${tileSize}/${zoom}/${x}/${y}${search.toString().length > 0 ? `?${search.toString()}` : ""}`;

  try {
    const upstreamResponse = await fetch(tileUrl, {
      headers: {
        "X-Mapy-Api-Key": env.MAPY_API_KEY,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!upstreamResponse.ok || !upstreamResponse.body) {
      logEndpoint(c, "error", "Map tile upstream request failed", {
        url: tileUrl,
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
      });
      return c.json(error("Map tile unavailable", 502), 502);
    }

    const headers = new Headers();
    headers.set(
      "Content-Type",
      upstreamResponse.headers.get("Content-Type") ?? "image/png",
    );
    headers.set(
      "Cache-Control",
      upstreamResponse.headers.get("Cache-Control") ?? "public, max-age=3600",
    );
    const contentLength = upstreamResponse.headers.get("Content-Length");
    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }

    return new Response(upstreamResponse.body, {
      status: 200,
      headers,
    });
  } catch (err) {
    logEndpoint(c, "error", "Map tile proxy failed", {
      url: tileUrl,
      ...getErrorDetails(err),
    });
    return c.json(error("Failed to load map tile", 502), 502);
  }
};
