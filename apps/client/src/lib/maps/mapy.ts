import { config } from '@/config';
import { ENDPOINTS } from '@/lib/api/endpoints';
import {
  createMapyProvider,
  type MapyProviderOptions,
  type MapyProxyOptions,
} from 'react-mapy/providers/mapy';

type ProxiedMapyProviderOptions = Omit<
  Partial<MapyProviderOptions>,
  'proxy'
> & {
  proxy?: Partial<MapyProxyOptions>;
};

interface MapTileEndpointOptions {
  apiBaseUrl: string;
  useSameOrigin: boolean;
}

export const MAPY_RASTER_PROXY_PATH_TEMPLATE = `${ENDPOINTS.mapTile(
  '{mapset}',
  '{tileSize}',
  '{z}',
  '{x}',
  '{y}'
)}?lang={lang}`;

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

export function resolveMapTileRequestBaseUrl({
  apiBaseUrl,
  useSameOrigin,
}: MapTileEndpointOptions): string {
  return useSameOrigin ? '' : trimTrailingSlash(apiBaseUrl);
}

export function buildMapTileProxyUrlTemplate(
  options: MapTileEndpointOptions
): string {
  return `${resolveMapTileRequestBaseUrl(options)}${MAPY_RASTER_PROXY_PATH_TEMPLATE}`;
}

export function buildMapTileSessionUrl(
  options: MapTileEndpointOptions
): string {
  return `${resolveMapTileRequestBaseUrl(options)}${ENDPOINTS.mapTileSession()}`;
}

// react-mapy interpolates `{variant}`, while the backend contract uses `{mapset}`.
const normalizeMapyProxyUrlTemplate = (urlTemplate: string): string =>
  urlTemplate.replaceAll('{mapset}', '{variant}');

export const USE_SAME_ORIGIN_MAP_TILE_ACCESS = import.meta.env.PROD;

export const MAPY_RASTER_PROXY_URL_TEMPLATE = buildMapTileProxyUrlTemplate({
  apiBaseUrl: config.BASE_API_URL,
  useSameOrigin: USE_SAME_ORIGIN_MAP_TILE_ACCESS,
});

export const MAP_TILE_SESSION_URL = buildMapTileSessionUrl({
  apiBaseUrl: config.BASE_API_URL,
  useSameOrigin: USE_SAME_ORIGIN_MAP_TILE_ACCESS,
});

export function createProxiedMapyProvider(
  options: ProxiedMapyProviderOptions = {}
) {
  const urlTemplate = normalizeMapyProxyUrlTemplate(
    options.proxy?.urlTemplate ?? MAPY_RASTER_PROXY_URL_TEMPLATE
  );

  return createMapyProvider({
    ...options,
    proxy: {
      ...options.proxy,
      urlTemplate,
    } satisfies MapyProxyOptions,
  });
}
