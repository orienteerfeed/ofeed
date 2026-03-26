import type { Context } from "hono";
import { z } from "@hono/zod-openapi";

import env from "../../config/env.js";
import { getErrorDetails, logEndpoint } from "../../lib/http/endpoint-logger.js";
import { error, validation } from "../../utils/responseApi.js";

const supportedLangs = [
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

const supportedLangSet = new Set<string>(supportedLangs);

const mapTileParamsSchema = z.object({
  z: z.string().regex(/^\d+$/),
  x: z.string().regex(/^\d+$/),
  y: z.string().regex(/^\d+$/),
});

function normalizeMapLang(value: string | undefined) {
  const normalized = value?.trim().toLowerCase().split(/[-_]/)[0];
  if (!normalized) {
    return undefined;
  }

  return supportedLangSet.has(normalized) ? normalized : "en";
}

export const getMapTileHandler = async (c: Context) => {
  const parsedParams = mapTileParamsSchema.safeParse(c.req.param());

  if (!parsedParams.success) {
    return c.json(validation("Invalid map tile coordinates"), 422);
  }

  if (!env.MAPY_API_KEY) {
    return c.json(error("Map tiles are not configured on the server", 503), 503);
  }

  const { z: zoom, x, y } = parsedParams.data;
  const zoomNumber = Number(zoom);
  const xNumber = Number(x);
  const yNumber = Number(y);

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

  const tileUrl = `https://api.mapy.com/v1/maptiles/outdoor/256/${zoom}/${x}/${y}${search.toString().length > 0 ? `?${search.toString()}` : ""}`;

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
