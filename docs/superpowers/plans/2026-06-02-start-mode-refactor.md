# Start-mode Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the event `startMode` enum into `competitionFormat` + `defaultStartMode`, add nullable class-level start-mode overrides with an optional start window, and update all readers.

**Architecture:** MariaDB column-level ENUMs; Prisma reuses one `StartMode` enum for `Event.defaultStartMode` and `Class.startMode`. Effective start mode = `class.startMode ?? event.defaultStartMode`, resolved by a pure shared helper. Legacy values are backfilled in the folded migration. Client only updates GraphQL query selections (no edit UI exists yet).

**Tech Stack:** Prisma 7 (MariaDB), Pothos GraphQL, Zod (`@repo/shared`), xml2js, Vitest.

> **Caveats**
> - Git commit/add is denied by `.claude/settings.json`; the engineer running this must commit manually. Steps below describe the logical commit boundary only.
> - **Migration folding only works cleanly if `20260601100000` has NOT been applied to any DB (including local dev).** Prisma tracks applied migrations by checksum; editing an applied migration causes drift. If it was already applied locally, run `pnpm --filter ofeed-server exec prisma migrate reset` (dev only) after editing, OR create a separate new migration instead.
> - Spec §7 (IOF XML export) is deferred — no class export feature exists.
> - Spec §5 (event/class settings UI controls) is deferred — no start-mode UI control exists today; only query selections are updated here.

---

## File Structure

- `apps/server/prisma/schema.prisma` — enums + Event/Class fields (modify)
- `apps/server/prisma/migrations/20260601100000_class_and_event_enhancements/migration.sql` — renamed folder + appended SQL (modify/rename)
- `packages/shared/src/models/common.ts` — `startModeSchema`, `competitionFormatSchema` (modify)
- `packages/shared/src/models/startMode.ts` — `resolveEffectiveStartMode`, `mapLegacyStartMode` (create)
- `packages/shared/src/models/__tests__/startMode.test.ts` — helper tests (create)
- `packages/shared/src/models/event.ts` — event fields (modify)
- `packages/shared/src/models/class.ts` — class fields + window refine (modify)
- `packages/shared/src/index.ts` — export new module (modify, if barrel exists)
- `apps/server/src/utils/czech-ranking.ts` — effective per-class factor (modify)
- `apps/server/src/modules/event/event.graphql-types.ts` — enums + fields (modify)
- `apps/server/src/modules/class/class.graphql.ts` — class start-mode fields (modify)
- `apps/server/src/utils/validateEvent.ts` — event write schema (modify)
- `apps/server/src/modules/event/event.secure.handlers.ts` — create/update (modify)
- `apps/server/src/modules/upload/upload.handlers.ts` — `upsertClass` Extensions parsing (modify)
- `apps/server/src/modules/upload/__tests__/upload.handlers.test.ts` — import tests (modify)
- `apps/server/src/graphql/__tests__/schema.test.ts` (+ snapshot) — GraphQL field/enum assertions (modify)
- `apps/client/src/hooks/useEvent.ts`, `apps/client/src/pages/Event/Settings/EventSettingsPage.tsx` — query selections (modify)

---

## Task 1: Prisma schema + folded migration

**Files:**
- Rename: `apps/server/prisma/migrations/20260601100000_rename_printed_maps_to_max_number_of_competitors/` → `..._class_and_event_enhancements/`
- Modify: that folder's `migration.sql`
- Modify: `apps/server/prisma/schema.prisma`

- [ ] **Step 1: Rename the migration folder**

```bash
git mv apps/server/prisma/migrations/20260601100000_rename_printed_maps_to_max_number_of_competitors \
       apps/server/prisma/migrations/20260601100000_class_and_event_enhancements 2>/dev/null || \
mv apps/server/prisma/migrations/20260601100000_rename_printed_maps_to_max_number_of_competitors \
   apps/server/prisma/migrations/20260601100000_class_and_event_enhancements
```

- [ ] **Step 2: Append start-mode SQL** to `20260601100000_class_and_event_enhancements/migration.sql`

```sql

-- AlterTable: split legacy Event.startMode into competitionFormat + defaultStartMode
ALTER TABLE `Event` ADD COLUMN `competitionFormat` ENUM('Standard', 'ScoreO') NOT NULL DEFAULT 'Standard';
ALTER TABLE `Event` ADD COLUMN `defaultStartMode` ENUM('StartList', 'MassStart', 'PursuitStart', 'WaveStart', 'FreeStart') NOT NULL DEFAULT 'StartList';

UPDATE `Event` SET `competitionFormat` = 'ScoreO' WHERE `startMode` = 'ScoreO';
UPDATE `Event` SET `defaultStartMode` = CASE `startMode`
  WHEN 'Mass'     THEN 'MassStart'
  WHEN 'Pursuit'  THEN 'PursuitStart'
  WHEN 'Handicap' THEN 'PursuitStart'
  WHEN 'Wave'     THEN 'WaveStart'
  ELSE 'StartList'
END;

ALTER TABLE `Event` DROP COLUMN `startMode`;

-- AlterTable: nullable per-class start-mode override + optional start window
ALTER TABLE `Class` ADD COLUMN `startMode` ENUM('StartList', 'MassStart', 'PursuitStart', 'WaveStart', 'FreeStart') NULL;
ALTER TABLE `Class` ADD COLUMN `startWindowFrom` DATETIME(3) NULL;
ALTER TABLE `Class` ADD COLUMN `startWindowTo` DATETIME(3) NULL;
```

- [ ] **Step 3: Update `schema.prisma`** — redefine the `StartMode` enum (lines ~560-567):

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

Replace the Event field (was `startMode StartMode @default(Individual)`):

```prisma
  competitionFormat            CompetitionFormat              @default(Standard)
  defaultStartMode             StartMode                      @default(StartList)
```

Add to the Class model (after `resultListMode`):

```prisma
  startMode        StartMode?
  startWindowFrom  DateTime?
  startWindowTo    DateTime?
```

- [ ] **Step 4: Regenerate Prisma client**

Run: `pnpm --filter ofeed-server db:generate`
Expected: success; `StartMode` enum values become the new set in `src/generated/prisma`.

- [ ] **Step 5: Commit boundary** — schema + migration.

---

## Task 2: Shared contracts + pure helpers (TDD)

**Files:**
- Create: `packages/shared/src/models/startMode.ts`
- Create: `packages/shared/src/models/__tests__/startMode.test.ts`
- Modify: `packages/shared/src/models/common.ts`, `event.ts`, `class.ts`, `index.ts`

- [ ] **Step 1: Write failing helper test** `packages/shared/src/models/__tests__/startMode.test.ts`

```ts
import { describe, expect, it } from 'vitest';

import { mapLegacyStartMode, resolveEffectiveStartMode } from '../startMode.js';

describe('resolveEffectiveStartMode', () => {
  it('inherits the event default when the class override is null', () => {
    expect(resolveEffectiveStartMode(null, 'StartList')).toBe('StartList');
  });
  it('uses the class override when set', () => {
    expect(resolveEffectiveStartMode('FreeStart', 'StartList')).toBe('FreeStart');
  });
  it('treats undefined override as inherit', () => {
    expect(resolveEffectiveStartMode(undefined, 'MassStart')).toBe('MassStart');
  });
});

describe('mapLegacyStartMode', () => {
  it.each([
    ['Individual', 'Standard', 'StartList'],
    ['Mass', 'Standard', 'MassStart'],
    ['Pursuit', 'Standard', 'PursuitStart'],
    ['Handicap', 'Standard', 'PursuitStart'],
    ['Wave', 'Standard', 'WaveStart'],
    ['ScoreO', 'ScoreO', 'StartList'],
  ] as const)('maps %s', (legacy, format, mode) => {
    expect(mapLegacyStartMode(legacy)).toEqual({
      competitionFormat: format,
      defaultStartMode: mode,
    });
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `pnpm --filter @repo/shared exec vitest run src/models/__tests__/startMode.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `packages/shared/src/models/startMode.ts`

```ts
import type { StartMode } from './common.js';

export type CompetitionFormat = 'Standard' | 'ScoreO';

/** Effective start mode for a class: its own override, else the event default. */
export function resolveEffectiveStartMode(
  classStartMode: StartMode | null | undefined,
  eventDefaultStartMode: StartMode,
): StartMode {
  return classStartMode ?? eventDefaultStartMode;
}

const LEGACY_START_MODE_MAP: Record<
  string,
  { competitionFormat: CompetitionFormat; defaultStartMode: StartMode }
> = {
  Individual: { competitionFormat: 'Standard', defaultStartMode: 'StartList' },
  Mass: { competitionFormat: 'Standard', defaultStartMode: 'MassStart' },
  Pursuit: { competitionFormat: 'Standard', defaultStartMode: 'PursuitStart' },
  Handicap: { competitionFormat: 'Standard', defaultStartMode: 'PursuitStart' },
  Wave: { competitionFormat: 'Standard', defaultStartMode: 'WaveStart' },
  ScoreO: { competitionFormat: 'ScoreO', defaultStartMode: 'StartList' },
};

/** Maps a legacy event startMode value to the new format/mode pair. */
export function mapLegacyStartMode(legacy: string): {
  competitionFormat: CompetitionFormat;
  defaultStartMode: StartMode;
} {
  return (
    LEGACY_START_MODE_MAP[legacy] ?? {
      competitionFormat: 'Standard',
      defaultStartMode: 'StartList',
    }
  );
}
```

- [ ] **Step 4: Update `common.ts`** — redefine `startModeSchema`, add `competitionFormatSchema`:

```ts
export const startModeSchema = z.enum([
  'StartList',
  'MassStart',
  'PursuitStart',
  'WaveStart',
  'FreeStart',
]);
export const competitionFormatSchema = z.enum(['Standard', 'ScoreO']);
```

Add type export near the other `z.infer` exports:

```ts
export type CompetitionFormat = z.infer<typeof competitionFormatSchema>;
```

- [ ] **Step 5: Update `event.ts`** — replace the `startMode: startModeSchema,` line and the import. Import `competitionFormatSchema, startModeSchema` from `./common.js`; replace the field with:

```ts
  competitionFormat: competitionFormatSchema,
  defaultStartMode: startModeSchema,
```

- [ ] **Step 6: Update `class.ts`** — import `startModeSchema, dateLikeSchema` from `./common.js`; add fields and a window refine:

```ts
export const classSchema = z
  .object({
    // ...existing fields...
    startMode: startModeSchema.nullable().optional(),
    startWindowFrom: dateLikeSchema.nullable().optional(),
    startWindowTo: dateLikeSchema.nullable().optional(),
  })
  .refine(
    (value) =>
      !value.startWindowFrom ||
      !value.startWindowTo ||
      new Date(value.startWindowFrom).getTime() < new Date(value.startWindowTo).getTime(),
    { message: 'startWindowFrom must be before startWindowTo.', path: ['startWindowTo'] },
  );
```

(Confirm `dateLikeSchema` is exported from `common.ts`; it is used by `event.ts`.)

- [ ] **Step 7: Export the new module** from `packages/shared/src/index.ts` (or the models barrel) — add `export * from './models/startMode.js';` following the existing pattern.

- [ ] **Step 8: Run helper test, expect pass**

Run: `pnpm --filter @repo/shared exec vitest run src/models/__tests__/startMode.test.ts`
Expected: PASS.

- [ ] **Step 9: Build shared, type-check both consumers**

Run: `pnpm --filter @repo/shared build && pnpm --filter ofeed-server type-check && pnpm --filter ofeed-client type-check`
Expected: shared builds; server/client type errors at this point are only the not-yet-migrated `startMode` readers (fixed in later tasks).

- [ ] **Step 10: Commit boundary** — shared contracts.

---

## Task 3: Czech ranking effective per-class factor (TDD)

**Files:**
- Modify: `apps/server/src/utils/czech-ranking.ts`
- Test: `apps/server/src/utils/__tests__/czech-ranking.test.ts` (if `resolveCzechRankingStartFactor` is exported; otherwise test via the public path already covered)

- [ ] **Step 1: Change the factor helper** to take effective start mode:

```ts
function resolveCzechRankingStartFactor(startMode: StartMode): number {
  return startMode === 'MassStart' ? 0.15 : 0;
}
```

- [ ] **Step 2: Update the event query** in `calculateCzechRankingPointsForEventOnce` — replace `startMode: true,` with `defaultStartMode: true,` and add `startMode: true` inside the `classes.select`:

```ts
        defaultStartMode: true,
        // ...
        classes: {
          select: {
            id: true,
            name: true,
            startMode: true,
            competitors: { /* unchanged */ },
          },
        },
```

- [ ] **Step 3: Resolve per class** — remove the single `const startFactor = ...` at the event level; inside the `for (const eventClass ...)` loop compute:

```ts
      const effectiveStartMode = resolveEffectiveStartMode(
        eventClass.startMode,
        event.defaultStartMode,
      );
      const startFactor = resolveCzechRankingStartFactor(effectiveStartMode);
```

Import `resolveEffectiveStartMode` from `@repo/shared` at the top. Confirm `startFactor` is referenced only inside the loop after this change.

- [ ] **Step 4: Type-check**

Run: `pnpm --filter ofeed-server type-check`
Expected: no `czech-ranking.ts` errors.

- [ ] **Step 5: Run czech-ranking tests**

Run: `pnpm --filter ofeed-server exec vitest run src/utils/__tests__/czech-ranking.test.ts`
Expected: PASS (update any test fixture that set `event.startMode` to use `defaultStartMode` + per-class `startMode`).

- [ ] **Step 6: Commit boundary.**

---

## Task 4: GraphQL types (event + class)

**Files:**
- Modify: `apps/server/src/modules/event/event.graphql-types.ts`
- Modify: `apps/server/src/modules/class/class.graphql.ts`
- Modify: `apps/server/src/graphql/__tests__/schema.test.ts` (+ snapshot)

- [ ] **Step 1: Register enums + event fields** in `event.graphql-types.ts`. Add `CompetitionFormat`, `StartMode` to the generated-enum import line and register:

```ts
import {
  CompetitionFormat,
  EventDiscipline,
  ExternalSource,
  SplitPublicationMode,
  StartMode,
} from '../../generated/prisma/enums.js';

const CompetitionFormatRef = builder.enumType(CompetitionFormat, { name: 'CompetitionFormat' });
export const StartModeRef = builder.enumType(StartMode, { name: 'StartMode' });
```

Replace the `startMode: t.string({...})` field (lines 136-138) with:

```ts
    competitionFormat: t.field({
      type: CompetitionFormatRef,
      resolve: (event) => event.competitionFormat,
    }),
    defaultStartMode: t.field({
      type: StartModeRef,
      resolve: (event) => event.defaultStartMode,
    }),
```

- [ ] **Step 2: Expose class start-mode fields** in `class.graphql.ts` — import `StartModeRef` from `'../event/event.graphql-types.js'` and add to the `ClassRef` fields:

```ts
    startMode: t.field({
      type: StartModeRef,
      nullable: true,
      resolve: (eventClass) => eventClass.startMode,
    }),
    startWindowFrom: t.expose('startWindowFrom', { type: 'DateTime', nullable: true }),
    startWindowTo: t.expose('startWindowTo', { type: 'DateTime', nullable: true }),
```

- [ ] **Step 3: Update `schema.test.ts`** — the Event type field list assertion: remove `startMode`, add `competitionFormat` and `defaultStartMode` (alphabetical position). Add `startMode`, `startWindowFrom`, `startWindowTo` to the Class type field assertion if it enumerates them. Update the enum-name assertion list to include `CompetitionFormat` and `StartMode` if present.

- [ ] **Step 4: Run schema test (update snapshot if used)**

Run: `pnpm --filter ofeed-server exec vitest run src/graphql/__tests__/schema.test.ts`
If snapshot mismatch is expected/correct: `pnpm --filter ofeed-server exec vitest run src/graphql/__tests__/schema.test.ts -u`
Expected: PASS.

- [ ] **Step 5: GraphQL type-check**

Run: `pnpm --filter ofeed-server type-check:graphql`
Expected: PASS.

- [ ] **Step 6: Commit boundary.**

---

## Task 5: Event REST validation + handlers

**Files:**
- Modify: `apps/server/src/utils/validateEvent.ts`
- Modify: `apps/server/src/modules/event/event.secure.handlers.ts`

- [ ] **Step 1: Update `eventWriteSchema`** — replace the `startMode` line (37):

```ts
    competitionFormat: z.enum(['Standard', 'ScoreO']).optional(),
    defaultStartMode: z
      .enum(['StartList', 'MassStart', 'PursuitStart', 'WaveStart', 'FreeStart'])
      .optional(),
```

- [ ] **Step 2: Update create handler** (`router.post('/')`) — in the destructure replace `startMode,` with `competitionFormat,` and `defaultStartMode,`; in `appPrisma.event.create({ data: {...} })` replace `startMode,` with:

```ts
            ...(typeof competitionFormat !== 'undefined' ? { competitionFormat } : {}),
            ...(typeof defaultStartMode !== 'undefined' ? { defaultStartMode } : {}),
```

- [ ] **Step 3: Update PUT handler** (`router.put('/:eventId')`) identically — destructure and `appPrisma.event.update({ data })`.

- [ ] **Step 4: Update OpenAPI JSDoc** in this file — the two `startMode:` doc blocks (lines ~698, ~1097) become `competitionFormat` + `defaultStartMode` with the new enum values.

- [ ] **Step 5: Type-check + run event handler tests**

Run: `pnpm --filter ofeed-server type-check && pnpm --filter ofeed-server exec vitest run src/modules/event`
Expected: PASS (update any test posting `startMode`).

- [ ] **Step 6: Commit boundary.**

---

## Task 6: IOF XML import of class StartMode + StartWindow (TDD)

**Files:**
- Modify: `apps/server/src/modules/upload/upload.handlers.ts`
- Test: `apps/server/src/modules/upload/__tests__/upload.handlers.test.ts`

> xml2js parser config: `new Parser({ attrkey: 'ATTR', trim: true })` — child elements become arrays. For `<Class><Extensions><StartMode>…</StartMode><StartWindow><StartTime/><EndTime/></StartWindow></Extensions></Class>`, the parsed shape is `classDetails.Extensions = [{ StartMode: ['FreeStart'], StartWindow: [{ StartTime: ['…'], EndTime: ['…'] }] }]`.

- [ ] **Step 1: Add a `toStartMode` helper + types** near `toResultListMode` (line ~272):

```ts
type StartModeValue = 'StartList' | 'MassStart' | 'PursuitStart' | 'WaveStart' | 'FreeStart';
const START_MODES = new Set<string>([
  'StartList',
  'MassStart',
  'PursuitStart',
  'WaveStart',
  'FreeStart',
]);

function toStartMode(value: string | undefined): StartModeValue | null {
  if (value && START_MODES.has(value)) return value as StartModeValue;
  return null;
}
```

- [ ] **Step 2: Write a focused failing test** in `upload.handlers.test.ts` for `toStartMode` parsing of the Extensions block. If `toStartMode`/`parseClassStartExtension` is not exported, extract the Extensions parsing into a small exported pure function `parseClassStartExtension(extensions, timeZone)` returning `{ startMode, startWindowFrom, startWindowTo }` and test that:

```ts
import { parseClassStartExtension } from '../upload.handlers.js';

describe('parseClassStartExtension', () => {
  it('parses StartMode and StartWindow', () => {
    const result = parseClassStartExtension(
      [
        {
          StartMode: ['FreeStart'],
          StartWindow: [
            { StartTime: ['2026-05-01T10:00:00+02:00'], EndTime: ['2026-05-01T11:30:00+02:00'] },
          ],
        },
      ],
      'Europe/Prague',
    );
    expect(result.startMode).toBe('FreeStart');
    expect(result.startWindowFrom?.toISOString()).toBe('2026-05-01T08:00:00.000Z');
    expect(result.startWindowTo?.toISOString()).toBe('2026-05-01T09:30:00.000Z');
  });

  it('returns nulls when StartMode is absent', () => {
    const result = parseClassStartExtension(undefined, 'Europe/Prague');
    expect(result).toEqual({ startMode: null, startWindowFrom: null, startWindowTo: null });
  });
});
```

- [ ] **Step 3: Run, expect fail**

Run: `pnpm --filter ofeed-server exec vitest run src/modules/upload/__tests__/upload.handlers.test.ts -t parseClassStartExtension`
Expected: FAIL.

- [ ] **Step 4: Implement `parseClassStartExtension`** (exported) using existing helpers `getIofTextValue` / `getIofDateTime` from `./upload.iof.helpers.js`:

```ts
export function parseClassStartExtension(
  extensions: unknown,
  timeZone: string,
): {
  startMode: StartModeValue | null;
  startWindowFrom: Date | null;
  startWindowTo: Date | null;
} {
  const ext = Array.isArray(extensions) ? extensions[0] : extensions;
  if (!ext || typeof ext !== 'object') {
    return { startMode: null, startWindowFrom: null, startWindowTo: null };
  }
  const record = ext as Record<string, unknown>;
  const startMode = toStartMode(getIofTextValue(record.StartMode));
  const windowRaw = Array.isArray(record.StartWindow) ? record.StartWindow[0] : record.StartWindow;
  const window = (windowRaw && typeof windowRaw === 'object' ? windowRaw : {}) as Record<string, unknown>;
  return {
    startMode,
    startWindowFrom: getIofDateTime(window.StartTime, timeZone) ?? null,
    startWindowTo: getIofDateTime(window.EndTime, timeZone) ?? null,
  };
}
```

Add `getIofTextValue` to the existing import from `./upload.iof.helpers.js`.

- [ ] **Step 5: Thread into `upsertClass`** — extend the `classDetails` param type with `Extensions?: unknown`, extend `ClassListEntry` with `startMode`, `startWindowFrom`, `startWindowTo`, add them to `getClassLists`' Prisma `select`, parse via `parseClassStartExtension(classDetails.Extensions, timeZone)`, include in the create/update `data` and in the change-detection comparison. The class import needs the event time zone — thread it through `processClassStarts`/`processClassResults` from the already-loaded event (pass `timeZone` into `upsertClass`).

- [ ] **Step 6: Run upload tests, expect pass**

Run: `pnpm --filter ofeed-server exec vitest run src/modules/upload`
Expected: PASS.

- [ ] **Step 7: Commit boundary.**

---

## Task 7: Client query selections

**Files:**
- Modify: `apps/client/src/hooks/useEvent.ts` (line ~32)
- Modify: `apps/client/src/pages/Event/Settings/EventSettingsPage.tsx` (line ~58)

- [ ] **Step 1:** In both GraphQL query documents, replace the `startMode` selection line with:

```graphql
      competitionFormat
      defaultStartMode
```

- [ ] **Step 2: Type-check + test client**

Run: `pnpm --filter ofeed-client type-check && pnpm --filter ofeed-client test`
Expected: PASS.

- [ ] **Step 3: Commit boundary.**

---

## Task 8: Full verification

- [ ] **Step 1:** `pnpm --filter @repo/shared build`
- [ ] **Step 2:** `pnpm type-check`
- [ ] **Step 3:** `pnpm --filter ofeed-server type-check:graphql`
- [ ] **Step 4:** `pnpm test`
- [ ] **Step 5:** `pnpm lint`

All green ⇒ done. Commit boundary.

---

## Spec coverage check

- §1 event refactor → Task 1 (schema/migration), Task 2 (shared), Task 5 (REST).
- §2 class override fields → Task 1, Task 2, Task 4, Task 6.
- §3 preserve behaviour → Task 1 (nullable class cols, NOT NULL event defaults, backfill).
- §4 effective logic everywhere → Task 2 helper; Task 3 czech-ranking (the only real reader).
- §5 UI → deferred (no control exists); queries updated in Task 7. **Flagged for follow-up.**
- §6 validation → Task 2 (`class.ts` refine), Task 5 (event enums).
- §7 XML export → deferred.
- §8 XML import → Task 6.
- §9 tests → Tasks 2, 3, 4, 6 (+ legacy mapping unit test in Task 2).
