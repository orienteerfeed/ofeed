import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

import { schema } from '../../../graphql/schema.js';
import { createEntryOrderAccessToken } from '../entry-public-access.js';

const require = createRequire(import.meta.url);
const pothosRequire = createRequire(require.resolve('@pothos/core'));
const { graphql } = pothosRequire('graphql') as typeof import('graphql');

describe('entry detail QR payment account formats', () => {
  it.each([
    ['2201340123/2010', 'CZ8020100000002201340123'],
    ['19-2000145399/0800', 'CZ6508000000192000145399'],
    ['CZ8020100000002201340123', 'CZ8020100000002201340123'],
    ['2201340124/2010', null],
  ])('returns safe QR instructions for stored account %s', async (account, iban) => {
    const entryId = 'entry-1';
    const entry = {
      id: entryId,
      eventId: 'event-1',
      paymentMethod: 'QR_PAYMENT',
      totalAmount: { toNumber: () => 250 },
      currency: 'CZK',
      paymentReference: '1234',
      contactFirstname: 'Test',
      contactLastname: 'Runner',
      event: { bankAccountIban: account, bankAccountName: 'Club' },
    };
    const result = await graphql({
      schema,
      source: `query EntryQr($entryId: String!, $access: String!) {
        entryOrderById(entryId: $entryId, accessToken: $access) {
          id qrPayment { bankAccountIban payload }
        }
      }`,
      variableValues: {
        entryId,
        access: createEntryOrderAccessToken(entryId, new Date(Date.now() + 60_000)),
      },
      contextValue: { prisma: { entry: { findUnique: vi.fn().mockResolvedValue(entry) } } },
    });
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      entryOrderById: {
        id: entryId,
        qrPayment: iban
          ? { bankAccountIban: iban, payload: expect.stringContaining(`*ACC:${iban}*`) }
          : null,
      },
    });
  });
});
