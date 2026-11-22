import { eventHeartbeatSchema, externalLiveDeviceSchema } from '@repo/shared';
import { zodToOpenApiSchema, jsonBody, okJson } from '../../config/openapi.helpers.js';
import type { OpenApiPathItem } from '../../config/openapi.types.js';
import { API_DEFAULTS } from '../../constants/index.js';
export const LIVE_STATUS_OPENAPI_PATHS: Record<string, OpenApiPathItem> = {
  [`${API_DEFAULTS.BASE_PATH}/events/{eventId}/live-status/devices`]: {
    post: {
      tags: ['Events'],
      operationId: 'registerEventApplicationDevice',
      summary: 'Register an application instance',
      security: [{ BasicAuth: [] }],
      description:
        'Event ID and current event password via Basic auth. Stable source UUID makes registration idempotent. Revoked devices cannot register again; no bearer token is issued.',
      parameters: [{ name: 'eventId', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: jsonBody(zodToOpenApiSchema(externalLiveDeviceSchema)),
      responses: {
        200: okJson('Registered device identity in results.data; no token'),
        400: okJson('Malformed JSON'),
        401: okJson('Event password required'),
        403: okJson('Wrong event or revoked device'),
        422: okJson('Invalid application identity'),
      },
    },
  },

  [`${API_DEFAULTS.BASE_PATH}/events/{eventId}/live-status/heartbeat`]: {
    post: {
      tags: ['Events'],
      operationId: 'ingestDeviceHeartbeat',
      summary: 'Record device telemetry',
      description:
        'Accepts existing per-device bearer tokens, or event-password Basic auth for application producers with sourceType and sourceId; Basic requests idempotently register the source. The token is restricted to this event and telemetry only. Monitoring must be active. Repeated messageId is acknowledged without changing availability or history. SQL commits before acknowledgement. GSM RSRP/RSSI and LoRa RSSI use dBm; SNR uses dB.',
      security: [{ BearerAuth: [] }, { BasicAuth: [] }],
      parameters: [{ name: 'eventId', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: jsonBody(zodToOpenApiSchema(eventHeartbeatSchema)),
      responses: {
        200: okJson('Recorded; results.data contains duplicate and receivedAt'),
        400: okJson('Malformed JSON; correct the payload before retrying'),
        401: okJson('Invalid or revoked device token'),
        409: okJson('Monitoring is not active'),
        422: okJson('Invalid heartbeat'),
        429: okJson('Device ingest rate exceeded'),
        500: okJson('Not recorded; retry using the same messageId'),
      },
    },
  },
};
