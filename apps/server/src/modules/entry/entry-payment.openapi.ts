import { z } from '@hono/zod-openapi';
import { entryPaymentInsightSchema } from '@repo/shared';
import { jsonBody, okJson, zodToOpenApiSchema } from '../../config/openapi.helpers.js';
import type { OpenApiPathItem } from '../../config/openapi.types.js';
import { API_DEFAULTS } from '../../constants/index.js';
import { createEntryPaymentSchema, entryPaymentRecordSchema } from './entry-payment.schema.js';

const response = (data: z.ZodType, code: 200 | 201) => ({
  description: code === 201 ? 'New payment receipt recorded' : 'Payment receipts',
  content: {
    'application/json': {
      schema: zodToOpenApiSchema(
        z.object({
          message: z.string(),
          error: z.literal(false),
          code: z.literal(code),
          results: z.object({ data }),
        }),
      ),
    },
  },
});
const parameters = [
  { name: 'eventId', in: 'path' as const, required: true, schema: { type: 'string' as const } },
];
const errors = {
  401: okJson('User JWT required'),
  403: okJson('Event owner or admin required'),
  404: okJson('Event or event-scoped entry not found'),
  422: okJson('Invalid payment, query or entry currency mismatch'),
};

export const ENTRY_PAYMENT_OPENAPI_PATHS: Record<string, OpenApiPathItem> = {
  [`${API_DEFAULTS.BASE_PATH}/events/{eventId}/insights/payments`]: {
    get: {
      tags: ['Events'],
      operationId: 'listPaymentInsights',
      summary: 'List received payments with entry references and contact names',
      description:
        'User JWT; event owner or admin. Complete read-only dataset ordered by paidAt descending, then ID ascending. Includes current entry reference and contact names. Group monetary totals by currency. No manual paid flags are included.',
      security: [{ BearerAuth: [] }],
      parameters,
      responses: { 200: response(z.array(entryPaymentInsightSchema), 200), ...errors },
    },
  },
  [`${API_DEFAULTS.BASE_PATH}/events/{eventId}/entries/{entryId}/payments`]: {
    post: {
      tags: ['Events'],
      operationId: 'recordEntryPayment',
      summary: 'Record a CASH or QR receipt',
      description:
        'User JWT; event owner or admin. Immutable receipt, operatorId from authenticated user. ' +
        'clientPaymentId is unique per event across entries and devices. Identical retries return 200; ' +
        'changed payloads return 409. Amount must be positive with at most two decimals and currency ' +
        'must match the entry. paidAt requires a timezone and at most millisecond precision. ' +
        'QR means an asserted received payment, not QR instructions. Partial and excess payments are ' +
        'allowed. Atomically recalculates entry paid status from receipt totals. Manual paid overrides ' +
        'are rejected once receipts exist.',
      security: [{ BearerAuth: [] }],
      parameters: [
        ...parameters,
        { name: 'entryId', in: 'path', required: true, schema: { type: 'string' } },
      ],
      requestBody: jsonBody(zodToOpenApiSchema(createEntryPaymentSchema)),
      responses: {
        200: response(entryPaymentRecordSchema, 200),
        201: response(entryPaymentRecordSchema, 201),
        400: okJson('Invalid JSON'),
        ...errors,
        409: okJson('clientPaymentId reused with a different payload'),
      },
    },
  },
  [`${API_DEFAULTS.BASE_PATH}/events/{eventId}/payments`]: {
    get: {
      tags: ['Events'],
      operationId: 'listEventPayments',
      summary: 'List payment receipts for closing',
      description:
        'User JWT; event owner or admin. All matching receipts ordered by recordedAt then ID. ' +
        'since inclusively filters server recordedAt, not client paidAt, so late offline uploads appear. ' +
        'Omit since for a complete closing report. Deduplicate overlapping incremental reads by receipt ID. ' +
        'Amounts are JSON numbers; group by currency and method when calculating totals.',
      security: [{ BearerAuth: [] }],
      parameters: [
        ...parameters,
        {
          name: 'entryId',
          in: 'query',
          required: false,
          schema: { type: 'string', minLength: 1 },
        },
        {
          name: 'since',
          in: 'query',
          required: false,
          schema: { type: 'string', format: 'date-time' },
        },
        {
          name: 'deviceId',
          in: 'query',
          required: false,
          schema: { type: 'string', minLength: 1, maxLength: 191 },
        },
      ],
      responses: { 200: response(z.array(entryPaymentRecordSchema), 200), ...errors },
    },
  },
};
