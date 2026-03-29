import { config } from '@/config';
import { ENDPOINTS } from '@/lib/api/endpoints';
import {
  createMapyProvider,
  type MapyProviderOptions,
  type MapyProxyOptions,
} from 'react-mapy/providers/mapy';

type ProxiedMapyProviderOptions = Omit<Partial<MapyProviderOptions>, 'proxy'> & {
  proxy?: Partial<MapyProxyOptions>;
};

export const MAPY_RASTER_PROXY_PATH_TEMPLATE = `${ENDPOINTS.mapTile(
  '{mapset}',
  '{tileSize}',
  '{z}',
  '{x}',
  '{y}',
)}?lang={lang}`;

const withApiBase = (path: string): string =>
  `${config.BASE_API_URL.replace(/\/+$/, '')}${path}`;

// react-mapy interpolates `{variant}`, while the backend contract uses `{mapset}`.
const normalizeMapyProxyUrlTemplate = (urlTemplate: string): string =>
  urlTemplate.replaceAll('{mapset}', '{variant}');

export const MAPY_RASTER_PROXY_URL_TEMPLATE = withApiBase(
  MAPY_RASTER_PROXY_PATH_TEMPLATE,
);

export function createProxiedMapyProvider(
  options: ProxiedMapyProviderOptions = {},
) {
  const urlTemplate = normalizeMapyProxyUrlTemplate(
    options.proxy?.urlTemplate ?? MAPY_RASTER_PROXY_URL_TEMPLATE,
  );

  return createMapyProvider({
    ...options,
    proxy: {
      ...options.proxy,
      urlTemplate,
    } satisfies MapyProxyOptions,
  });
}
