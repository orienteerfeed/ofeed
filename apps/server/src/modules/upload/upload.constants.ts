/**
 * Tunables for the IOF XML upload pipeline. Pulled out of upload.handlers.ts
 * to keep the handlers file focused on flow rather than configuration.
 */

export const IOF_WRITE_CONCURRENCY = 4;

export const SPLIT_WRITE_CONFLICT_MAX_RETRIES = 6;
export const SPLIT_WRITE_CONFLICT_RETRY_DELAY_MS = 75;
export const SPLIT_WRITE_CONFLICT_RETRY_JITTER_MS = 50;
export const SPLIT_WRITE_TRANSACTION_MAX_WAIT_MS = 10_000;
export const SPLIT_WRITE_TRANSACTION_TIMEOUT_MS = 20_000;

