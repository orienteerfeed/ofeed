import { describe, expect, it } from 'vitest';
import app from '../../../app.js';

describe('punch OpenAPI contract', () => {
  it('documents JWT security, batch limits, per-punch results and retry conflicts', async () => {
    const response = await app.request('/doc');
    const document = await response.json();
    const operation = document.paths['/rest/v1/events/{eventId}/punches'].post;
    expect(operation.security).toEqual([{ BearerAuth: [] }]);
    const request = operation.requestBody.content['application/json'].schema;
    expect(request.properties.punches).toMatchObject({ minItems: 1, maxItems: 200 });
    expect(request.properties.source.enum).toEqual(['SRR', 'READOUT']);
    expect(request.properties.punches.items.required).toEqual(
      expect.arrayContaining(['clientPunchId', 'card', 'controlCode', 'punchTime', 'receivedAt']),
    );
    expect(request.properties.punches.items.required).not.toContain('stationSerial');
    const result =
      operation.responses['200'].content['application/json'].schema.properties.results.properties
        .data.items;
    expect(result.properties.status.enum).toEqual(['STORED', 'DUPLICATE', 'UNKNOWN_CARD']);
    expect(result.required).not.toContain('competitorId');
    expect(operation.responses['409']).toBeDefined();
  });
});
