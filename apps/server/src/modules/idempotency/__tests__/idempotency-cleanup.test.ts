import { afterEach, expect, it, vi } from 'vitest';
import type { AppPrismaClient } from '../../../db/prisma-client.js';
import { startIdempotencyCleanup } from '../idempotency-cleanup.js';

afterEach(() => vi.useRealTimers());
it('cleans on startup, bounds batches, rechecks expiry on delete and stops on shutdown', async () => {
  vi.useFakeTimers();
  const findMany = vi.fn().mockResolvedValue([{ id: 'expired' }]);
  const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
  const stop = startIdempotencyCleanup(
    { idempotencyResponse: { findMany, deleteMany } } as unknown as AppPrismaClient,
    vi.fn(),
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(findMany).toHaveBeenCalledWith(
    expect.objectContaining({ take: 1000, orderBy: { expiresAt: 'asc' } }),
  );
  expect(deleteMany).toHaveBeenCalledWith({
    where: {
      id: { in: ['expired'] },
      expiresAt: { lte: expect.any(Date) },
    },
  });
  await vi.advanceTimersByTimeAsync(60_000);
  expect(findMany).toHaveBeenCalledTimes(2);
  await stop();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(findMany).toHaveBeenCalledTimes(2);
});
it('reports database failures and retries at the next interval', async () => {
  vi.useFakeTimers();
  const error = new Error('database unavailable');
  const findMany = vi.fn().mockRejectedValueOnce(error).mockResolvedValue([]);
  const report = vi.fn();
  const stop = startIdempotencyCleanup(
    { idempotencyResponse: { findMany } } as unknown as AppPrismaClient,
    report,
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(report).toHaveBeenCalledWith(error);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(findMany).toHaveBeenCalledTimes(2);
  await stop();
});
