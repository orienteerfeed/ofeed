/**
 * Split-time write path for IOF XML imports.
 *
 * Encapsulates all split-specific logic: normalization of raw IOF SplitTime
 * payloads, per-class bulk cache loading, atomic replace-all persistence, and
 * per-competitor write serialization with conflict retry.
 *
 * Why a separate file: keeps `upload.handlers.ts` focused on HTTP / pipeline
 * orchestration (the same rationale as `upload.competitor.ts` for competitor
 * writes and `upload.course.ts` for course metrics).
 */

import { Prisma } from '../../generated/prisma/client.js';
import prisma from '../../utils/context.js';
import {
  SPLIT_WRITE_CONFLICT_MAX_RETRIES,
  SPLIT_WRITE_CONFLICT_RETRY_DELAY_MS,
  SPLIT_WRITE_CONFLICT_RETRY_JITTER_MS,
  SPLIT_WRITE_TRANSACTION_MAX_WAIT_MS,
  SPLIT_WRITE_TRANSACTION_TIMEOUT_MS,
} from './upload.constants.js';
import type { IofResult } from './upload.iof.types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NormalizedSplit = {
  controlCode: number;
  time: number | null;
};

type CachedSplit = { id: number; controlCode: number; time: number | null };

/**
 * Per-class split pre-load cache. Keyed by competitorId, holds the splits that
 * existed in the DB when the class processing began. A Map entry with an empty
 * array means the competitor exists but has no splits; a missing entry means
 * the competitor was created during this upload (also no prior splits).
 *
 * Why: eliminates one findMany per competitor on re-uploads (the dominant
 * production scenario). A single findMany before the concurrent loop loads
 * all splits for the class in one round-trip instead of N round-trips.
 */
export type SplitCache = Map<number, CachedSplit[]>;

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

const splitWriteLocks = new Map<number, Promise<void>>();

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Exported helpers
// ---------------------------------------------------------------------------

/**
 * Checks whether an error is a transient split-write conflict that is safe to
 * retry: MariaDB "record has changed" optimistic-lock errors, deadlocks,
 * write conflicts, and Prisma P2034.
 */
export function isSplitWriteConflict(error: unknown): error is Error {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return (
    message.includes("record has changed since last read in table 'split'") ||
    message.includes('record has changed since last read in table "split"') ||
    message.includes('write conflict') ||
    message.includes('deadlock') ||
    message.includes('unable to start a transaction in the given time') ||
    message.includes('transaction api error') ||
    message.includes('p2034')
  );
}

/**
 * Parses the SplitTime array from an IOF Result payload into a flat array of
 * `{ controlCode, time }` objects, skipping entries with non-integer control
 * codes.
 */
export function normalizeIncomingSplits(result: IofResult): NormalizedSplit[] {
  const splitTimes = result?.SplitTime ?? [];
  const splits: NormalizedSplit[] = [];

  for (const split of splitTimes) {
    const rawControlCode = split.ControlCode?.[0];
    const controlCode = rawControlCode ? Number.parseInt(rawControlCode, 10) : Number.NaN;
    if (!Number.isInteger(controlCode)) continue;

    const rawTime = split.Time?.[0];
    const time = rawTime ? Number.parseInt(rawTime, 10) : null;
    splits.push({ controlCode, time: Number.isInteger(time) ? time : null });
  }

  return splits;
}

/**
 * Bulk-loads all existing splits for the given competitor IDs and groups them
 * by competitorId. Call this once per class before the concurrent split-write
 * loop, then pass the result to each `upsertSplits` call.
 *
 * Competitors with zero splits are not present in the returned Map — callers
 * treat a missing entry the same as an empty array.
 */
export async function loadSplitCache(competitorIds: readonly number[]): Promise<SplitCache> {
  if (competitorIds.length === 0) return new Map();
  const rows = await prisma.split.findMany({
    where: { competitorId: { in: [...competitorIds] } },
    select: { id: true, competitorId: true, controlCode: true, time: true },
    orderBy: { id: 'asc' },
  });
  const cache: SplitCache = new Map();
  for (const row of rows) {
    let arr = cache.get(row.competitorId);
    if (!arr) {
      arr = [];
      cache.set(row.competitorId, arr);
    }
    arr.push({ id: row.id, controlCode: row.controlCode, time: row.time });
  }
  return cache;
}

// ---------------------------------------------------------------------------
// Internal split write infrastructure
// ---------------------------------------------------------------------------

async function withSplitWriteLock<T>(
  competitorId: number,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = splitWriteLocks.get(competitorId) || Promise.resolve();
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => gate);
  splitWriteLocks.set(competitorId, tail);

  await previous;
  try {
    return await operation();
  } finally {
    release?.();
    if (splitWriteLocks.get(competitorId) === tail) {
      splitWriteLocks.delete(competitorId);
    }
  }
}

async function withSplitWriteConflictRetry<T>(
  competitorId: number,
  operation: () => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= SPLIT_WRITE_CONFLICT_MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isSplitWriteConflict(error)) {
        throw error;
      }

      if (attempt === SPLIT_WRITE_CONFLICT_MAX_RETRIES) {
        console.error('Split write conflict retries exhausted', {
          competitorId,
          attempts: attempt,
          maxAttempts: SPLIT_WRITE_CONFLICT_MAX_RETRIES,
          reason: (error as Error).message,
        });
        throw error;
      }

      console.warn('Retrying split write after conflict', {
        competitorId,
        attempt,
        maxAttempts: SPLIT_WRITE_CONFLICT_MAX_RETRIES,
        reason: (error as Error).message,
      });
      const jitter = Math.floor(Math.random() * SPLIT_WRITE_CONFLICT_RETRY_JITTER_MS);
      await wait(SPLIT_WRITE_CONFLICT_RETRY_DELAY_MS * attempt + jitter);
    }
  }
  // All retry attempts exhausted — the last iteration always throws, so this
  // line is unreachable at runtime. TypeScript requires a return type here.
  throw new Error(
    `Split write conflict: all ${SPLIT_WRITE_CONFLICT_MAX_RETRIES} retries exhausted for competitorId=${competitorId}`,
  );
}

async function upsertSplitsUnsafe(
  competitorId: number,
  result: IofResult,
  splitCache?: SplitCache,
) {
  // When a cache is provided: all splits for pre-existing competitors were
  // bulk-loaded before this call. A missing entry means the competitor is new
  // (no prior splits). This replaces the per-competitor findMany with a cache
  // lookup, saving one DB round-trip per competitor on re-uploads.
  const dbSplitResponse: CachedSplit[] = splitCache
    ? (splitCache.get(competitorId) ?? [])
    : await prisma.split.findMany({
        where: { competitorId },
        select: { id: true, controlCode: true, time: true },
        orderBy: { id: 'asc' },
      });

  const incomingSplits = normalizeIncomingSplits(result);

  // Compare by position (IOF XML order = course order). A competitor can visit
  // the same control more than once (butterfly loops), so we cannot use
  // controlCode as a unique key — position is the only stable identity.
  const commonLen = Math.min(dbSplitResponse.length, incomingSplits.length);
  let updated = 0;
  for (let i = 0; i < commonLen; i++) {
    const ex = dbSplitResponse[i];
    const inc = incomingSplits[i];
    if (ex.controlCode !== inc.controlCode || ex.time !== inc.time) updated++;
  }
  const created = Math.max(0, incomingSplits.length - dbSplitResponse.length);
  const deleted = Math.max(0, dbSplitResponse.length - incomingSplits.length);

  const changeMade = created > 0 || updated > 0 || deleted > 0;
  if (!changeMade) {
    return { created, updated, deleted, changeMade };
  }

  // Replace all competitor splits atomically to avoid interleaving create/update/delete conflicts.
  await prisma.$transaction(
    async (tx) => {
      await tx.split.deleteMany({
        where: { competitorId: competitorId },
      });

      if (incomingSplits.length > 0) {
        await tx.split.createMany({
          data: incomingSplits.map((split) => ({
            competitorId: competitorId,
            controlCode: split.controlCode,
            time: split.time,
          })),
        });
      }
    },
    {
      maxWait: SPLIT_WRITE_TRANSACTION_MAX_WAIT_MS,
      timeout: SPLIT_WRITE_TRANSACTION_TIMEOUT_MS,
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    },
  );

  return {
    created,
    updated,
    deleted,
    changeMade,
  };
}

/**
 * Updates or inserts split times for a given competitor based on the provided
 * result data. Wraps the unsafe write in a per-competitor write lock and a
 * conflict-retry loop.
 *
 * - Finds existing splits for the competitor in the database (or uses cache).
 * - Replaces all splits atomically when any position-based difference is found.
 * - Retries on transient MariaDB write conflicts / deadlocks.
 * - Serializes concurrent writes for the same competitor via `splitWriteLocks`.
 *
 * @param competitorId - Competitor database ID.
 * @param result - IOF Result payload carrying SplitTime elements.
 * @param splitCache - Optional pre-loaded class split cache.
 * @returns Summary of split mutations.
 */
export async function upsertSplits(
  competitorId: number,
  result: IofResult,
  splitCache?: SplitCache,
) {
  return withSplitWriteLock(competitorId, () =>
    withSplitWriteConflictRetry(competitorId, () =>
      upsertSplitsUnsafe(competitorId, result, splitCache),
    ),
  );
}
