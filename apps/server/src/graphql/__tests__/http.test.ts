import { describe, expect, it, vi } from 'vitest';

import { yoga } from '../http.js';
import prisma from '../../utils/context.js';

describe('GraphQL HTTP authentication', () => {
  it('returns UNAUTHENTICATED for payment updates without a token, even for a missing order', async () => {
    const lookup = vi.spyOn(prisma.entry, 'findUnique');
    try {
      const response = await yoga.fetch(
        new Request('http://localhost/graphql', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            query: 'mutation { entryOrderPaidUpdate(entryId: "missing", paid: true) { id } }',
          }),
        }),
      );
      const result = await response.json();
      expect(result.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');
      expect(result.errors?.[0]?.message).not.toBe('Unexpected error.');
      expect(lookup).not.toHaveBeenCalled();
    } finally {
      lookup.mockRestore();
    }
  });
});
