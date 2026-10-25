import { z } from '@hono/zod-openapi';
import { jsonBody, okJson, zodToOpenApiSchema } from '../../config/openapi.helpers.js';
import type { OpenApiPathItem } from '../../config/openapi.types.js';
import { API_DEFAULTS } from '../../constants/index.js';
import { punchBatchSchema, punchResultSchema } from './punch.schema.js';

const response = z.object({
  message: z.string(),
  error: z.literal(false),
  code: z.literal(200),
  results: z.object({ data: z.array(punchResultSchema) }),
});

export const PUNCH_OPENAPI_PATHS: Record<string, OpenApiPathItem> = {
  [`${API_DEFAULTS.BASE_PATH}/events/{eventId}/punches`]: {
    post: {
      tags: ['Events'],
      operationId: 'ingestEventPunches',
      summary: 'Ingest SRR or SI readout punches',
      description:
        'User JWT; event owner or admin. Unknown or ambiguous cards remain stored. ' +
        'Retries use event/device/clientPunchId; changed retry payloads reject the batch. ' +
        'Physical punches deduplicate by event/card/control/UTC millisecond time. ' +
        'Codes 0/-1/-2 mean start/finish/check. Results retain request order. ' +
        'A duplicate can promote SRR to READOUT; UNKNOWN_CARD also covers unresolved race windows.',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'eventId', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: jsonBody(zodToOpenApiSchema(punchBatchSchema)),
      responses: {
        200: {
          description: 'Punch receipts stored atomically',
          content: {
            'application/json': { schema: zodToOpenApiSchema(response) },
          },
        },
        400: okJson('Invalid JSON'),
        401: okJson('User JWT required'),
        403: okJson('Not authorized for this event'),
        404: okJson('Event not found'),
        409: okJson('clientPunchId reused with a different payload; batch rolled back'),
        422: okJson('Invalid punch batch'),
        500: okJson('Ingestion failed; batch rolled back'),
      },
    },
  },
};
