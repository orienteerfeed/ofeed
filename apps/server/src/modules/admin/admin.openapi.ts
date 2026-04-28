import { z } from '@hono/zod-openapi';
import {
  adminCzechRankingClearResultSchema,
  adminCzechRankingEventDetailSchema,
  adminCzechRankingOverviewSchema,
  adminCzechRankingSyncResultSchema,
  adminCzechRankingUploadResultSchema,
  adminCzechRankingSnapshotDetailSchema,
  adminDashboardSchema,
  adminEventListSchema,
  adminSystemMessageListSchema,
  adminSystemMessageMutationResultSchema,
  adminSystemMessageUpdateInputSchema,
  adminSystemMessageUpsertInputSchema,
  adminUserActiveUpdateInputSchema,
  adminUserListSchema,
  adminUserMutationResultSchema,
} from '@repo/shared';

import { API_DEFAULTS } from '../../constants/index.js';
import {
  jsonBody,
  multipartBody,
  okJson,
  zodToOpenApiSchema,
} from '../../config/openapi.helpers.js';
import type { OpenApiOperation, OpenApiPathItem } from '../../config/openapi.types.js';

export const ADMIN_OPENAPI = {
  tag: 'Admin',
  basePath: `${API_DEFAULTS.BASE_PATH}/admin`,
} as const;

const bearerSecurity: NonNullable<OpenApiOperation['security']> = [{ BearerAuth: [] }];

const responseMetaSchema = z.object({
  requestId: z.string(),
  timestamp: z.string(),
});

function createEnvelopeSchema(resultsSchema: z.ZodTypeAny) {
  return z.object({
    message: z.string(),
    error: z.literal(false),
    code: z.number().int(),
    results: resultsSchema,
    meta: responseMetaSchema.optional(),
  });
}

const adminCzechRankingSyncBodySchema = z.object({
  scope: z.enum(['ALL', 'FOREST', 'SPRINT']).default('ALL'),
});

const dashboardEnvelopeSchema = createEnvelopeSchema(adminDashboardSchema);
const usersEnvelopeSchema = createEnvelopeSchema(adminUserListSchema);
const userMutationEnvelopeSchema = createEnvelopeSchema(adminUserMutationResultSchema);
const eventsEnvelopeSchema = createEnvelopeSchema(adminEventListSchema);
const systemMessagesEnvelopeSchema = createEnvelopeSchema(adminSystemMessageListSchema);
const systemMessageMutationEnvelopeSchema = createEnvelopeSchema(
  adminSystemMessageMutationResultSchema,
);
const czechRankingOverviewEnvelopeSchema = createEnvelopeSchema(adminCzechRankingOverviewSchema);
const czechRankingSnapshotDetailEnvelopeSchema = createEnvelopeSchema(
  adminCzechRankingSnapshotDetailSchema,
);
const czechRankingEventDetailEnvelopeSchema = createEnvelopeSchema(
  adminCzechRankingEventDetailSchema,
);
const czechRankingUploadEnvelopeSchema = createEnvelopeSchema(adminCzechRankingUploadResultSchema);
const czechRankingSyncEnvelopeSchema = createEnvelopeSchema(adminCzechRankingSyncResultSchema);
const czechRankingClearEnvelopeSchema = createEnvelopeSchema(adminCzechRankingClearResultSchema);

const dashboardOkResponse = {
  description: 'Admin dashboard data',
  content: {
    'application/json': {
      schema: dashboardEnvelopeSchema,
    },
  },
};

const usersOkResponse = {
  description: 'Admin users list',
  content: {
    'application/json': {
      schema: usersEnvelopeSchema,
    },
  },
};

const eventsOkResponse = {
  description: 'Admin events list',
  content: {
    'application/json': {
      schema: eventsEnvelopeSchema,
    },
  },
};

const systemMessagesOkResponse = {
  description: 'Admin system messages list',
  content: {
    'application/json': {
      schema: systemMessagesEnvelopeSchema,
    },
  },
};

const systemMessageMutationOkResponse = {
  description: 'Admin system message mutation result',
  content: {
    'application/json': {
      schema: systemMessageMutationEnvelopeSchema,
    },
  },
};

const userMutationOkResponse = {
  description: 'Admin user mutation result',
  content: {
    'application/json': {
      schema: userMutationEnvelopeSchema,
    },
  },
};

const czechRankingOverviewOkResponse = {
  description: 'Admin Czech ranking overview',
  content: {
    'application/json': {
      schema: czechRankingOverviewEnvelopeSchema,
    },
  },
};

const czechRankingSnapshotDetailOkResponse = {
  description: 'Admin Czech ranking snapshot detail',
  content: {
    'application/json': {
      schema: czechRankingSnapshotDetailEnvelopeSchema,
    },
  },
};

const czechRankingEventDetailOkResponse = {
  description: 'Admin Czech ranking event result detail',
  content: {
    'application/json': {
      schema: czechRankingEventDetailEnvelopeSchema,
    },
  },
};

const czechRankingUploadOkResponse = {
  description: 'Admin Czech ranking snapshot upload result',
  content: {
    'application/json': {
      schema: czechRankingUploadEnvelopeSchema,
    },
  },
};

const czechRankingSyncOkResponse = {
  description: 'Admin Czech ranking ORIS sync result',
  content: {
    'application/json': {
      schema: czechRankingSyncEnvelopeSchema,
    },
  },
};

const czechRankingClearOkResponse = {
  description: 'Admin Czech ranking clear result',
  content: {
    'application/json': {
      schema: czechRankingClearEnvelopeSchema,
    },
  },
};

const adminBase = ADMIN_OPENAPI.basePath;
const adminUserPath = `${adminBase}/users/{userId}`;
const adminSystemMessagePath = `${adminBase}/system-messages/{messageId}`;
const czechRankingBase = `${adminBase}/ranking/czech`;
const czechRankingSnapshotsPath = `${czechRankingBase}/snapshots`;
const czechRankingEventResultsPath = `${czechRankingBase}/event-results`;
const czechRankingOrisSyncPath = `${czechRankingBase}/oris-sync`;

export const ADMIN_OPENAPI_PATHS: Record<string, OpenApiPathItem> = {
  [`${adminBase}/dashboard`]: {
    get: {
      tags: [ADMIN_OPENAPI.tag],
      operationId: 'adminDashboard',
      summary: 'Get admin dashboard overview',
      security: bearerSecurity,
      responses: {
        200: dashboardOkResponse,
        401: okJson('Unauthorized'),
        403: okJson('Forbidden'),
      },
    },
  },
  [`${adminBase}/users`]: {
    get: {
      tags: [ADMIN_OPENAPI.tag],
      operationId: 'adminUsers',
      summary: 'Get admin users list',
      security: bearerSecurity,
      parameters: [
        {
          name: 'page',
          in: 'query',
          required: false,
          schema: { type: 'integer', minimum: 1, default: 1 },
          description: 'Page number (1-indexed)',
        },
        {
          name: 'limit',
          in: 'query',
          required: false,
          schema: { type: 'integer', minimum: 1, maximum: 200, default: 25 },
          description: 'Items per page',
        },
      ],
      responses: {
        200: usersOkResponse,
        401: okJson('Unauthorized'),
        403: okJson('Forbidden'),
        422: okJson('Invalid pagination parameters'),
      },
    },
  },
  [adminUserPath]: {
    patch: {
      tags: [ADMIN_OPENAPI.tag],
      operationId: 'adminUpdateUser',
      summary: 'Update admin user active state',
      security: bearerSecurity,
      parameters: [
        {
          name: 'userId',
          in: 'path',
          required: true,
          schema: { type: 'integer', minimum: 1 },
        },
      ],
      requestBody: jsonBody(zodToOpenApiSchema(adminUserActiveUpdateInputSchema)),
      responses: {
        200: userMutationOkResponse,
        401: okJson('Unauthorized'),
        403: okJson('Forbidden'),
        404: okJson('User not found'),
        409: okJson('Mutation rejected'),
        422: okJson('Validation error'),
      },
    },
    delete: {
      tags: [ADMIN_OPENAPI.tag],
      operationId: 'adminDeleteUser',
      summary: 'Delete admin user account',
      security: bearerSecurity,
      parameters: [
        {
          name: 'userId',
          in: 'path',
          required: true,
          schema: { type: 'integer', minimum: 1 },
        },
      ],
      responses: {
        200: userMutationOkResponse,
        401: okJson('Unauthorized'),
        403: okJson('Forbidden'),
        404: okJson('User not found'),
        409: okJson('Mutation rejected'),
        422: okJson('Validation error'),
      },
    },
  },
  [`${adminBase}/events`]: {
    get: {
      tags: [ADMIN_OPENAPI.tag],
      operationId: 'adminEvents',
      summary: 'Get admin events list',
      security: bearerSecurity,
      parameters: [
        {
          name: 'page',
          in: 'query',
          required: false,
          schema: { type: 'integer', minimum: 1, default: 1 },
          description: 'Page number (1-indexed)',
        },
        {
          name: 'limit',
          in: 'query',
          required: false,
          schema: { type: 'integer', minimum: 1, maximum: 200, default: 25 },
          description: 'Items per page',
        },
      ],
      responses: {
        200: eventsOkResponse,
        401: okJson('Unauthorized'),
        403: okJson('Forbidden'),
        422: okJson('Invalid pagination parameters'),
      },
    },
  },
  [`${adminBase}/system-messages`]: {
    get: {
      tags: [ADMIN_OPENAPI.tag],
      operationId: 'adminSystemMessages',
      summary: 'Get admin system messages list',
      security: bearerSecurity,
      responses: {
        200: systemMessagesOkResponse,
        401: okJson('Unauthorized'),
        403: okJson('Forbidden'),
      },
    },
    post: {
      tags: [ADMIN_OPENAPI.tag],
      operationId: 'adminCreateSystemMessage',
      summary: 'Create admin system message',
      security: bearerSecurity,
      requestBody: jsonBody(zodToOpenApiSchema(adminSystemMessageUpsertInputSchema)),
      responses: {
        200: systemMessageMutationOkResponse,
        401: okJson('Unauthorized'),
        403: okJson('Forbidden'),
        422: okJson('Validation error'),
      },
    },
  },
  [adminSystemMessagePath]: {
    patch: {
      tags: [ADMIN_OPENAPI.tag],
      operationId: 'adminUpdateSystemMessage',
      summary: 'Update admin system message',
      security: bearerSecurity,
      parameters: [
        {
          name: 'messageId',
          in: 'path',
          required: true,
          schema: { type: 'integer', minimum: 1 },
        },
      ],
      requestBody: jsonBody(zodToOpenApiSchema(adminSystemMessageUpdateInputSchema)),
      responses: {
        200: systemMessageMutationOkResponse,
        401: okJson('Unauthorized'),
        403: okJson('Forbidden'),
        404: okJson('System message not found'),
        422: okJson('Validation error'),
      },
    },
    delete: {
      tags: [ADMIN_OPENAPI.tag],
      operationId: 'adminDeleteSystemMessage',
      summary: 'Delete admin system message',
      security: bearerSecurity,
      parameters: [
        {
          name: 'messageId',
          in: 'path',
          required: true,
          schema: { type: 'integer', minimum: 1 },
        },
      ],
      responses: {
        200: systemMessageMutationOkResponse,
        401: okJson('Unauthorized'),
        403: okJson('Forbidden'),
        404: okJson('System message not found'),
        422: okJson('Validation error'),
      },
    },
  },
  [czechRankingBase]: {
    get: {
      tags: [ADMIN_OPENAPI.tag],
      operationId: 'adminCzechRankingOverview',
      summary: 'Get Czech ranking admin overview',
      security: bearerSecurity,
      responses: {
        200: czechRankingOverviewOkResponse,
        401: okJson('Unauthorized'),
        403: okJson('Forbidden'),
      },
    },
  },
  [czechRankingSnapshotsPath]: {
    get: {
      tags: [ADMIN_OPENAPI.tag],
      operationId: 'adminCzechRankingSnapshotDetail',
      summary: 'Get Czech ranking snapshot detail',
      security: bearerSecurity,
      parameters: [
        {
          name: 'rankingType',
          in: 'query',
          required: true,
          schema: { type: 'string', enum: ['FOREST', 'SPRINT'] },
        },
        {
          name: 'rankingCategory',
          in: 'query',
          required: true,
          schema: { type: 'string', enum: ['M', 'F'] },
        },
        {
          name: 'validForMonth',
          in: 'query',
          required: true,
          schema: {
            type: 'string',
            pattern: '^\\d{4}-\\d{2}$',
            example: '2026-02',
          },
        },
      ],
      responses: {
        200: czechRankingSnapshotDetailOkResponse,
        401: okJson('Unauthorized'),
        403: okJson('Forbidden'),
        404: okJson('Dataset not found'),
        422: okJson('Validation error'),
      },
    },
    post: {
      tags: [ADMIN_OPENAPI.tag],
      operationId: 'adminUploadCzechRankingSnapshot',
      summary: 'Upload Czech ranking snapshot CSV/TXT',
      security: bearerSecurity,
      requestBody: multipartBody({
        type: 'object',
        properties: {
          rankingType: {
            type: 'string',
            enum: ['FOREST', 'SPRINT'],
          },
          rankingCategory: {
            type: 'string',
            enum: ['M', 'F'],
          },
          validForMonth: {
            type: 'string',
            pattern: '^\\d{4}-\\d{2}$',
            example: '2026-02',
          },
          file: { type: 'string', format: 'binary' },
        },
        required: ['rankingType', 'rankingCategory', 'validForMonth', 'file'],
      }),
      responses: {
        200: czechRankingUploadOkResponse,
        401: okJson('Unauthorized'),
        403: okJson('Forbidden'),
        422: okJson('Validation error'),
      },
    },
    delete: {
      tags: [ADMIN_OPENAPI.tag],
      operationId: 'adminClearCzechRankingSnapshots',
      summary: 'Clear Czech ranking snapshots',
      security: bearerSecurity,
      parameters: [
        {
          name: 'rankingType',
          in: 'query',
          required: false,
          schema: { type: 'string', enum: ['FOREST', 'SPRINT'] },
        },
        {
          name: 'rankingCategory',
          in: 'query',
          required: false,
          schema: { type: 'string', enum: ['M', 'F'] },
        },
        {
          name: 'validForMonth',
          in: 'query',
          required: false,
          schema: {
            type: 'string',
            pattern: '^\\d{4}-\\d{2}$',
            example: '2026-02',
          },
        },
      ],
      responses: {
        200: czechRankingClearOkResponse,
        401: okJson('Unauthorized'),
        403: okJson('Forbidden'),
        422: okJson('Validation error'),
      },
    },
  },
  [czechRankingEventResultsPath]: {
    get: {
      tags: [ADMIN_OPENAPI.tag],
      operationId: 'adminCzechRankingEventResultsDetail',
      summary: 'Get Czech ranking synced event result detail',
      security: bearerSecurity,
      parameters: [
        {
          name: 'externalEventId',
          in: 'query',
          required: true,
          schema: { type: 'string' },
        },
        {
          name: 'rankingType',
          in: 'query',
          required: true,
          schema: { type: 'string', enum: ['FOREST', 'SPRINT'] },
        },
        {
          name: 'rankingCategory',
          in: 'query',
          required: true,
          schema: { type: 'string', enum: ['M', 'F'] },
        },
      ],
      responses: {
        200: czechRankingEventDetailOkResponse,
        401: okJson('Unauthorized'),
        403: okJson('Forbidden'),
        404: okJson('Dataset not found'),
        422: okJson('Validation error'),
      },
    },
    delete: {
      tags: [ADMIN_OPENAPI.tag],
      operationId: 'adminClearCzechRankingEventResults',
      summary: 'Clear Czech ranking synced event results',
      security: bearerSecurity,
      parameters: [
        {
          name: 'externalEventId',
          in: 'query',
          required: false,
          schema: { type: 'string' },
        },
        {
          name: 'rankingType',
          in: 'query',
          required: false,
          schema: { type: 'string', enum: ['FOREST', 'SPRINT'] },
        },
        {
          name: 'rankingCategory',
          in: 'query',
          required: false,
          schema: { type: 'string', enum: ['M', 'F'] },
        },
      ],
      responses: {
        200: czechRankingClearOkResponse,
        401: okJson('Unauthorized'),
        403: okJson('Forbidden'),
        422: okJson('Validation error'),
      },
    },
  },
  [czechRankingOrisSyncPath]: {
    post: {
      tags: [ADMIN_OPENAPI.tag],
      operationId: 'adminSyncCzechRankingOrisResults',
      summary: 'Force Czech ranking ORIS synchronization',
      security: bearerSecurity,
      requestBody: jsonBody(zodToOpenApiSchema(adminCzechRankingSyncBodySchema)),
      responses: {
        200: czechRankingSyncOkResponse,
        401: okJson('Unauthorized'),
        403: okJson('Forbidden'),
        422: okJson('Validation error'),
      },
    },
  },
};
