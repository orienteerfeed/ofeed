# Registration fee discounts — completed

Spec: [registration-fee-discounts](../../specs/registration-fee-discounts.md)

- [x] Shared validation/pricing, nullable JSON persistence and GraphQL settings.
- [x] Apply rules on create/edit and expose public REST/GraphQL availability.
- [x] Translated settings editor and entry/rental price preview and cart
      snapshots.
- [x] Use neutral ABC* examples and apply the same discount to rental as
      requested.
- [x] Prisma generation and local migration deployment, shared build/type
      checks, server/client type checks, focused ESLint and formatting.
- [x] Server suite: 1121 passed, 68 opt-in tests skipped. Client suite: 373
      passed with two workers; final rental adjustment: 12 focused tests passed.

Wildcard semantics were confirmed by the user’s follow-up. No open product
questions. Local REST/GraphQL read checks passed without changing event rules.
No browser is available in this session, so visual verification remains unrun.
GitHub issue search denied repository access; no issue number invented.

Next action: maintainer review; production migration/deployment remains outside
this local implementation.
