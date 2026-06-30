import type { OpenApiPathItem } from '../../config/openapi.types.js';
import { API_DEFAULTS } from '../../constants/index.js';

export const MEOS_OPENAPI = {
  tag: 'MeOS',
  basePath: `${API_DEFAULTS.BASE_PATH}/meos`,
} as const;

const mopPath = `${MEOS_OPENAPI.basePath}/mop`;
const mipPath = `${MEOS_OPENAPI.basePath}/mip`;

export const MEOS_OPENAPI_PATHS: Record<string, OpenApiPathItem> = {
  [mopPath]: {
    post: {
      tags: [MEOS_OPENAPI.tag],
      operationId: 'meosMopUpload',
      summary: 'Receive live results from MeOS via MOP',
      description:
        'Accepts MeOS Online Protocol (MOP) XML payloads (MOPComplete or MOPDiff). ' +
        'Always returns HTTP 200 with a MOP-compatible XML response body.',
      parameters: [
        {
          name: 'competition',
          in: 'header',
          required: true,
          schema: { type: 'integer' },
          description: 'MeOS competition ID',
        },
        {
          name: 'pwd',
          in: 'header',
          required: true,
          schema: { type: 'string' },
          description: 'Plaintext password matching an active, non-expired event EventPassword',
        },
      ],
      requestBody: {
        required: true,
        content: {
          'text/plain': {
            schema: { type: 'string', description: 'MOP XML body (MOPComplete or MOPDiff)' },
          },
        },
      },
      responses: {
        200: {
          description: 'MOP status response (OK, BADCMP, BADPWD, NOZIP, or ERROR)',
          content: {
            'text/xml': {
              schema: {
                type: 'string',
                example: '<?xml version="1.0"?><MOPStatus status="OK"></MOPStatus>',
              },
            },
          },
        },
      },
    },
  },
  [mipPath]: {
    get: {
      tags: [MEOS_OPENAPI.tag],
      operationId: 'meosMipPoll',
      summary: 'Poll competitor changes for MeOS via MIP',
      description:
        'Returns MeOS Input Protocol (MIP) XML for competitor entry changes newer than the ' +
        'Protocol id supplied in the lastid header.',
      security: [],
      parameters: [
        {
          name: 'competition',
          in: 'header',
          required: true,
          schema: { type: 'integer' },
          description: 'EventMeosBinding id.',
        },
        {
          name: 'lastid',
          in: 'header',
          required: false,
          schema: { type: 'integer', minimum: 0, default: 0 },
          description: 'Last Protocol id received by MeOS.',
        },
        {
          name: 'pwd',
          in: 'header',
          required: true,
          schema: { type: 'string' },
          description: 'Plaintext password matching an active, non-expired event EventPassword.',
        },
      ],
      responses: {
        200: {
          description:
            'MIP XML response, or MeOS status XML (BADCMP, BADPWD, ERROR) for protocol-level errors.',
          content: {
            'application/xml': {
              schema: {
                type: 'string',
                example:
                  '<?xml version="1.0" encoding="UTF-8"?><MIPData xmlns="http://www.melin.nu/mip" lastid="42"></MIPData>',
              },
            },
          },
        },
        400: {
          description: 'Invalid lastid header. Body is an empty MIP XML document.',
          content: { 'application/xml': { schema: { type: 'string' } } },
        },
      },
    },
  },
};
