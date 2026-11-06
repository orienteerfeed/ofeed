import { describe, expect, it, vi } from 'vitest';

import { startBankSyncLogCleanup } from '../bank-sync-log-cleanup.js';

describe('bank sync log cleanup', () => {
  it('deletes logs older than 90 days in bounded passes', async () => {
    const now = new Date('2026-10-28T10:00:00Z');
    vi.useFakeTimers({ now });
    const prisma = {
      bankSyncLog: {
        findMany: vi.fn().mockResolvedValue([{ id: 'old-1' }, { id: 'old-2' }]),
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const reportError = vi.fn();
    const stop = startBankSyncLogCleanup(prisma as never, reportError);
    await stop();
    vi.useRealTimers();

    expect(prisma.bankSyncLog.findMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date('2026-07-30T10:00:00Z') } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: 1000,
    });
    expect(prisma.bankSyncLog.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['old-1', 'old-2'] } },
    });
    expect(reportError).not.toHaveBeenCalled();
  });
});
