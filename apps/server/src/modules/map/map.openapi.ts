import {
  SUPPORTED_MAP_TILE_LANGS,
  SUPPORTED_MAP_TILE_MAPSETS,
  SUPPORTED_MAP_TILE_SIZES,
} from '@repo/shared';

import { API_DEFAULTS } from '../../constants/index.js';
import type { OpenApiPathItem } from '../../config/openapi.types.js';

export const MAP_OPENAPI = {
  tag: 'Map',
  basePath: `${API_DEFAULTS.BASE_PATH}/maps`,
} as const;

const mapTilesPath = `${MAP_OPENAPI.basePath}/tiles/raster/{mapset}/{tileSize}/{z}/{x}/{y}`;
const mapTileSessionPath = `${MAP_OPENAPI.basePath}/tiles/session`;

export const MAP_OPENAPI_PATHS: Record<string, OpenApiPathItem> = {
  [mapTileSessionPath]: {
    post: {
      tags: [MAP_OPENAPI.tag],
      operationId: 'createMapTileSession',
      summary: 'Create map tile session',
      description:
        'Issues a short-lived same-site cookie required for protected raster tile access in production deployments.',
      security: [],
      responses: {
        204: {
          description: 'Map tile session cookie issued',
        },
        503: {
          description: 'Map provider is not configured',
        },
      },
    },
  },
  [mapTilesPath]: {
    get: {
      tags: [MAP_OPENAPI.tag],
      operationId: 'mapRasterTileProxy',
      summary: 'Get raster map tile',
      description:
        'App-specific proxy for Mapy.com raster tiles with configurable mapset, tile size, zoom and localized labels.',
      security: [],
      parameters: [
        {
          name: 'mapset',
          in: 'path',
          required: true,
          schema: {
            type: 'string',
            enum: [...SUPPORTED_MAP_TILE_MAPSETS],
          },
        },
        {
          name: 'tileSize',
          in: 'path',
          required: true,
          schema: {
            type: 'string',
            enum: [...SUPPORTED_MAP_TILE_SIZES],
          },
        },
        {
          name: 'z',
          in: 'path',
          required: true,
          schema: { type: 'integer', minimum: 0, maximum: 20 },
        },
        {
          name: 'x',
          in: 'path',
          required: true,
          schema: { type: 'integer', minimum: 0 },
        },
        {
          name: 'y',
          in: 'path',
          required: true,
          schema: { type: 'integer', minimum: 0 },
        },
        {
          name: 'lang',
          in: 'query',
          required: false,
          schema: { type: 'string', enum: [...SUPPORTED_MAP_TILE_LANGS] },
        },
      ],
      responses: {
        200: {
          description: 'Map tile image',
          content: {
            'image/png': {
              schema: { type: 'string', format: 'binary' },
            },
          },
        },
        422: {
          description: 'Invalid tile request',
        },
        403: {
          description: 'Missing or invalid map tile session',
        },
        502: {
          description: 'Upstream map provider error',
        },
        503: {
          description: 'Map provider is not configured',
        },
      },
    },
  },
};
