# Board Vue I18n upgrade

- Status: implemented
- Issue: none supplied; routine dependency maintenance
- Related ADRs: none

## Goal

Upgrade the board from Vue I18n 9 to 11 and keep its manifest and workspace
lockfile synchronized so CI can install with `--frozen-lockfile`.

## Acceptance criteria

- The board declares Vue I18n `^11.4.14` and the lockfile resolves version 11.
- A frozen workspace install succeeds.
- Existing translations and language switching remain compatible with the
  board's Composition API configuration (`legacy: false`).

## Edge cases and API changes

Retain all six locales, English fallback and existing cookie/localStorage
language persistence. No public API, data model or deployment changes.

## Test plan

Run a frozen workspace install, board unit tests and the board production build
(including type checking). Check existing translation usage against the Vue I18n
10/11 migration guidance.

Validation: frozen install passed for all six workspace projects with pnpm
11.4.0 and Node 24.15.0; all 96 board tests passed (17 files); board production
build and type checking passed. The resolved Vue I18n version is 11.4.18.
Browser checks were not run; this update changes dependencies only.
