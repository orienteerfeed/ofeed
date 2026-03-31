import { describe, expect, it } from 'vitest';

import {
  buildMapTileProxyUrlTemplate,
  buildMapTileSessionUrl,
  resolveMapTileRequestBaseUrl,
} from '@/lib/maps/mapy';

describe('map tile endpoint helpers', () => {
  it('uses same-origin relative paths when same-origin tile access is enabled', () => {
    expect(
      resolveMapTileRequestBaseUrl({
        apiBaseUrl: 'https://api.ofeed.example',
        useSameOrigin: true,
      })
    ).toBe('');

    expect(
      buildMapTileProxyUrlTemplate({
        apiBaseUrl: 'https://api.ofeed.example',
        useSameOrigin: true,
      })
    ).toBe(
      '/rest/v1/maps/tiles/raster/{mapset}/{tileSize}/{z}/{x}/{y}?lang={lang}'
    );

    expect(
      buildMapTileSessionUrl({
        apiBaseUrl: 'https://api.ofeed.example',
        useSameOrigin: true,
      })
    ).toBe('/rest/v1/maps/tiles/session');
  });

  it('keeps using the configured API base URL outside same-origin mode', () => {
    expect(
      resolveMapTileRequestBaseUrl({
        apiBaseUrl: 'https://api.ofeed.example/',
        useSameOrigin: false,
      })
    ).toBe('https://api.ofeed.example');

    expect(
      buildMapTileProxyUrlTemplate({
        apiBaseUrl: 'https://api.ofeed.example/',
        useSameOrigin: false,
      })
    ).toBe(
      'https://api.ofeed.example/rest/v1/maps/tiles/raster/{mapset}/{tileSize}/{z}/{x}/{y}?lang={lang}'
    );

    expect(
      buildMapTileSessionUrl({
        apiBaseUrl: 'https://api.ofeed.example/',
        useSameOrigin: false,
      })
    ).toBe('https://api.ofeed.example/rest/v1/maps/tiles/session');
  });
});
