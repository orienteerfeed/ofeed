# G3 create idempotency — completed

Source: user G3 request; issue lookup inaccessible. Spec:
[create idempotency](../../specs/create-idempotency.md).

- Done: transactional response storage, explicit transaction reuse, post-commit
  effects, three route adapters, CORS/OpenAPI and periodic expiry cleanup.
- Done: Prisma generation, 63 migrations on disposable local MariaDB,
  4 real concurrency/rollback/expiry tests, focused regression suites,
  TypeScript and ESLint.
- Remaining operational action: deploy the migration with the code. No production
  database or external publication was changed.
- Upstream issue link unavailable. ADR remains proposed for maintainer review.
