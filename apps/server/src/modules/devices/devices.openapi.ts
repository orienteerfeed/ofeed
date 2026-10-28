import { z } from '@hono/zod-openapi';

import { jsonBody, okJson, zodToOpenApiSchema } from '../../config/openapi.helpers.js';
import type { OpenApiPathItem } from '../../config/openapi.types.js';
import { API_DEFAULTS } from '../../constants/index.js';
import {
  notificationSettingsSchema,
  pushDeviceRecordSchema,
  registerPushTokenSchema,
} from './devices.schema.js';

export const DEVICES_OPENAPI = {
  tag: 'Devices',
  basePath: `${API_DEFAULTS.BASE_PATH}/devices`,
} as const;

const response = (description: string, data: z.ZodType) => ({
  description,
  content: {
    'application/json': {
      schema: zodToOpenApiSchema(
        z.object({
          message: z.string(),
          error: z.literal(false),
          code: z.literal(200),
          results: z.object({ data }),
        }),
      ),
    },
  },
});
const tags = [DEVICES_OPENAPI.tag];
const security = [{ BearerAuth: [] }];
const base = DEVICES_OPENAPI.basePath;

export const DEVICES_OPENAPI_PATHS: Record<string, OpenApiPathItem> = {
  [`${base}/push-tokens`]: {
    post: {
      tags,
      operationId: 'registerPushToken',
      summary: 'Register a phone for bank payment push notifications',
      description:
        'Upsert by user and deviceId. A token registered by another user or device moves to the caller. ' +
        'The token is never returned.',
      security,
      requestBody: jsonBody(zodToOpenApiSchema(registerPushTokenSchema)),
      responses: {
        200: response('Registered device', pushDeviceRecordSchema),
        400: okJson('Invalid JSON'),
        401: okJson('User JWT required'),
        422: okJson('Invalid token, platform or deviceId'),
      },
    },
  },
  [`${base}/push-tokens/{deviceId}`]: {
    delete: {
      tags,
      operationId: 'unregisterPushToken',
      summary: 'Remove the push token of one of your devices',
      description: 'Idempotent; unknown devices return deleted: 0.',
      security,
      parameters: [{ name: 'deviceId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: response('Removed', z.object({ deleted: z.number().int() })),
        401: okJson('User JWT required'),
      },
    },
  },
  [`${base}/notification-settings`]: {
    get: {
      tags,
      operationId: 'getNotificationSettings',
      summary: 'Bank payment push switches per matching status',
      security,
      responses: {
        200: response('Settings', notificationSettingsSchema),
        401: okJson('User JWT required'),
      },
    },
    put: {
      tags,
      operationId: 'updateNotificationSettings',
      summary: 'Switch bank payment pushes on or off per matching status',
      security,
      requestBody: jsonBody(zodToOpenApiSchema(notificationSettingsSchema)),
      responses: {
        200: response('Settings', notificationSettingsSchema),
        400: okJson('Invalid JSON'),
        401: okJson('User JWT required'),
        422: okJson('Invalid settings'),
      },
    },
  },
};
