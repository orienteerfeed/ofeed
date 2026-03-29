export const SUPPORTED_MAP_TILE_LANGS = [
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

export const SUPPORTED_MAP_TILE_MAPSETS = [
  "basic",
  "outdoor",
  "winter",
  "aerial",
  "names-overlay",
] as const;

export const SUPPORTED_MAP_TILE_SIZES = ["256", "256@2x"] as const;

export type SupportedMapTileLang = (typeof SUPPORTED_MAP_TILE_LANGS)[number];
export type SupportedMapTileMapset =
  (typeof SUPPORTED_MAP_TILE_MAPSETS)[number];
export type SupportedMapTileSize = (typeof SUPPORTED_MAP_TILE_SIZES)[number];

const supportedMapTileLangSet = new Set<string>(SUPPORTED_MAP_TILE_LANGS);
const supportedMapTileMapsetSet = new Set<string>(SUPPORTED_MAP_TILE_MAPSETS);
const supportedMapTileSizeSet = new Set<string>(SUPPORTED_MAP_TILE_SIZES);

export function getMapTileLangCandidate(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase().split(/[-_]/)[0];
  return normalized || undefined;
}

export function isSupportedMapTileLang(
  value: string,
): value is SupportedMapTileLang {
  return supportedMapTileLangSet.has(value);
}

export function resolveSupportedMapTileLang(
  value: string | undefined,
): SupportedMapTileLang | undefined {
  const candidate = getMapTileLangCandidate(value);

  if (!candidate) {
    return undefined;
  }

  return isSupportedMapTileLang(candidate) ? candidate : undefined;
}

export function isSupportedMapTileMapset(
  value: string,
): value is SupportedMapTileMapset {
  return supportedMapTileMapsetSet.has(value);
}

export function isSupportedMapTileSize(
  value: string,
): value is SupportedMapTileSize {
  return supportedMapTileSizeSet.has(value);
}

export function supportsRetinaMapTileSize(
  mapset: SupportedMapTileMapset,
  tileSize: SupportedMapTileSize,
): boolean {
  if (tileSize !== "256@2x") {
    return true;
  }

  return mapset === "basic" || mapset === "outdoor";
}
