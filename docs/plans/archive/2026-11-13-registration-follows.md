# Registration following — #293

Spec: [registration follows](../../specs/registration-follows.md).

- [x] Confirm cross-event following by registration and profile management.
- [x] Add persistence/backfill and account preference services.
- [x] Integrate global/paused audiences with event stars and the inbox.
- [x] Add the profile management tab and all translations.
- [x] Verify migration, concurrency, profile flows and regressions.

Completed implementation; no deployment or git mutation performed. Existing
uncommitted notification/favorite work was preserved.

## Checks

- Shared build/type check, Prisma generation/validation, strict GraphQL and
  server/client TypeScript checks passed. Client production build passed.
- Server regression suite: 141 files, 1287 tests passed; 89 optional tests were
  skipped in that run. Initial worker startup timeouts were resolved by running
  the suite with one worker; the affected files also passed separately.
- Client regression suite: 61 files, 463 tests passed, including six profile
  component scenarios.
- Final disposable MariaDB/Redis integration run: 32 tests passed across
  favorites, payments, bank matching and live status. Includes registration
  changes, cross-event matching, issuer/account isolation, pause/cancel races,
  retained history and follow lifetime after source-event deletion.
- Chromium browser checks: ten desktop/mobile favorites and inbox scenarios
  passed, including profile pause/resume/cancel and account switching.
- Migration DDL was deployed only to the disposable database. Final backfill
  statements were also exercised directly from the migration against synthetic
  legacy rows, proving normalized deduplication, message linking, removal of
  redundant event selections and survival after source-event deletion.
- Focused lint, formatting and whitespace checks passed.

Final integration initially exposed an IOF fixture that replaced the followed
registration with its QuickEvent ID. The fixture now supplies both the stable
registration and the external ID. A separate regression verifies that an actual
registration change never silently transfers the follow to a different athlete.

## Rollout

Apply `20261113130000_registration_follows` after the inbox and event-favorite
migrations through the normal release process. No new runtime configuration.
Compact row actions/long-press and revised FreeStart/OK milestone semantics remain
separate follow-up work; this change adds registration following and its profile
management.
