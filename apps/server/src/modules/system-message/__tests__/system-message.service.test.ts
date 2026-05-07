import { describe, expect, it, vi } from 'vitest';

import { findActiveSystemMessages } from '../system-message.service.js';

describe('system message service', () => {
  it('queries active published messages sorted newest first', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      systemMessage: {
        findMany,
      },
    };
    const now = new Date('2026-05-06T09:00:00.000Z');

    await findActiveSystemMessages(prisma as never, {}, now);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        publishedAt: {
          not: null,
          lte: now,
        },
        OR: [
          {
            expiresAt: null,
          },
          {
            expiresAt: {
              gt: now,
            },
          },
        ],
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    });
  });
});
