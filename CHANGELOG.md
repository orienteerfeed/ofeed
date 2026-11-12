# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Validate YAROC receiver actions against current configuration, registered radios
  and server availability; disable unavailable actions and prevent duplicate requests.

- Confirm zero-total entry orders as paid for every payment method without QR,
  cash or online payment requests in checkout, entry detail and email.

- Automatically select card rental for an empty entry card number and deselect
  it for a filled number, only when the event offers card rental.

- Remove license selection from public entries and resolve the competitor's
  license server-side from the matching cached federation registration.

### Added

- Automatic generic IOF and authenticated MeOS MOP source monitoring, including
  import state, received payload size and processing duration. Device settings
  register only radio units; the device insight uses shared navigation and UI components.

- Event settings for devices and persistent YAROC configuration; QuickEvent and
  oChecklist self-register through event-password authentication on successful
  uploads, heartbeats or an explicit registration endpoint. Existing upload and
  bearer-heartbeat contracts remain supported.

- Private device status insight with scoped heartbeat tokens, 30-day telemetry
  history, outage intervals and optional YAROC 0.1.3 radio reception.

- Weekly and manually triggered GHCR cleanup retains the five newest images per
  application package and removes older images and unused manifests.

- Event class settings can permanently delete a category and its dependent
  competition data after confirmation, preserving shared entities and payments.

- Expand the entry timeline report with order/payment summaries, race-day detail,
  payment methods, category counts and paginated entry rows, with full CSV/print
  exports limited to race day or today.

- Event promo codes with percentage discounts, revocation, checkout price previews
  and immutable applied-code records; registration discounts can opt into combining.

- Configure registration-based discounts (for example `ABC*`) on entry fees
  and card rental, including free entry, with server pricing and cart estimates.

- ORIS SSO server-side identity verification (`ssoUser` call from the API
  callback). The provider is enabled when `ORIS_SSO_ENABLED` is on and both
  `ORIS_SSO_CLIENT_ID` and `ORIS_SSO_CLIENT_SECRET` are set.

- Groundwork for external sign-in (ORIS SSO now, Google/GitHub later):
  `UserIdentity` model, `/rest/v1/auth/sso` start/callback/link routes, sign-in
  and sign-up buttons and a profile "Linked accounts" card shown only for
  providers with implemented identity exchange and configured credentials. ORIS
  remains unavailable while its token verification call is pending its contract.
- Entries-over-time insight: cumulative and daily competitor entries from the
  opening to the race, with deadline markers, late entries and a class filter.
- Radio (online split) controls: organisers mark them in Settings › Files.
  Results show a column per radio control and place runners on course
  provisionally by their last radio split.
- Bank payment import: organizers register their Fio account, the desktop
  collector reports incoming payments, and exact matches record bank-import
  receipts that mark entry orders paid; unmatched payments can be resolved
  manually.

- Push notifications of matched, overpaid and unmatched bank payments to the
  organizer's registered phones, switchable per status.

- Optional event payment lifetime with automatic cancellation of unpaid received
  non-cash orders and deadline notices on checkout and entry detail.

- Event anomaly analysis for fast first splits, off-grid starts and observed
  start-unit punches, with coverage, filtering, CSV export and printing (issue #164).

- Event timing-card insight for missing and duplicate chips across categories,
  with filtering, complete duplicate groups, CSV export and printing.

- Event-wide numeric payment-reference prefixes in service payment settings, used
  for new entry orders and QR payments within the 10-digit variable-symbol limit.

- Device sessions with 15-minute ES256 access JWTs, Vault-managed signing keys,
  rotating refresh tokens (30 days sliding, 90 days absolute), replay detection,
  browser automatic renewal and device revocation in profile settings.

- Transactional 24-hour `Idempotency-Key` replay for REST entry and competitor
  creates and competitor status changes, preventing duplicate offline retries.

- Event Insights catalog with received-payment filtering, currency totals, CSV export
  and printing for event owners and administrators.

- Auditable CASH/QR entry payment receipts with retry-safe recording, operator and
  device attribution, and event/desk closing-report endpoints.
- Event-scoped SRR/SI readout punch ingestion with durable retry identities,
  cross-device deduplication, delayed card matching and live result updates.

- Indexed documentation for product, architecture, ADRs, specs, API sources,
  development, operations and security, with one shared agent entry point.
- Continuous deployment of successful `develop` builds to `dev.ofeed.live` and
  `api.dev.ofeed.live`, with image digests, versioned charts and GitOps updates.
- Optional dedicated API ingress, digest-required image rendering and migration
  sync ordering for environments whose runtime secrets are managed by ESO.
- Release-only GHCR publishing for immutable multi-architecture client, server,
  board, and database-migration images.
- Runtime frontend configuration, Argo CD PreSync migrations, and optional
  Kubernetes Secret or Vault Agent secret delivery.

### Changed

- CI validation uses Node.js 24 actions and an explicit Ubuntu 24.04 runner to
  avoid deprecated action runtimes and automatic operating-system migration.

- Board: not-competing (MS/NC) athletes stay in the start list marked after the
  name (`(MS)` in Czech, `(NC)` otherwise, or a unicorn with emojis on). Once
  they have a time they move below running athletes and before DNS, sorted by
  time in default mode or alphabetically in unordered modes, without a rank or
  loss. Completed MS/NC remain visible with the start list hidden; the no-times
  result mode hides their times.

- Active runners show their elapsed clock at the next unpassed online control,
  moving to the finish column after the last recorded radio split.

- Mobile category results with one online control stack finish time and loss
  to fit the full table without horizontal scrolling.

- Mobile split analysis uses narrower pinned names, optional clubs, tap-to-open
  competitor details and compact sorting controls.

- Mark the exact race start date/time on the cumulative entry chart and plot
  actual receipt times so same-day entries after the start remain visible.

- Entries-over-time cumulative chart uses a smooth curve and a class-filtered
  linear trend.

- Show Czech domestic bank account numbers alongside IBAN in entry payment details, printouts and payment notification emails.

- Use one shared upload zone above event file status sections for start lists, courses and results, with a taller themed surface and centered File upload action.

- Default `ORIS_API_BASE_URL` is now `https://oris.ceskyorientak.cz/API/`.
- Compact public entry category cards into a two-column mobile grid and show
  remaining places, with occupancy and birth-year details in a tooltip.

- Home-grid event cards with open entries now offer a localized entry action
  that opens the event detail and scrolls directly to the entries section.

- **Breaking:** signin requires `deviceId` and `deviceName`, and returns
  `accessToken`/`expiresIn` instead of `token`. Legacy user JWTs require a fresh
  signin. Browser refresh credentials use HttpOnly cookies; native REST clients
  receive opaque refresh tokens. Signup, verification and password reset return
  completion results and require signin. Password changes/reset revoke device sessions.

- Entries with payment receipts derive paid status from their recorded total and
  reject manual paid overrides, currency changes and deletion of their payment history.

- Standardized production Node images on Node 24.15.0 Bookworm slim and moved
  client router devtools to development-only dependencies.

### Fixed

- Restore server type checking by explicitly returning the required OAuth access
  token field from `saveToken`.

- Align Vitest helpers and client TanStack runtime dependencies with their peer
  requirements so workspace peer checks pass.

- Synchronize the board's Vue I18n 11 dependency and workspace lockfile for
  frozen CI installs.

- Restrict entry adjustment reasons to event staff and reject adjusted totals that
  exceed the database amount limit before saving.

- Board: completed MS/NC athletes remain visible when the start list is hidden
  and respect alphabetical result modes and hidden result times.

- Board: rows with an `updatedAt` in the future are no longer permanently
  highlighted as recently updated.

- Mobile category settings keep the navbar and tabs within the viewport while
  allowing horizontal scrolling inside the category table.

- Mobile live results reserve enough category column width to display complete
  four-character class badges.

- Club result tables use their full width when multiple categories are shown
  and the Start column is hidden on mobile.

- Entry-list cash confirmations refresh received-payment reports and identify the
  desk; legacy paid cash without a receipt can be explicitly recorded. Reports
  also pick up external POS receipts while visible and when returning to the tab.

- Marking a cash entry paid now records its outstanding balance as a CASH receipt,
  so manual cash settlements appear in payment reports without duplicate receipts
  on repeated settlement. POS callers can supply an optional device identifier.

- Deleting an event or all its data no longer fails with 409 "Cannot delete
  event data containing payment receipts"; receipts are deleted with the event.
- Provisional radio placement stays after faster comparable finishers even when
  earlier finishers have missing splits.
- Entry insight charts, totals and exports stop at race day or today and exclude
  entries beyond that cutoff.
- Bank-import payments no longer show an invented time: `paidAt` is the
  server match time, the bank booking day is returned as `bookingDate` and
  shown date-only; existing bank receipts are migrated.
- Late SRR punches no longer overwrite a closed result (IOF XML/MOP import or
  readout); only a readout can still correct it.
- Finish punches no longer change the status of NotCompeting competitors;
  finish time and race time are still recorded.
- Restore desktop entry category occupancy badges and birth-year ranges.
- Restore missing entry class occupancy and remaining-place translations in all
  six locales, fixing the client type check and untranslated card labels.
- Deliver bank payment pushes to all registered devices in batches and expose
  the connection transaction pagination cursor in OpenAPI.

- Restore compact mobile result tables that fit phone displays, with bounded
  responsive typography and horizontal scrolling only on very narrow screens.

- Entry forms hide interval start slots already selected in the local cart and
  reject duplicate cart additions for the same event, category and start time.

- Email logos use the instance's configured public frontend URL instead of the
  hard-coded production host, including entry, verification and reset emails.

- QR payment confirmation emails embed the QR PNG as a CID attachment so mail
  clients do not strip its image source as an unsupported data URL.

- Result and split table headers stay visible below the navbar during scrolling,
  retaining horizontal alignment and interactive sorting on mobile and desktop.

- Session renewal uses a separate rate-limit budget and honors shared browser
  cooldowns after HTTP 429, preserving usable access tokens during recovery.

- Raise GraphQL headroom from 30 to 600 requests/minute and isolate verified
  user/event budgets; reserve independent upload and session budgets and align
  API/Helm defaults so polling and navigation do not block file imports.

- Restore compact result and split table rows, including on mobile, by removing
  oversized row heights introduced with background refresh scroll preservation.

- QR payment settings accept Czech domestic bank accounts (including prefixes)
  alongside IBAN, validate checksums and normalize stored/generated payment
  instructions to IBAN, including previously saved domestic accounts (Fixes #601).

- Replace nonfunctional `spayd://` payment links with PNG QR sharing/download
  in checkout and entry detail, and standard entry-detail links in QR emails.

- Session restoration and account changes no longer interrupt event loading
  with “Store reset while query was in flight”; Apollo caches are isolated per
  authentication scope while token renewal preserves active queries.
- Fix client production builds by checking Playwright specs and React browser
  fixtures in the browser TypeScript project instead of the Node tooling project.

- Preserve result and split table scroll positions during background refreshes,
  reconnects and live reordering, with stable columns and retained data on transient errors.

- Serialize StartList reservations across orders and competitors, atomically
  transfer reservations during processing, and return 409 SLOT_TAKEN for slot
  conflicts while preserving PUT semantics. Other modes allow shared times.

- Preserve authoritative competitor updates and IOF/MOP snapshots over earlier
  punch observations, consuming pending punches on the previous/current cards so
  retries and delayed assignment cannot restore superseded data.
- Resolve sign-in user timestamps and activation metadata, return authentication
  errors before reading entry payment updates, and clear empty competitor notes.
- Consume and restore competitor start slots atomically across time and class
  changes; exclude occupied, reserved and duplicate times from availability.
- Document entry prerequisites, unconfigured-entry conflicts, fee shapes and
  late-entry surcharges, and personal data in QR payment messages.

- Seed required countries, currencies and the Orienteering sport after
  deployment migrations, preserving reference IDs and excluding optional event
  creation.
- Installed `wget` in the API image so Docker Compose healthchecks can run.
- Pre-created client and board `runtime-config.js` files owned by the Nginx
  runtime user so startup scripts can write them without permission errors.

### Removed



## [1.3.1] - 2026-05-05

### Fixed

- Prevented the home page map from crashing when Leaflet marker clustering is
  unavailable or initialized through an incompatible runtime namespace.

## [1.3.0] - 2026-05-05

### Added

- Home page overview tab with contextual event ordering and infinite scrolling.
- Import-state tracking for IOF uploads, including detection and skipping of
  identical uploaded files.
- In-memory XSD schema cache for upload validation with a 24-hour TTL.
- Proper author resolution, team external IDs, split extraction, and duplicate
  split protection in the IOF XML import pipeline.
- Windows-friendly development script variants for local workspace tasks.

### Changed

- Refactored the IOF XML import pipeline and related upload handling for more
  reliable competitor, organisation, class, and split processing.
- Normalized competitor organisation handling, including extended organisation
  short-name support.
- Improved admin event and user management flows, including API coverage and
  authorization tests.
- Improved event change detection on the server.
- Merged event date and zero time into a single event date-time field across the
  client, server, GraphQL API, and database schema.
- Improved mobile event results layout, category switching, competitor names,
  club names, and split table presentation.
- Shared home event list rendering components for the home page views.
- Consolidated IOF publish notifications to class-level handling.
- Updated Swedish translations.
- Updated production and development dependencies, including Hono, Apollo
  Client, Prisma, TypeScript ESLint, Prettier, and repository model/tooling
  settings.

### Removed

- Outdated MRB development assets.

## [1.2.0] - 2026-04-22

### Added

- GraphQL queries and mutation for O-Checklist app
- RESTful API endpoints for start changes
- Event protocol
- User authentication using JWT
- Ranking processing on-the-fly

### Changed

- REST API URL redesign to common standard
- Release automation now publishes tags and GitHub Releases without pushing
  generated commits directly to protected `main`; the root `package.json`
  version is synced through a follow-up PR.

## [1.0.0] - 2023-11-05

Features:

### Added

- fetch events, classes, competitors with results
- upload iof-xml 3 file with entries, startlists, results
