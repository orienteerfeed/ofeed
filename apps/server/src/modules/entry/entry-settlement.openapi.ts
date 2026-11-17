import type { OpenApiPathItem } from '../../config/openapi.types.js';
import { okJson } from '../../config/openapi.helpers.js';
import { API_DEFAULTS } from '../../constants/index.js';
export const ENTRY_SETTLEMENT_OPENAPI_PATHS: Record<string, OpenApiPathItem> = {
  [`${API_DEFAULTS.BASE_PATH}/events/{eventId}/entries/{entryId}/settlement.pdf`]: {
    get: {
      tags: ['Events'],
      operationId: 'downloadEntrySettlement',
      summary: 'Download current entry settlement PDF',
      description:
        'Requires event owner/admin JWT or the existing single-entry signed access token. Only PROCESSED entries with settlement enabled. Current prices and actual receipts; no tax invoice or archival guarantee. Returns a private no-store attachment.',
      security: [{ BearerAuth: [] }, {}],
      parameters: [
        { name: 'eventId', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'entryId', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'access', in: 'query', required: false, schema: { type: 'string' } },
      ],
      responses: {
        200: {
          description: 'Current settlement PDF',
          content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } },
        },
        401: okJson('Missing or invalid access'),
        403: okJson('Event owner/admin required'),
        404: okJson('Event-scoped entry not found'),
        409: okJson('Settlement unavailable or inconsistent accounting data'),
      },
    },
  },
};
