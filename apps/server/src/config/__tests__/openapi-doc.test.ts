import { describe, expect, it } from 'vitest';

import app from '../../app.js';
import { OPENAPI_PATHS } from '../openapi.paths.js';
import { AUTH_OPENAPI } from '../../modules/auth/auth.openapi.js';
import { EVENT_OPENAPI } from '../../modules/event/event.openapi.js';
import { HEALTH_OPENAPI } from '../../modules/health/health.openapi.js';
import { UPLOAD_OPENAPI } from '../../modules/upload/upload.openapi.js';

describe('openapi doc', () => {
  it('exposes only the standard liveness and readiness probes', async () => {
    const response = await app.request('/doc');
    expect(response.status).toBe(200);

    const document = await response.json();
    const paths = document?.paths ?? {};

    expect(paths[HEALTH_OPENAPI.healthzPath]?.get).toBeDefined();
    expect(paths[HEALTH_OPENAPI.readyzPath]?.get).toBeDefined();
    expect(paths['/health']).toBeUndefined();
    expect(paths['/health/live']).toBeUndefined();
    expect(paths['/health/ready']).toBeUndefined();
  });

  it('publishes optional entry details, typed fee breakdowns and unconfigured-entry conflicts', async () => {
    const response = await app.request('/doc');
    const document = await response.json();
    const create = document.paths[`${EVENT_OPENAPI.basePath}/{eventId}/entries`].post;
    const item = create.requestBody.content['application/json'].schema.properties.items.items;
    expect(item.allOf).toBeUndefined();
    for (const field of ['registration', 'birthYear', 'card', 'cardRental']) {
      expect(item.properties[field]).toBeDefined();
      expect(item.required ?? []).not.toContain(field);
    }
    expect(item.description).toContain('required only for age-restricted classes');
    expect(create.responses['409'].description).toContain('not configured');
    expect(create.description).toContain('statusSummary.entriesConfigured');
    expect(create.description).toContain('at least one of entriesOpenAt or entriesCloseAt is set');
    expect(create.description).toContain('An unavailable payment method returns 422');
    expect(create.description).toContain('Null class fees are treated as zero');
    expect(create.description).toContain('contactLastname');
    const availability =
      document.paths[`${EVENT_OPENAPI.basePath}/{eventId}/entry-availability`].get;
    expect(availability.security).toEqual([]);
    const fee =
      availability.responses['200'].content['application/json'].schema.properties.results.properties
        .data.properties.classes.items.properties.fee;
    expect(fee.properties).toMatchObject({
      amount: { type: 'number' },
      net: { type: 'number' },
      vat: { type: 'number' },
    });
    expect(fee.nullable).toBe(true);
    expect(availability.description).toContain('lateEntryFeePercent');
  });

  it('documents attributed payment receipts, retry behavior and closing filters', async () => {
    const response = await app.request('/doc');
    const document = await response.json();
    const create =
      document.paths[`${EVENT_OPENAPI.basePath}/{eventId}/entries/{entryId}/payments`].post;
    expect(create.security).toEqual([{ BearerAuth: [] }]);
    expect(create.responses['201']).toBeDefined();
    expect(create.responses['409']).toBeDefined();
    const input = create.requestBody.content['application/json'].schema;
    expect(input.required).toEqual(
      expect.arrayContaining([
        'clientPaymentId',
        'method',
        'amount',
        'currency',
        'paidAt',
        'deviceId',
      ]),
    );
    expect(input.properties.operatorId).toBeUndefined();
    const receipt =
      create.responses['201'].content['application/json'].schema.properties.results.properties.data;
    expect(receipt.required).toEqual(expect.arrayContaining(['operatorId', 'recordedAt']));
    const list = document.paths[`${EVENT_OPENAPI.basePath}/{eventId}/payments`].get;
    expect(list.parameters.map((p: { name: string }) => p.name)).toEqual([
      'eventId',
      'entryId',
      'since',
      'deviceId',
    ]);
    expect(list.description).toContain('server recordedAt');
    const insight = document.paths[`${EVENT_OPENAPI.basePath}/{eventId}/insights/payments`].get;
    expect(insight.security).toEqual([{ BearerAuth: [] }]);
    const row =
      insight.responses['200'].content['application/json'].schema.properties.results.properties.data
        .items;
    expect(row.required).toEqual(
      expect.arrayContaining([
        'paymentReference',
        'contactFirstname',
        'contactLastname',
        'amount',
        'operatorId',
      ]),
    );
  });

  it('documents all registered API endpoint groups', async () => {
    const response = await app.request('/doc');

    expect(response.status).toBe(200);

    const document = await response.json();
    const paths = document?.paths ?? {};

    for (const [path, pathItem] of Object.entries(OPENAPI_PATHS)) {
      expect(paths[path]).toBeDefined();

      for (const method of Object.keys(pathItem)) {
        expect(paths[path][method]).toBeDefined();
      }
    }
  });

  it('documents request body schemas for write endpoints', async () => {
    const response = await app.request('/doc');
    expect(response.status).toBe(200);

    const document = await response.json();
    const paths = document?.paths ?? {};

    const checks = [
      {
        method: 'post',
        path: `${AUTH_OPENAPI.basePath}/signin`,
        contentType: 'application/json',
        properties: ['username', 'password'],
        required: ['username', 'password'],
      },
      {
        method: 'post',
        path: `${AUTH_OPENAPI.basePath}/signup`,
        contentType: 'application/json',
        properties: ['email', 'password', 'firstname', 'lastname'],
        required: ['email', 'password', 'firstname', 'lastname'],
      },
      {
        method: 'post',
        path: `${AUTH_OPENAPI.basePath}/request-password-reset`,
        contentType: 'application/json',
        properties: ['email'],
        required: ['email'],
      },
      {
        method: 'post',
        path: `${AUTH_OPENAPI.basePath}/reset-password`,
        contentType: 'application/json',
        properties: ['token', 'newPassword'],
        required: ['token', 'newPassword'],
      },
      {
        method: 'post',
        path: `${AUTH_OPENAPI.basePath}/oauth2/token`,
        contentType: 'application/x-www-form-urlencoded',
        properties: ['grant_type', 'scope'],
        required: ['grant_type'],
      },
      {
        method: 'post',
        path: `${AUTH_OPENAPI.basePath}/generate-oauth2-credentials`,
        contentType: 'application/json',
        properties: ['grants', 'scopes', 'redirectUris'],
        required: ['grants'],
      },
      {
        method: 'post',
        path: EVENT_OPENAPI.basePath,
        contentType: 'application/json',
        properties: ['sportId', 'name', 'date', 'timezone', 'organizer', 'location', 'zeroTime'],
        required: ['sportId', 'name', 'date', 'timezone', 'organizer', 'location', 'zeroTime'],
      },
      {
        method: 'put',
        path: `${EVENT_OPENAPI.basePath}/{eventId}`,
        contentType: 'application/json',
        properties: ['sportId', 'name', 'date', 'timezone', 'organizer', 'location', 'zeroTime'],
        required: ['sportId', 'name', 'date', 'timezone', 'organizer', 'location', 'zeroTime'],
      },
      {
        method: 'post',
        path: `${EVENT_OPENAPI.basePath}/{eventId}/image`,
        contentType: 'multipart/form-data',
        properties: ['file'],
        required: ['file'],
      },
      {
        method: 'post',
        path: `${EVENT_OPENAPI.basePath}/generate-password`,
        contentType: 'application/json',
        properties: ['eventId'],
        required: ['eventId'],
      },
      {
        method: 'post',
        path: `${EVENT_OPENAPI.basePath}/import/search`,
        contentType: 'application/json',
        properties: ['provider', 'query', 'apiKey', 'limit'],
        required: ['provider', 'query'],
      },
      {
        method: 'post',
        path: `${EVENT_OPENAPI.basePath}/import/preview`,
        contentType: 'application/json',
        properties: ['provider', 'externalEventId', 'apiKey'],
        required: ['provider', 'externalEventId'],
      },
      {
        method: 'post',
        path: `${EVENT_OPENAPI.basePath}/revoke-password`,
        contentType: 'application/json',
        properties: ['eventId'],
        required: ['eventId'],
      },
      {
        method: 'post',
        path: `${EVENT_OPENAPI.basePath}/{eventId}/competitors`,
        contentType: 'application/json',
        properties: ['origin', 'classId', 'classExternalId', 'firstname', 'lastname'],
        required: ['origin', 'firstname', 'lastname'],
      },
      {
        method: 'put',
        path: `${EVENT_OPENAPI.basePath}/{eventId}/competitors/{competitorId}`,
        contentType: 'application/json',
        properties: ['origin', 'firstname', 'lastname', 'status', 'splits'],
        required: ['origin'],
      },
      {
        method: 'post',
        path: `${EVENT_OPENAPI.basePath}/{eventId}/competitors/{competitorId}/status-change`,
        contentType: 'application/json',
        properties: ['origin', 'status'],
        required: ['origin', 'status'],
      },
      {
        method: 'put',
        path: `${EVENT_OPENAPI.basePath}/{eventId}/competitors/{competitorExternalId}/external-id`,
        contentType: 'application/json',
        properties: ['origin', 'useExternalId', 'firstname', 'lastname', 'status', 'splits'],
        required: ['origin', 'useExternalId'],
      },
      {
        method: 'post',
        path: `${UPLOAD_OPENAPI.basePath}/iof`,
        contentType: 'multipart/form-data',
        properties: ['eventId', 'validateXml', 'file'],
        required: ['eventId', 'file'],
      },
      {
        method: 'post',
        path: `${UPLOAD_OPENAPI.basePath}/czech-ranking`,
        contentType: 'multipart/form-data',
        properties: ['file'],
        required: ['file'],
      },
    ] as const;

    for (const check of checks) {
      const operation = paths[check.path]?.[check.method];
      expect(operation).toBeDefined();

      const schema = operation?.requestBody?.content?.[check.contentType]?.schema;
      expect(schema).toBeDefined();
      expect(schema?.type).toBe('object');
      const schemaPropertyKeys = Object.keys(schema?.properties ?? {});
      expect(
        schemaPropertyKeys.length,
        `${check.method.toUpperCase()} ${check.path} should expose at least one request property`,
      ).toBeGreaterThan(0);

      for (const property of check.properties) {
        expect(schema?.properties?.[property]).toBeDefined();
      }

      if (check.required) {
        const requiredFields = schema?.required ?? [];
        for (const requiredProperty of check.required) {
          expect(requiredFields).toContain(requiredProperty);
        }
      }
    }
  });
});
