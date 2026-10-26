# G4 implementation record

Status: implementation complete; browser acceptance checks require an available browser.

- [x] Inspect authentication, web persistence, Vault delivery and approved scope.
- [x] Implement shared contracts, session persistence and key lifecycle.
- [x] Wire REST/GraphQL and credential-change revocation.
- [x] Implement browser refresh, sessions UI and subscription renewal.
- [x] Add regressions, run available checks, update deployment/API/security documentation.

Spec: [session longevity](../../specs/session-longevity.md).
ADR: [0006](../../architecture/adr/0006-device-sessions.md), proposed pending maintainer review.
Issue creation was rejected by the repository tool policy (mutating GitHub issue commands are blocked).
Maintainer follow-up: create/link an issue titled `feat: G4 device sessions and automatic token refresh`.

## Decisions

Strict refresh rotation; 15-minute access revocation bound; cookie browser transport;
hard legacy-token cutover; native clients and their local queues are external.
Signup, verification and reset completion require signin. Browser credential operations
are serialized across tabs; delayed operations cannot retry as a different account.
Authenticated sockets use retryable 4403 expiry and await token renewal before reconnect.

## Validation

- Complete server Vitest suite: 898 passed; 43 opt-in integration cases skipped by default.
- Complete client Vitest suite with two workers: 226 passed.
- Disposable MariaDB session suite: 11 passed, including REST signin, GraphQL cookie
  transport, refresh/replay concurrency, device ownership, password changes/reset and deletion.
- Repository migrations applied successfully to disposable MariaDB; Prisma migration diff
  reports no difference against the source schema.
- Shared build/type check; Prisma generation; client/server TypeScript and strict GraphQL
  checks; client/server lint all passed.
- Helm lint and rendering with Vault key-file delivery passed. Private keys remain outside source.
- Updated files formatted; whitespace/link checks performed.

## Remaining acceptance and deployment work

The Browser runtime reported no available browser. New Playwright scenarios cover
reload, concurrent tabs and current-device revocation, but live UI execution was not possible.
Native secure-storage/outbox durability checks belong to the external client repositories.
Production rollout still requires the Vault bundle/configuration and additive migration,
followed by coordinated API/web cutover and a fresh signin. No deployment was performed.

Next action for a maintainer: link the tracking issue, review ADR 0006, run the browser
suite against a synthetic account and follow the device-session operations runbook.
