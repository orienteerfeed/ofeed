import { expect, it } from 'vitest';

import { BANK_CONNECTION_OPENAPI, BANK_OPENAPI_PATHS } from '../bank.openapi.js';

it('advertises transaction data and the nullable cursor together in results', () => {
  const operation =
    BANK_OPENAPI_PATHS[`${BANK_CONNECTION_OPENAPI.basePath}/{id}/transactions`]!.get!;
  expect(operation.responses[200]).toMatchObject({
    content: {
      'application/json': {
        schema: {
          properties: {
            results: {
              type: 'object',
              required: ['data', 'nextCursor'],
              properties: {
                data: { type: 'array' },
                nextCursor: { type: 'string', nullable: true },
              },
            },
          },
        },
      },
    },
  });
});
