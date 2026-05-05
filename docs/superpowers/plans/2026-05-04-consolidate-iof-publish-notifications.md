# Consolidate IOF Import Publish Notifications

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove per-competitor `publishUpdatedCompetitor` calls from the IOF XML upload/import path and replace them with one class-level `publishUpdatedCompetitors` call per affected class per import.

**Architecture:** Two entry points write competitors during import — `updateExistingCompetitor` (in `upload.competitor.ts`) currently fires a per-competitor push; `processClassResults` already aggregates into `updatedClasses` and publishes class-level after the loop; `processClassStarts` does neither. The fix removes the per-competitor publish from the write path and makes `processClassStarts` return updated class IDs so the caller can publish once per class.

**Tech Stack:** TypeScript, Hono, Prisma, Vitest, GraphQL pubsub (`publishUpdatedCompetitor` / `publishUpdatedCompetitors` from `src/utils/subscriptionUtils.ts`).

---

## File Map

| File | Change |
|------|--------|
| `apps/server/src/modules/upload/upload.competitor.ts` | Remove `publishUpdatedCompetitor` call and its import |
| `apps/server/src/modules/upload/upload.handlers.ts` | Change `processClassStarts` to return `Promise<number[]>`; add publish loop for StartList; export both `processClassResults` and `processClassStarts` via `parseXmlForTesting` |
| `apps/server/src/modules/upload/__tests__/upload.competitor.test.ts` | Add assertion that `publishUpdatedCompetitor` is NOT called on the update path |
| `apps/server/src/modules/upload/__tests__/upload.handlers.test.ts` | Add publish-aggregation tests for `processClassResults` and `processClassStarts` |

---

## Background: What Exists Today

```
updateExistingCompetitor (upload.competitor.ts:493)
  └─ publishUpdatedCompetitor(eventId, competitor)   ← fires once per changed competitor

processClassResults (upload.handlers.ts:692)
  └─ returns number[] of classIds that changed
  └─ caller loops updatedClasses → publishUpdatedCompetitors(classId)  ← correct, keep

processClassStarts (upload.handlers.ts:565)
  └─ calls upsertCompetitor but discards return value (no tracking)
  └─ no class-level publish in caller                                    ← gap to fill
```

The `publishUpdatedCompetitor` in `event.service.ts` (lines 123, 416, 560, 682) handles
**single-competitor edits** via the UI/API — those must NOT be touched.

---

### Task 1: Remove per-competitor publish from `updateExistingCompetitor`

**Files:**
- Modify: `apps/server/src/modules/upload/upload.competitor.ts:15` (import)
- Modify: `apps/server/src/modules/upload/upload.competitor.ts:493` (publish call)

- [ ] **Step 1: Read current state of the file**

  Open `apps/server/src/modules/upload/upload.competitor.ts` and confirm:
  - Line 15: `import { publishUpdatedCompetitor } from '../../utils/subscriptionUtils.js';`
  - Line 493: `await publishUpdatedCompetitor(eventId, { ...snapshot.competitorData, id: dbCompetitor.id });`

- [ ] **Step 2: Remove the import**

  In `apps/server/src/modules/upload/upload.competitor.ts`, replace:
  ```ts
  import { publishUpdatedCompetitor } from '../../utils/subscriptionUtils.js';
  ```
  with nothing (delete the line entirely).

- [ ] **Step 3: Remove the publish call from `updateExistingCompetitor`**

  In `apps/server/src/modules/upload/upload.competitor.ts`, find the block ending `updateExistingCompetitor`:
  ```ts
    if (orgChanged && dbCompetitor.organisationId !== resolvedOrganisationId) {
      await deleteOrganisationIfUnused(dbCompetitor.organisationId);
    }

    await publishUpdatedCompetitor(eventId, { ...snapshot.competitorData, id: dbCompetitor.id });
    return { id: dbCompetitor.id, updated: true };
  }
  ```
  Change it to:
  ```ts
    if (orgChanged && dbCompetitor.organisationId !== resolvedOrganisationId) {
      await deleteOrganisationIfUnused(dbCompetitor.organisationId);
    }

    return { id: dbCompetitor.id, updated: true };
  }
  ```

- [ ] **Step 4: Run type-check to confirm no lingering references**

  ```bash
  pnpm --filter server type-check 2>&1 | head -40
  ```
  Expected: no errors related to `publishUpdatedCompetitor` in `upload.competitor.ts`.

---

### Task 2: Make `processClassStarts` return updated class IDs

**Files:**
- Modify: `apps/server/src/modules/upload/upload.handlers.ts:565-681`

`processClassStarts` currently returns `Promise<void>` and discards the `updated` flag from `upsertCompetitor`. We need it to behave like `processClassResults` — return `number[]` of class IDs that changed.

- [ ] **Step 1: Read the current `processClassStarts` signature and body**

  Lines 565–681 of `apps/server/src/modules/upload/upload.handlers.ts`.
  Confirm:
  - Return type is `Promise<void>`
  - `upsertCompetitor(...)` calls exist in the Individual-Starts and Relay-Starts branches — return value is currently discarded (no `const { id, updated } = ...`)

- [ ] **Step 2: Change signature and add `updatedClasses` tracking**

  Replace the entire function (lines 565–681) with the version below.
  Key changes:
  - Return type → `Promise<number[]>`
  - Add `const updatedClasses = new Set<number>();` at the top
  - Capture `{ id: competitorId, updated }` from every `upsertCompetitor` call
  - Add `if (updated) updatedClasses.add(classId);` after each call
  - Final `return [...updatedClasses];`

  ```ts
  async function processClassStarts(
    eventId: string,
    classStarts: Array<Record<string, any>>,
    dbClassLists: ClassListEntry[],
    dbResponseEvent: { relay?: boolean; timezone?: string | null },
    authorId: number,
  ): Promise<number[]> {
    const updatedClasses = new Set<number>();
    const eventTimeZone = dbResponseEvent.timezone ?? 'UTC';

    await forEachWithConcurrency(
      classStarts,
      IOF_WRITE_CONCURRENCY,
      async (classStart: Record<string, any>) => {
        const classDetails = classStart.Class.shift();

        let length = null,
          climb = null,
          startName = null,
          controlsCount = null;

        if (classStart.Course && classStart.Course.length > 0) {
          length = getIofIntegerValue(classStart.Course[0].Length);
          climb = getIofIntegerValue(classStart.Course[0].Climb);
          controlsCount = getIofIntegerValue(classStart.Course[0].NumberOfControls);
        }
        if (classStart.StartName) startName = classStart.StartName[0];

        const additionalData = {
          startName: startName,
          ...normalizeCourseMetrics({
            length,
            climb,
            controlsCount,
          }),
        };

        const classId = await upsertClass(eventId, classDetails, dbClassLists, additionalData);
        const competitorCache = await loadCompetitorCache(classId);

        if (!dbResponseEvent.relay) {
          // Process Individual Starts
          if (!classStart.PersonStart || classStart.PersonStart.length === 0) return;
          await forEachWithConcurrency(
            classStart.PersonStart as Array<Record<string, any>>,
            IOF_WRITE_CONCURRENCY,
            async (competitorStart: Record<string, any>) => {
              const person = competitorStart.Person.shift();
              const organisation =
                Array.isArray(competitorStart.Organisation) && competitorStart.Organisation.length > 0
                  ? competitorStart.Organisation.shift()
                  : null;
              const start = competitorStart.Start.shift();
              const { updated } = await upsertCompetitor(
                eventId,
                classId,
                person,
                organisation,
                start,
                null,
                eventTimeZone,
                null,
                null,
                authorId,
                competitorCache,
              );
              if (updated) updatedClasses.add(classId);
            },
          );
        } else {
          // Process Relay Starts
          if (!classStart.TeamStart || classStart.TeamStart.length === 0) return;

          await forEachWithConcurrency(
            classStart.TeamStart as Array<Record<string, any>>,
            IOF_WRITE_CONCURRENCY,
            async (teamStart: Record<string, any>) => {
              const organisation = teamStart.Organisation
                ? [...teamStart.Organisation].shift()
                : null;

              const teamId = await upsertTeam(
                eventId,
                classId,
                teamStart as TeamWithBib,
                organisation,
              );
              if (teamStart.TeamMemberStart && teamStart.TeamMemberStart.length > 0) {
                await forEachWithConcurrency(
                  teamStart.TeamMemberStart as Array<Record<string, any>>,
                  IOF_WRITE_CONCURRENCY,
                  async (teamMemberStart: Record<string, any>) => {
                    const person = teamMemberStart.Person[0];
                    const start = [...teamMemberStart.Start].shift();
                    const leg = [...start.Leg].shift();

                    const { updated } = await upsertCompetitor(
                      eventId,
                      classId,
                      person,
                      organisation,
                      start,
                      null,
                      eventTimeZone,
                      teamId,
                      leg,
                      authorId,
                      competitorCache,
                    );
                    if (updated) updatedClasses.add(classId);
                  },
                );
              }
            },
          );
        }
      },
    );
    return [...updatedClasses];
  }
  ```

- [ ] **Step 3: Run type-check**

  ```bash
  pnpm --filter server type-check 2>&1 | head -40
  ```
  Expected: no errors.

---

### Task 3: Add publish loop for StartList in `handleIofXmlUpload`

**Files:**
- Modify: `apps/server/src/modules/upload/upload.handlers.ts:1028-1044`

The `StartList` branch currently calls `processClassStarts(...)` and discards the return. After Task 2 it returns `number[]`. Wire up the publish loop identical to the ResultList branch.

- [ ] **Step 1: Read the StartList handler block**

  Lines 1028–1044 of `apps/server/src/modules/upload/upload.handlers.ts`:
  ```ts
  } else if (type.jsonKey === 'StartList') {
    const classStarts = iofXml3.StartList.ClassStart;
    logUploadEvent(c, 'info', 'IOF upload processing StartList', {
      ...uploadDetails,
      success: false,
      stage: 'processing-start-list',
      classStartCount: Array.isArray(classStarts) ? classStarts.length : 0,
    });
    if (classStarts && classStarts.length > 0) {
      await processClassStarts(eventId, classStarts, dbClassLists, dbResponseEvent, authorId);
      logUploadEvent(c, 'info', 'IOF upload StartList processed', {
        ...uploadDetails,
        success: false,
        stage: 'processed-start-list',
        classStartCount: classStarts.length,
      });
    }
  ```

- [ ] **Step 2: Replace the StartList block**

  Replace the StartList block with:
  ```ts
  } else if (type.jsonKey === 'StartList') {
    const classStarts = iofXml3.StartList.ClassStart;
    logUploadEvent(c, 'info', 'IOF upload processing StartList', {
      ...uploadDetails,
      success: false,
      stage: 'processing-start-list',
      classStartCount: Array.isArray(classStarts) ? classStarts.length : 0,
    });
    if (classStarts && classStarts.length > 0) {
      const updatedClasses = await processClassStarts(
        eventId,
        classStarts,
        dbClassLists,
        dbResponseEvent,
        authorId,
      );
      logUploadEvent(c, 'info', 'IOF upload StartList processed', {
        ...uploadDetails,
        success: false,
        stage: 'processed-start-list',
        classStartCount: classStarts.length,
        updatedClassCount: updatedClasses.length,
      });
      for (const classId of updatedClasses) {
        try {
          await publishUpdatedCompetitors(classId);
        } catch (err) {
          logUploadEvent(
            c,
            'error',
            'IOF upload failed while publishing updated competitors',
            {
              ...uploadDetails,
              success: false,
              stage: 'publish-updated-competitors',
              classId,
              reason: err instanceof Error ? err.message : 'Publish failed',
            },
          );
        }
      }
    }
  ```

- [ ] **Step 3: Run type-check**

  ```bash
  pnpm --filter server type-check 2>&1 | head -40
  ```
  Expected: no errors.

---

### Task 4: Export `processClassResults` and `processClassStarts` for testing

**Files:**
- Modify: `apps/server/src/modules/upload/upload.handlers.ts:1408-1421` (the `parseXmlForTesting` export object)

Tests in `upload.handlers.test.ts` access private functions via `parseXmlForTesting`. Add the two orchestration functions to that object.

- [ ] **Step 1: Read the current `parseXmlForTesting` export**

  Lines 1408–1421:
  ```ts
  export const parseXmlForTesting = {
    parseXml,
    checkXmlType,
    fetchIOFXmlSchema,
    upsertCompetitor,
    findExistingClass,
    getCompetitorKeys,
    detectCompetitorChanges,
    extractTeamExternalId,
    resolveExistingTeam,
    normalizeIncomingSplits,
    isSplitWriteConflict,
    loadSplitCache,
  };
  ```

- [ ] **Step 2: Add the two functions**

  Replace the `parseXmlForTesting` object with:
  ```ts
  export const parseXmlForTesting = {
    parseXml,
    checkXmlType,
    fetchIOFXmlSchema,
    upsertCompetitor,
    findExistingClass,
    getCompetitorKeys,
    detectCompetitorChanges,
    extractTeamExternalId,
    resolveExistingTeam,
    normalizeIncomingSplits,
    isSplitWriteConflict,
    loadSplitCache,
    processClassResults,
    processClassStarts,
  };
  ```

- [ ] **Step 3: Run type-check**

  ```bash
  pnpm --filter server type-check 2>&1 | head -40
  ```
  Expected: no errors.

---

### Task 5: Test — `publishUpdatedCompetitor` NOT called on update path

**Files:**
- Modify: `apps/server/src/modules/upload/__tests__/upload.competitor.test.ts`

The existing test file mocks `publishUpdatedCompetitor` via `vi.mock('../../../utils/subscriptionUtils.js', ...)` (line 33) but never asserts it was NOT called. Add a test that verifies this.

- [ ] **Step 1: Read the existing mock setup**

  Lines 33–35 of `upload.competitor.test.ts`:
  ```ts
  vi.mock('../../../utils/subscriptionUtils.js', () => ({
    publishUpdatedCompetitor: vi.fn(),
  }));
  ```

  Also note: `afterEach(() => { vi.clearAllMocks(); })` is in place inside the `upsertCompetitor` describe block (line 244).

- [ ] **Step 2: Import the mock function at the top**

  After the existing imports, add:
  ```ts
  import * as subscriptionUtils from '../../../utils/subscriptionUtils.js';
  ```
  Place it after the existing `import { ... } from '../upload.competitor.js';` line.

- [ ] **Step 3: Add the new test inside the existing `upsertCompetitor — authorId written to protocol` describe block**

  Add after the last `it(...)` in that describe (after line 476):
  ```ts
  it('does NOT call publishUpdatedCompetitor during the update path (publish is class-level only)', async () => {
    mockPrisma.organisation.findFirst.mockResolvedValue(null);

    const dbCompetitor = {
      id: 20,
      classId: 1,
      firstname: 'Jan',
      lastname: 'Novák',
      nationality: 'SVK', // different from incoming CZE → triggers update
      registration: 'REG001',
      license: null,
      organisationId: null,
      organisation: null,
      card: null,
      bibNumber: null,
      startTime: null,
      finishTime: null,
      time: null,
      status: 'Inactive',
      lateStart: false,
      leg: null,
      note: null,
      externalId: 'REG001',
    };
    mockPrisma.competitor.findUnique.mockResolvedValue(dbCompetitor);
    mockPrisma.$transaction.mockImplementation(async (cb) => {
      const txProxy = {
        competitor: { update: vi.fn().mockResolvedValue({}) },
        protocol: {
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return cb(txProxy);
    });

    await upsertCompetitor(
      'event-abc',
      1,
      minimalPerson as never,
      null,
      null,
      null,
      'UTC',
      null,
      null,
      5,
    );

    expect(subscriptionUtils.publishUpdatedCompetitor).not.toHaveBeenCalled();
  });
  ```

- [ ] **Step 4: Run the competitor tests to verify the new test passes**

  ```bash
  pnpm --filter server test -- src/modules/upload/__tests__/upload.competitor.test.ts 2>&1 | tail -30
  ```
  Expected: all tests pass, including the new one.

---

### Task 6: Tests — publish aggregation for `processClassResults`

**Files:**
- Modify: `apps/server/src/modules/upload/__tests__/upload.handlers.test.ts`

Add a new `describe` block at the bottom of `upload.handlers.test.ts` that tests the publish behaviour of `processClassResults`:
- Multiple changed competitors in the same class → one `publishUpdatedCompetitors` call for that class.
- Changed competitors across two classes → two calls, one per class.
- No competitors changed → zero publish calls.
- `processClassStarts` with changed competitors → one publish call per changed class.

These tests require mocking several modules: `upload.competitor`, `upload.handlers` internal dependencies (prisma, `upsertClass`, `loadCompetitorCache`, `upsertSplits`, `publishUpdatedCompetitors`).

- [ ] **Step 1: Add module-level mocks at the top of `upload.handlers.test.ts`**

  After the existing imports block (after line 17), add:
  ```ts
  // ─── Mocks for publish-aggregation tests ────────────────────────────────────
  const mockPublishUpdatedCompetitors = vi.fn().mockResolvedValue(undefined);
  vi.mock('../../../utils/subscriptionUtils.js', () => ({
    publishUpdatedCompetitors: mockPublishUpdatedCompetitors,
  }));

  // Provide a no-op Prisma for class / cache lookups inside processClassResults.
  vi.mock('../../../utils/context.js', () => ({
    default: {
      class: { findMany: vi.fn().mockResolvedValue([]) },
      competitor: { findMany: vi.fn().mockResolvedValue([]) },
      split: { findMany: vi.fn().mockResolvedValue([]) },
    },
  }));

  // upsertClass always returns a stable classId (tests override per-case).
  vi.mock('../upload.handlers.js', async (importOriginal) => {
    // Re-export everything so parseXmlForTesting still works.
    const actual = await importOriginal<typeof import('../upload.handlers.js')>();
    return actual;
  });
  ```

  > **Note:** Because `processClassResults` depends on module-internal helpers (`upsertClass`, `loadCompetitorCache`, `upsertSplits`) that are not exported and cannot be mocked from outside, the approach below mocks `upsertCompetitor` at the module boundary and stubs the other helpers via Prisma mocks. `upsertClass` reads from Prisma's `class.findMany`; `loadCompetitorCache` reads from `competitor.findMany`; `upsertSplits` reads from `split.findMany` and returns `{ changeMade: false }` when the DB has no splits.

- [ ] **Step 2: Add mocks for `upload.competitor` module**

  After the mocks above, add:
  ```ts
  const mockUpsertCompetitor = vi.fn();
  vi.mock('../upload.competitor.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../upload.competitor.js')>();
    return {
      ...actual,
      upsertCompetitor: mockUpsertCompetitor,
      loadCompetitorCache: vi.fn().mockResolvedValue(new Map()),
    };
  });
  ```

- [ ] **Step 3: Add the `describe` block for publish aggregation**

  At the bottom of the file (after all existing `describe` blocks), append:

  ```ts
  // ─── Publish aggregation ────────────────────────────────────────────────────
  describe('processClassResults — publish aggregation', () => {
    const { processClassResults, processClassStarts } = parseXmlForTesting;

    const dbClassLists = [
      { id: 10, externalId: 'C10', name: 'H21E', sex: null },
      { id: 20, externalId: 'C20', name: 'D21E', sex: null },
    ];

    const makePersonResult = (registration: string) => ({
      Person: [{ Id: [{ _: registration, ATTR: { type: 'CZE' } }], Name: [{ Family: ['X'], Given: ['X'] }], Nationality: [{ ATTR: { code: 'CZE' } }] }],
      Organisation: [],
      Result: [],
    });

    afterEach(() => {
      vi.clearAllMocks();
      mockPublishUpdatedCompetitors.mockResolvedValue(undefined);
    });

    it('publishes once per class when multiple competitors in the same class change', async () => {
      // Two competitors in class 10, both changed.
      mockUpsertCompetitor
        .mockResolvedValueOnce({ id: 1, updated: true })
        .mockResolvedValueOnce({ id: 2, updated: true });

      const classResults = [
        {
          Class: [{ Name: ['H21E'], Id: ['C10'], ATTR: {} }],
          PersonResult: [makePersonResult('REG001'), makePersonResult('REG002')],
        },
      ];

      const updated = await processClassResults(
        'event-1',
        classResults,
        dbClassLists,
        { relay: false },
        1,
      );

      expect(updated).toEqual([10]);
      expect(mockPublishUpdatedCompetitors).not.toHaveBeenCalled(); // caller publishes, not processClassResults
    });

    it('returns one classId per distinct class that changed', async () => {
      // Competitor in class 10 changed, competitor in class 20 changed.
      mockUpsertCompetitor
        .mockResolvedValueOnce({ id: 1, updated: true })
        .mockResolvedValueOnce({ id: 2, updated: true });

      const classResults = [
        {
          Class: [{ Name: ['H21E'], Id: ['C10'], ATTR: {} }],
          PersonResult: [makePersonResult('REG001')],
        },
        {
          Class: [{ Name: ['D21E'], Id: ['C20'], ATTR: {} }],
          PersonResult: [makePersonResult('REG002')],
        },
      ];

      const updated = await processClassResults(
        'event-1',
        classResults,
        dbClassLists,
        { relay: false },
        1,
      );

      expect(updated.sort()).toEqual([10, 20]);
    });

    it('returns empty array and does not publish when no competitors changed', async () => {
      mockUpsertCompetitor
        .mockResolvedValueOnce({ id: 1, updated: false })
        .mockResolvedValueOnce({ id: 2, updated: false });

      const classResults = [
        {
          Class: [{ Name: ['H21E'], Id: ['C10'], ATTR: {} }],
          PersonResult: [makePersonResult('REG001'), makePersonResult('REG002')],
        },
      ];

      const updated = await processClassResults(
        'event-1',
        classResults,
        dbClassLists,
        { relay: false },
        1,
      );

      expect(updated).toEqual([]);
      expect(mockPublishUpdatedCompetitors).not.toHaveBeenCalled();
    });

    it('processClassStarts returns one classId per changed class', async () => {
      mockUpsertCompetitor
        .mockResolvedValueOnce({ id: 3, updated: true })
        .mockResolvedValueOnce({ id: 4, updated: false });

      const classStarts = [
        {
          Class: [{ Name: ['H21E'], Id: ['C10'], ATTR: {} }],
          PersonStart: [
            { Person: [{ Id: [{ _: 'REG001', ATTR: { type: 'CZE' } }], Name: [{ Family: ['X'], Given: ['X'] }], Nationality: [{ ATTR: { code: 'CZE' } }] }], Organisation: [], Start: [{ BibNumber: ['1'], ControlCard: ['7001'] }] },
            { Person: [{ Id: [{ _: 'REG002', ATTR: { type: 'CZE' } }], Name: [{ Family: ['Y'], Given: ['Y'] }], Nationality: [{ ATTR: { code: 'CZE' } }] }], Organisation: [], Start: [{ BibNumber: ['2'], ControlCard: ['7002'] }] },
          ],
        },
      ];

      const updated = await processClassStarts(
        'event-1',
        classStarts,
        dbClassLists,
        { relay: false },
        1,
      );

      // Only classId 10 had a changed competitor.
      expect(updated).toEqual([10]);
    });
  });
  ```

- [ ] **Step 4: Run handlers tests**

  ```bash
  pnpm --filter server test -- src/modules/upload/__tests__/upload.handlers.test.ts 2>&1 | tail -40
  ```
  Expected: all existing tests pass; the new describe block passes.

---

### Task 7: Full test suite + lint

- [ ] **Step 1: Run the full server test suite**

  ```bash
  pnpm --filter server test 2>&1 | tail -30
  ```
  Expected: all tests pass.

- [ ] **Step 2: Run lint**

  ```bash
  pnpm --filter server lint 2>&1 | tail -20
  ```
  Expected: no errors.

- [ ] **Step 3: Run type-check across all workspaces**

  ```bash
  pnpm type-check 2>&1 | tail -20
  ```
  Expected: no errors.

---

## Self-Review

### Spec coverage

| Requirement | Covered by |
|---|---|
| Remove per-competitor `publishUpdatedCompetitor` from IOF import path | Task 1 |
| Keep class-level publish for ResultList | Unchanged — already correct |
| Add class-level publish for StartList | Tasks 2–3 |
| Use `updatedClasses` as source of truth | Tasks 2–3 — same Set pattern as ResultList |
| Each class published at most once per import | Set deduplication (same as ResultList) |
| Preserve frontend behavior | Class subscriptions continue to fire |
| Do not change DB model | No Prisma schema changes |
| Do not change import semantics | Only removed publish call, no DB logic change |
| `publishUpdatedCompetitor` in `event.service.ts` untouched | Not in scope of any task |
| Test: same-class multi-competitor → one notification | Task 6 test 1 |
| Test: multi-class → one notification per class | Task 6 test 2 |
| Test: unchanged import → no publish | Task 6 test 3 |
| Test: non-import code paths unaffected | Task 5 + `event.service.test.ts` not modified |

### Risks

1. **`processClassStarts` return type change** — The only caller is the `StartList` branch of `handleIofXmlUpload`. After Task 3 it captures the returned `number[]`. TypeScript enforces this, so a missed caller will be a compile error.

2. **Test mock complexity** — `processClassResults` depends on several internal helpers. The mock strategy (mock Prisma + mock `upsertCompetitor` at module boundary) should work because Vitest hoists `vi.mock`. If `upsertClass` references local state that escapes the Prisma mock, tests may need a more granular stub. Adjust mocks if initial run shows unexpected failures.

3. **Concurrent publish** — `processClassResults` publishes sequentially (`for...of` loop). The new StartList publish uses the same pattern for consistency. This is intentional to avoid flooding pubsub.

4. **`processClassStarts` no longer publishes per-competitor** — This is the intended change. Clients subscribed to `COMPETITOR_UPDATED_<eventId>` will no longer receive per-row events during StartList imports. Clients subscribed to `COMPETITORS_BY_CLASS_UPDATED_<classId>` will receive one event per changed class. This is the desired consolidation.
