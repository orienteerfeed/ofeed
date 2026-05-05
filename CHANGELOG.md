# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Removed

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
- Updated production and development dependencies, including Hono, Apollo Client,
  Prisma, TypeScript ESLint, Prettier, and repository model/tooling settings.

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
