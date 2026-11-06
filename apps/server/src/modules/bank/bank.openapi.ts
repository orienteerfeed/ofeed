import { z } from '@hono/zod-openapi';

import { jsonBody, okJson, zodToOpenApiSchema } from '../../config/openapi.helpers.js';
import type { OpenApiPathItem } from '../../config/openapi.types.js';
import { API_DEFAULTS } from '../../constants/index.js';
import {
  bankBatchResultSchema,
  bankConnectionRecordSchema,
  bankSyncReportSchema,
  bankTransactionBatchSchema,
  bankTransactionRecordSchema,
  createBankConnectionSchema,
  manualMatchSchema,
  updateBankConnectionSchema,
} from './bank.schema.js';

export const BANK_CONNECTION_OPENAPI = {
  tag: 'Bank import',
  basePath: `${API_DEFAULTS.BASE_PATH}/bank-connections`,
} as const;

export const BANK_TRANSACTION_OPENAPI = {
  tag: BANK_CONNECTION_OPENAPI.tag,
  basePath: `${API_DEFAULTS.BASE_PATH}/bank-transactions`,
} as const;

const resultsResponse = (description: string, results: z.ZodType, code: 200 | 201 = 200) => ({
  description,
  content: {
    'application/json': {
      schema: zodToOpenApiSchema(
        z.object({
          message: z.string(),
          error: z.literal(false),
          code: z.literal(code),
          results,
        }),
      ),
    },
  },
});
const response = (description: string, data: z.ZodType, code: 200 | 201 = 200) =>
  resultsResponse(description, z.object({ data }), code);
const id = (name = 'id') => ({
  name,
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const },
});
const tags = [BANK_CONNECTION_OPENAPI.tag];
const security = [{ BearerAuth: [] }];
const errors = {
  401: okJson('User JWT required'),
  404: okJson('Not found or owned by another user'),
  422: okJson('Invalid request'),
};
const connection = BANK_CONNECTION_OPENAPI.basePath;
const transaction = BANK_TRANSACTION_OPENAPI.basePath;
const statusQuery = {
  name: 'status',
  in: 'query' as const,
  required: false,
  schema: {
    type: 'string' as const,
    enum: ['MATCHED', 'UNMATCHED', 'AMBIGUOUS', 'PARTIALLY_PAID', 'OVERPAID', 'IGNORED'],
  },
};

export const BANK_OPENAPI_PATHS: Record<string, OpenApiPathItem> = {
  [connection]: {
    post: {
      tags,
      operationId: 'createBankConnection',
      summary: 'Register a bank account polled by the desktop collector',
      description:
        'Owner from the JWT. The account is the organizer IBAN, never a bank API token. ' +
        'An existing connection for the same owner, provider and account is returned with 200.',
      security,
      requestBody: jsonBody(zodToOpenApiSchema(createBankConnectionSchema)),
      responses: {
        200: response('Existing connection', bankConnectionRecordSchema),
        201: response('New connection', bankConnectionRecordSchema, 201),
        400: okJson('Invalid JSON'),
        ...errors,
      },
    },
    get: {
      tags,
      operationId: 'listBankConnections',
      summary: 'List own bank connections',
      security,
      responses: {
        200: response('Bank connections', z.array(bankConnectionRecordSchema)),
        401: errors[401],
      },
    },
  },
  [`${connection}/{id}`]: {
    patch: {
      tags,
      operationId: 'updateBankConnection',
      summary: 'Rename, pause, resume or change the variable symbol prefix',
      description:
        'A prefix change requires prefixEffectiveFrom, which cannot be in the past (UTC): ' +
        'prefix changes are never retroactive.',
      security,
      parameters: [id()],
      requestBody: jsonBody(zodToOpenApiSchema(updateBankConnectionSchema)),
      responses: { 200: response('Updated', bankConnectionRecordSchema), ...errors },
    },
    delete: {
      tags,
      operationId: 'revokeBankConnection',
      summary: 'Revoke a bank connection',
      description: 'Sets status REVOKED. Later reports return 409. Stored transactions are kept.',
      security,
      parameters: [id()],
      responses: { 200: response('Revoked', bankConnectionRecordSchema), ...errors },
    },
  },
  [`${connection}/{id}/transactions`]: {
    post: {
      tags,
      operationId: 'reportBankTransactions',
      summary: 'Report 1 to 200 incoming bank transactions',
      description:
        'Each item is validated and processed independently; results keep request order. ' +
        'Statuses: MATCHED, PARTIALLY_PAID, OVERPAID (a receipt was written), UNMATCHED, ' +
        'AMBIGUOUS, IGNORED (prefix or effective date), DUPLICATE (already stored, treat as ' +
        'success) and INVALID. The amount is compared with the outstanding order amount, the ' +
        'currency must equal the order currency. TEST connections and SIMULATED items match ' +
        'demo events only. Optional Idempotency-Key header (1-255 visible ASCII); replays ' +
        'return DUPLICATE per item. Items: providerTransactionId (Fio IDpohyb, digits), ' +
        'amount ("1490.00"), currency (ISO 4217), variableSymbol (1-10 digits), ' +
        'bookingDate (YYYY-MM-DD), source (BANK_API or SIMULATED).',
      security,
      parameters: [
        id(),
        {
          name: 'Idempotency-Key',
          in: 'header',
          required: false,
          schema: { type: 'string', minLength: 1, maxLength: 255 },
        },
      ],
      requestBody: jsonBody(zodToOpenApiSchema(bankTransactionBatchSchema)),
      responses: {
        200: response('Per-item results', z.array(bankBatchResultSchema)),
        400: okJson('Invalid JSON'),
        ...errors,
        409: okJson('Connection paused or revoked'),
      },
    },
    get: {
      tags,
      operationId: 'listBankConnectionTransactions',
      summary: 'List reported transactions of a connection',
      description:
        'Ordered by receivedAt then ID. Pass results.nextCursor as cursor for the next page.',
      security,
      parameters: [
        id(),
        statusQuery,
        { name: 'since', in: 'query', required: false, schema: { type: 'string' } },
        {
          name: 'limit',
          in: 'query',
          required: false,
          schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
        },
        { name: 'cursor', in: 'query', required: false, schema: { type: 'string' } },
      ],
      responses: {
        200: resultsResponse(
          'Bank transactions',
          z.object({
            data: z.array(bankTransactionRecordSchema),
            nextCursor: z.string().nullable(),
          }),
        ),
        ...errors,
      },
    },
  },
  [`${connection}/{id}/sync-reports`]: {
    post: {
      tags,
      operationId: 'reportBankSync',
      summary: 'Collector heartbeat and run counts',
      description: 'Send after every run, also when nothing was found. Logs are kept 90 days.',
      security,
      parameters: [id()],
      requestBody: jsonBody(zodToOpenApiSchema(bankSyncReportSchema)),
      responses: {
        201: response('Recorded', bankConnectionRecordSchema, 201),
        ...errors,
        409: okJson('Connection paused or revoked'),
      },
    },
  },
  [`${transaction}/{id}/match`]: {
    post: {
      tags,
      operationId: 'matchBankTransaction',
      summary: 'Manually match an UNMATCHED or AMBIGUOUS transaction to an open order',
      security,
      parameters: [id()],
      requestBody: jsonBody(zodToOpenApiSchema(manualMatchSchema)),
      responses: {
        200: response('Matched', bankTransactionRecordSchema),
        ...errors,
        409: okJson('Already resolved or not matchable'),
      },
    },
  },
  [`${transaction}/{id}/ignore`]: {
    post: {
      tags,
      operationId: 'ignoreBankTransaction',
      summary: 'Ignore an UNMATCHED or AMBIGUOUS transaction',
      security,
      parameters: [id()],
      responses: {
        200: response('Ignored', bankTransactionRecordSchema),
        ...errors,
        409: okJson('Already resolved'),
      },
    },
  },
  [`${API_DEFAULTS.BASE_PATH}/events/{eventId}/bank-transactions`]: {
    get: {
      tags,
      operationId: 'listEventBankTransactions',
      summary: "Bank transactions matched to the event's orders",
      description: 'User JWT; event owner or admin.',
      security,
      parameters: [id('eventId'), statusQuery],
      responses: {
        200: response('Bank transactions', z.array(bankTransactionRecordSchema)),
        ...errors,
        403: okJson('Event owner or admin required'),
      },
    },
  },
};
