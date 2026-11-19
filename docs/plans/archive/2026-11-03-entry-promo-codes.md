# Entry promo codes

- Spec: ../../specs/entry-promo-codes.md
- Status: implementation complete; database rollout and real-database concurrency verification pending.
- Delivered: persistence/migration, shared validation/pricing, owner/admin GraphQL
  management, public quote, REST create, immutable snapshots on order edits,
  settings/checkout/detail UI and six locale updates.
- Checks: 392 client tests and 238 relevant server tests passed; shared build/types,
  client/server types (including strict GraphQL), Prisma generation/validation,
  focused lint and whitespace checks passed. Twelve opt-in database tests skipped.
- Browser: isolated Chromium checkout at desktop/mobile sizes passed with fixture API;
  screenshots inspected. No real entry or email created.
- Limitations: Docker connection unavailable; SQL migration not applied or tested on
  MariaDB. New promo integration test requires PROMO_TEST_DATABASE_URL on a migrated
  disposable local ofeed_promo_test database. Existing working-tree changes preserved.
- Issue: search found none; policy rejected GitHub issue creation. No fabricated issue.
- Next action: validate/apply migration in deployment workflow and run database test.
