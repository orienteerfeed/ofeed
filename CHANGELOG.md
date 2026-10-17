# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This file is maintained manually and is not a complete record of every published
version. See [GitHub Releases](https://github.com/orienteerfeed/ofeed/releases)
for the automated release history. Add notable changes under `[Unreleased]` and
move them into a dated version section when preparing a release.

## [Unreleased]

### Added

- Release version sync: the GitOps wrapper chart and a post-release PR keep
  `package.json` and the Helm chart `version`/`appVersion` aligned with the release tag.
- GHCR candidate publishing for immutable multi-architecture client, server,
  board, and database-migration images, with exact image/chart delivery records.
- Runtime frontend configuration, ordered Argo CD Sync migrations, and optional
  Kubernetes Secret or Vault Agent secret delivery.
- A documentation index linking architecture, configuration, deployment, and
  scoped agent guidelines from the canonical `AGENTS.md` entry point.
- A build-once delivery pipeline with pre-release container/E2E/migration/contract
  qualification, automatic dev GitOps updates, production approval PRs, and
  prepared-release recovery without rebuilding images.

### Changed

- Standardized production Node images on Node 24.15.0 Bookworm slim and moved
  client router devtools to development-only dependencies.
- Unified Claude Code instructions through `AGENTS.md` imports and clarified
  contribution validation, review, and manual changelog maintenance.
- Automatic semantic-release version inference from Conventional Commits;
  release trailers and manual overrides remain optional fallback mechanisms.

### Fixed

- Installed `wget` in the API image so Docker Compose healthchecks can run.
- Installed OpenSSL in server images for Prisma runtime compatibility.
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

### Added

- fetch events, classes, competitors with results
- upload iof-xml 3 file with entries, startlists, results
