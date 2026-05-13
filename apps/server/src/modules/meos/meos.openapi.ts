import type { OpenApiPathItem } from '../../config/openapi.types.js';
import { API_DEFAULTS } from '../../constants/index.js';

export const MEOS_OPENAPI = {
  tag: 'Upload',
  basePath: `${API_DEFAULTS.BASE_PATH}/upload`,
} as const;

const meosBase = `${MEOS_OPENAPI.basePath}/meos`;

export const MEOS_OPENAPI_PATHS: Record<string, OpenApiPathItem> = {
  [meosBase]: {
    post: {
      tags: [MEOS_OPENAPI.tag],
      operationId: 'uploadMeosMop',
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
};
