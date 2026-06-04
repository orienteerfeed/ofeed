# Start-mode model refactor + class-level overrides

Date: 2026-06-02
Status: Approved — ready for implementation plan

## Problem

The event-level `startMode` enum conflates two distinct concepts:

- `Individual`, `Mass`, `Handicap`, `Pursuit`, `Wave` describe **how** competitors
  start (the start procedure).
- `ScoreO` describes the **competition format**, not the start procedure.

We want a clean event-level default start mode plus the ability for individual
categories (HDR, Open, youth, non-competitive classes) to use `FreeStart`
without affecting normal competitive classes.

## Current state (verified)

- Actual DB enum: `enum StartMode { Individual, Mass, Handicap, Pursuit, Wave, ScoreO }`
  (`apps/server/prisma/schema.prisma`). The legacy names are shorter than the
  ticket text and include an extra `Handicap` value.
- `Event.startMode StartMode @default(Individual)`.
- `startMode` is read in only a few places:
  - `apps/server/src/utils/czech-ranking.ts` — `startMode === 'Mass'` ⇒ `0.15`
    start factor, otherwise `0`.
  - `apps/server/src/modules/event/event.graphql-types.ts:136` — exposed as a
    GraphQL string field.
  - `apps/server/src/modules/event/event.secure.handlers.ts` — event
    create/update.
  - `apps/server/src/utils/validateEvent.ts` — zod enum validation.
  - `packages/shared/src/models/common.ts` (`startModeSchema`) and
    `event.ts` (event field).
  - Client: `apps/client/src/hooks/useEvent.ts`,
    `apps/client/src/pages/Event/Settings/EventSettingsPage.tsx`.
- IOF XML class **import** lives in `apps/server/src/modules/upload/upload.handlers.ts`
  `upsertClass()`, which already parses class attributes such as
  `maxNumberOfCompetitors` and `resultListMode`.
- There is **no IOF XML class export** anywhere in the codebase — only import.
- Two untracked migrations already exist in this working tree, both dated
  `20260601…`. The second one,
  `20260601100000_rename_printed_maps_to_max_number_of_competitors`, already
  alters both `Class` and `Event` and adds several columns (`maxNumberOfCompetitors`,
  `resultListMode`, `fee`, `currency`, `vatPayer`, `vatRate`, `lateEntryFeePercent`).

## Resolved decisions

1. **Migration packaging**: fold the start-mode changes into the existing
   untracked migration `20260601100000_…`. Rename that (undeployed) folder to
   `20260601100000_class_and_event_enhancements` to reflect its broader scope.
2. **Legacy `Handicap` mapping**: `Handicap → competitionFormat=Standard,
   defaultStartMode=PursuitStart` (handicap start is a pursuit-style staggered
   start).
3. **IOF XML export (ticket §7)**: deferred. No class export feature exists; we
   implement import (§8) + a future-ready note only.
4. **Czech ranking start factor**: use the **effective per-class** start mode
   (`category.startMode ?? event.defaultStartMode`), not the event default alone.

## Data model

MariaDB ENUMs are column-level (no shared named type), so each column redeclares
its ENUM. On the Prisma side we still reuse a single `StartMode` enum for
`Event.defaultStartMode` and `Class.startMode` since the value set is identical.

### Enums

```prisma
enum StartMode {
  StartList
  MassStart
  PursuitStart
  WaveStart
  FreeStart
}

enum CompetitionFormat {
  Standard
  ScoreO
}
```

### Event

- Drop `startMode`.
- Add `competitionFormat CompetitionFormat @default(Standard)`.
- Add `defaultStartMode StartMode @default(StartList)`.

### Class

- Add `startMode StartMode?` — `NULL` means inherit `event.defaultStartMode`.
- Add `startWindowFrom DateTime?`.
- Add `startWindowTo DateTime?`.

### Migration SQL (appended to the renamed `20260601100000` migration)

Ordered to preserve existing data:

```sql
-- Event: add new start-mode fields
ALTER TABLE `Event` ADD COLUMN `competitionFormat` ENUM('Standard', 'ScoreO') NOT NULL DEFAULT 'Standard';
ALTER TABLE `Event` ADD COLUMN `defaultStartMode` ENUM('StartList', 'MassStart', 'PursuitStart', 'WaveStart', 'FreeStart') NOT NULL DEFAULT 'StartList';

-- Backfill from legacy startMode
UPDATE `Event` SET `competitionFormat` = 'ScoreO' WHERE `startMode` = 'ScoreO';
UPDATE `Event` SET `defaultStartMode` = CASE `startMode`
  WHEN 'Mass'     THEN 'MassStart'
  WHEN 'Pursuit'  THEN 'PursuitStart'
  WHEN 'Handicap' THEN 'PursuitStart'
  WHEN 'Wave'     THEN 'WaveStart'
  ELSE 'StartList'            -- Individual, ScoreO
END;

-- Drop legacy column
ALTER TABLE `Event` DROP COLUMN `startMode`;

-- Class: nullable per-class override (existing rows => NULL => inherit)
ALTER TABLE `Class` ADD COLUMN `startMode` ENUM('StartList', 'MassStart', 'PursuitStart', 'WaveStart', 'FreeStart') NULL;
ALTER TABLE `Class` ADD COLUMN `startWindowFrom` DATETIME(3) NULL;
ALTER TABLE `Class` ADD COLUMN `startWindowTo` DATETIME(3) NULL;
```

All existing categories end up with `startMode = NULL`, `startWindowFrom = NULL`,
`startWindowTo = NULL`, so they keep using the event default — behavior preserved.

## Shared contracts (`@repo/shared`)

- `common.ts`: redefine `startModeSchema` to the new five values; add
  `competitionFormatSchema = z.enum(['Standard', 'ScoreO'])`; export
  `CompetitionFormat` type.
- `event.ts`: replace `startMode` with `competitionFormat` + `defaultStartMode`.
- `class.ts`: add nullable `startMode`, `startWindowFrom`, `startWindowTo`;
  `.refine` — if both window bounds are set, `from < to`.
- New pure helper `resolveEffectiveStartMode(classStartMode, eventDefaultStartMode)`
  returning `classStartMode ?? eventDefaultStartMode`, plus a pure
  `mapLegacyStartMode(legacy)` returning `{ competitionFormat, defaultStartMode }`
  (used by tests to lock the migration mapping).
- Rebuild with `pnpm --filter @repo/shared build`; verify both consumers
  type-check.

## Server logic

- `czech-ranking.ts`: select `event.defaultStartMode` and each competitor's
  `class.startMode`; compute effective per-class start mode;
  `resolveCzechRankingStartFactor(effective)` returns `0.15` when effective ===
  `MassStart`, else `0`.
- `event.graphql-types.ts`: remove the `startMode` string field; add
  `competitionFormat` + `defaultStartMode` enum fields; register GraphQL enums
  `CompetitionFormat` and `StartMode`.
- `class.graphql.ts` / `class.service.ts`: expose `startMode` (nullable enum),
  `startWindowFrom`, `startWindowTo`; allow updating them.
- `event.secure.handlers.ts`: event create/update swap `startMode` for the two
  new fields (OpenAPI docs updated).
- `validateEvent.ts`: validate `competitionFormat` + `defaultStartMode`; add the
  class-level window rule.

## IOF XML import (`upload.handlers.ts` `upsertClass`)

Parse the class `<Extensions>`:

```xml
<Class>
  <Name>HDR</Name>
  <Extensions>
    <StartMode>FreeStart</StartMode>
    <StartWindow>
      <StartTime>2026-05-01T10:00:00+02:00</StartTime>
      <EndTime>2026-05-01T11:30:00+02:00</EndTime>
    </StartWindow>
  </Extensions>
</Class>
```

- `<StartMode>` ⇒ `class.startMode` (validated against the enum; unknown/missing ⇒
  `NULL`).
- `<StartWindow><StartTime>` ⇒ `startWindowFrom`; `<EndTime>` ⇒ `startWindowTo`
  (either side optional).
- Add the three new fields to the change-detection comparison so unchanged
  re-uploads still short-circuit.

## IOF XML export — deferred

IOF XML 3.0 has no standard class-level start-mode field, so a future export
would emit it under `<Class><Extensions>` (no custom namespace prefix), e.g.
`<StartMode>StartList</StartMode>` and an optional `<StartWindow>`. Omit the
extension when the class has no override. **Not implemented now** — no class
export feature exists yet. Implement when one is added.

## Client UI

- `EventSettingsPage.tsx` + `useEvent.ts`: replace the single start-mode control
  with:
  - Competition format: Standard / ScoreO.
  - Default start mode: Start list / Mass start / Pursuit start / Wave start /
    Free start.
- Class/category settings form: Start mode select with **Inherit event default**
  (stored as `NULL`) plus the five values; when **Free start** is selected, show
  optional `Start window from` / `Start window to`.
- All user-facing copy via i18next keys (locate the exact class-edit component
  during planning).

## Validation rules

- `startWindowFrom` / `startWindowTo` optional.
- If both set, `startWindowFrom < startWindowTo`.
- `FreeStart` without a window is allowed.
- `category.startMode = NULL` always allowed.

## Tests

- `mapLegacyStartMode` covers every legacy value (incl. `Handicap → PursuitStart`,
  `ScoreO → {ScoreO, StartList}`).
- Existing categories (`startMode = NULL`) inherit the event default.
- Category `FreeStart` overrides event default; category `StartList` overrides
  event default.
- `resolveEffectiveStartMode` resolution.
- Validation rejects `startWindowFrom >= startWindowTo`; accepts `FreeStart`
  without a window.
- IOF XML import of class `StartMode` and `StartWindow` (present, partial,
  absent).
- `czech-ranking` effective per-class factor.
- GraphQL `schema.test.ts` snapshot updated for the new event/class fields and
  enums.
- XML export tests: deferred with the export feature.

## Out of scope

- IOF XML class export (deferred).
- Any start-list generation engine changes beyond reading the effective start
  mode (no such engine consumes `startMode` today).
