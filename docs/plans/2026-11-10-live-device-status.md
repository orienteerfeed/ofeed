# Live device status — implementation complete, release checks pending

- Issue link pending; spec: ../specs/live-device-status.md; ADR 0010 proposed.
- [x] Shared Zod contracts, SQL schema and two additive migrations.
- [x] Scoped tokens, durable ingest, minute history, offline/unknown intervals and cleanup.
- [x] Redis versioned metric cache and notification fan-out, including results.
- [x] GraphQL read/control/subscription, Insights device UI, localization resources.
- [x] YAROC adapter, native import gate, server-managed MQTT profiles, leases and fencing.
- [x] SQL migration and ingest/fencing tests on disposable MariaDB.
- [x] Redis cache and external-process notification tests on disposable Redis.
- [x] Client full suite: 439 passed; focused UI/server checks passed.
- [x] Confirm five unrelated server price-adjustment failures also on clean HEAD.
- [ ] Native Linux and EMQX fake-punch acceptance: npm 0.1.3 archive lacks entrypoints.
- [ ] Interactive browser QA: no connected browser available.
- [ ] Maintainer issue link and ADR acceptance; production migration/deployment not performed.
- Next action: obtain functional 0.1.3 artifact, run native smoke test and browser QA.

## Review corrections

- [x] Base liveness on measurement/activity time rather than delayed receipt.
- [x] Reset checkpoints in both monitoring start paths and clamp legacy checkpoints to the new window.
- [x] Reject malformed JSON with 400 before OpenAPI validation reaches the generic error handler.
- Validation: 31 focused server tests, server and strict GraphQL types, focused ESLint and whitespace checks passed.

## Settings and event-password onboarding (2026-11-11)

- [x] Move management to Settings → Devices & radios; Insights read-only.
- [x] Save YAROC settings independently of native startup.
- [x] Add event-password registration and optional heartbeat application identity.
- [x] Register recognized successful IOF producers, including identical re-uploads.
- [x] Preserve old payloads/responses and existing bearer clients; upload auxiliary failures are isolated.
- [x] Add nullable source identity and event YAROC settings migration.
- [x] Verify SQL migration/concurrent registration, additive compatibility and targeted UI/server tests.
- Validation: focused server/upload/CORS/schema suite 182 passed; SQL integration passed; full client suite 441 passed; server/client types, strict GraphQL types, focused ESLint and whitespace checks passed.

## Source discovery and UI consistency

- [x] Hide uploader from manual settings, retain additive API support and auto-discover other authenticated IOF exporters.
- [x] Remove the registration explanation from rendered settings and locale resources.
- [x] Track authenticated MeOS MOP processing, completion, identical uploads and failures without changing XML responses.
- [x] Use shared BackLink with arrow, Card/Table/Select/Badge/Alert primitives and theme-aware chart colors.
- [x] Split query contracts, table and charts from the controller; keep settings un-nested and responsive.
- [x] Validation: 258 focused server/import tests and 442 client tests passed; server/client and strict GraphQL types and focused ESLint passed.
- [ ] Interactive visual QA: Browser runtime discovery returned no available browsers.

## Receiver action eligibility

- [x] Rename labels to Check/Start/Finish unit codes.
- [x] Gate Save/Start/Stop using current state, valid shared contracts and unsaved changes.
- [x] Expose native receiver availability, session deadline and revoked device state.
- [x] Validate again before mutations; prevent duplicate local actions.
- [x] Recheck server fleet/timezone/session inside the event lock and block active config edits.
- [x] Final type/lint/build verification and targeted action regressions.
- Validation: 265 focused server tests passed (2 opt-in integration checks skipped),
  full client suite 448 passed and final action regressions 13 passed. Client/server
  types, focused ESLint, Prettier, whitespace checks and the client production build passed.
  Interactive visual QA remains unavailable because the Browser runtime has no browsers.
