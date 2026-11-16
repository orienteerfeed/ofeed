# User notifications — #293

Issue: [#293](https://github.com/orienteerfeed/orienteerfeed/issues/293).
Spec: [user notifications](../../specs/user-notifications.md).

- [x] Inspect existing mock bell, bank push, payment/order writes and authorization.
- [x] Agree on owner-only inbox, all new orders/receipts and 90-day retention.
- [x] Add shared contracts, persistence and feature service/GraphQL API.
- [x] Connect transactional source writes, publication/cleanup and account erasure.
- [x] Implement bell, history page, translations and cache isolation.
- [x] Run regressions, database/browser checks and reconcile documentation.

## Validation

- Shared build and type-check; Prisma generation, validation and migration deployment
  into disposable MariaDB; server build/GraphQL type profiles and client type-check passed.
- Server suite: 1261 tests passed, 76 optional tests skipped; one rate-limit test
  timed out during heavy parallel execution and its entire 8-test file passed
  on an isolated retry. Schema snapshot updated by the test runner.
- Client suite: all 454 tests passed with two workers. The initial unrestricted
  run hit unrelated timeouts; isolated retries also passed.
- Disposable MariaDB/Redis suites: 18 tests passed, including receipt concurrency,
  guest-order rollback, notification uniqueness, access isolation, account erasure
  and cross-replica invalidation hints.
- Chromium: four desktop/mobile scenarios passed using the real components and
  hooks with a deterministic Apollo transport. This is not a full live HTTP API
  browser test; the server contract and persistence are covered separately.
- Production Vite build, focused ESLint, Prettier and whitespace checks passed.

Complete. Deployment must apply `20261112120000_user_notifications` before running
the new API. No production database, deployment or external publication changed.
