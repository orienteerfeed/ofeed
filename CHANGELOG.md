# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

### Removed

## [1.0.0] - 2023-11-05

Features:

### Added

- fetch events, classes, competitors with results
- upload iof-xml 3 file with entries, startlists, results
