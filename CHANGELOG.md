# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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

### Removed

### Fixed

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
