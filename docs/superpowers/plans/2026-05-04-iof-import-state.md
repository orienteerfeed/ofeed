# IOF Import State — Raw-Hash Deduplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before expensive XML parsing, detect identical re-uploads by SHA-256 hash and return 200 OK immediately; persist per-upload import metadata (hash, creator, timestamps, counters) in a new `EventImportState` table.

**Architecture:** A new `upload.import-state.ts` module owns hash computation, lightweight root-element detection, and all DB access for `EventImportState`. `upload.handlers.ts` calls it in two places: an early-return check (after auth, before `parseXml`) and a state-upsert call (after successful processing). The Prisma model stores one row per `(eventId, sourceType, payloadType)` triple; the unique constraint enables safe `upsert`.

**Tech Stack:** TypeScript, Node.js 24 built-in `crypto`, Prisma 7, MariaDB, Vitest.

---

## File Map

| File | Action |
|---|---|
| `apps/server/prisma/schema.prisma` | **Modify** — add `ImportSourceType` enum + `EventImportState` model + relation on `Event` |
| `apps/server/prisma/migrations/20260504000000_add_event_import_state/migration.sql` | **Create** — raw DDL for the new table |
| `apps/server/src/modules/upload/upload.import-state.ts` | **Create** — `computeRawHash`, `detectXmlRootElement`, `findImportStateByHash`, `upsertImportState`, `recordSkippedImport` |
| `apps/server/src/modules/upload/__tests__/upload.import-state.test.ts` | **Create** — unit tests with mocked Prisma |
| `apps/server/src/modules/upload/upload.handlers.ts` | **Modify** — import new helpers, add hash check after auth, add `upsertImportState` after successful processing |

---

### Task 1: Prisma schema + migration

**Files:**
- Modify: `apps/server/prisma/schema.prisma`
- Create: `apps/server/prisma/migrations/20260504000000_add_event_import_state/migration.sql`

- [ ] **Step 1: Add `ImportSourceType` enum to `schema.prisma`**

Add this block immediately after the existing `ExternalResultsSyncStatus` enum (around line 517):

```prisma
enum ImportSourceType {
  IOF_XML
}
```

- [ ] **Step 2: Add `importStates` relation to the `Event` model**

In the `Event` model, after the `organisations Organisation[]` line, add:

```prisma
  importStates                 EventImportState[]
```

- [ ] **Step 3: Add `EventImportState` model to `schema.prisma`**

Add after the `EventExternalResultsSyncState` model block:

```prisma
model EventImportState {
  id                     Int              @id @default(autoincrement()) @db.UnsignedInt
  event                  Event            @relation(fields: [eventId], references: [id], onDelete: Cascade)
  eventId                String
  sourceType             ImportSourceType
  payloadType            String           @db.VarChar(32)
  rawHash                String           @db.Char(64)
  creator                String?          @db.VarChar(128)
  externalCreateTime     DateTime?
  formatVersion          String?          @db.VarChar(16)
  externalStatus         String?          @db.VarChar(32)
  rootElement            String?          @db.VarChar(64)
  lastSuccessfulImportAt DateTime?
  lastSkippedAt          DateTime?
  successCount           Int              @default(0) @db.UnsignedInt
  skippedCount           Int              @default(0) @db.UnsignedInt
  createdAt              DateTime         @default(now())
  updatedAt              DateTime         @updatedAt

  @@unique([eventId, sourceType, payloadType], map: "event_import_state_event_source_payload_uq")
  @@index([eventId], map: "event_import_state_event_idx")
}
```

- [ ] **Step 4: Create the migration SQL file**

Create directory `apps/server/prisma/migrations/20260504000000_add_event_import_state/` and write `migration.sql`:

```sql
-- CreateTable: tracks per-event, per-source, per-payload import state for deduplication
CREATE TABLE `EventImportState` (
    `id`                     INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `eventId`                VARCHAR(191) NOT NULL,
    `sourceType`             ENUM('IOF_XML') NOT NULL,
    `payloadType`            VARCHAR(32) NOT NULL,
    `rawHash`                CHAR(64) NOT NULL,
    `creator`                VARCHAR(128) NULL,
    `externalCreateTime`     DATETIME(3) NULL,
    `formatVersion`          VARCHAR(16) NULL,
    `externalStatus`         VARCHAR(32) NULL,
    `rootElement`            VARCHAR(64) NULL,
    `lastSuccessfulImportAt` DATETIME(3) NULL,
    `lastSkippedAt`          DATETIME(3) NULL,
    `successCount`           INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `skippedCount`           INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `createdAt`              DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`              DATETIME(3) NOT NULL,

    INDEX `event_import_state_event_idx`(`eventId`),
    UNIQUE INDEX `event_import_state_event_source_payload_uq`(`eventId`, `sourceType`, `payloadType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EventImportState` ADD CONSTRAINT `EventImportState_eventId_fkey`
    FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 5: Run migration and generate Prisma client**

```bash
pnpm --filter ofeed-server db:migrate
pnpm --filter ofeed-server db:generate
```

Expected: migration applied, Prisma client regenerated with `eventImportState` accessor and `ImportSourceType` enum.

- [ ] **Step 6: Run type-check to confirm schema compiles**

```bash
pnpm --filter ofeed-server type-check 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/server/prisma/schema.prisma \
        apps/server/prisma/migrations/20260504000000_add_event_import_state/migration.sql
git commit -m "feat(db): add EventImportState table for IOF upload deduplication"
```

---

### Task 2: Write failing tests for `upload.import-state.ts`

**Files:**
- Create: `apps/server/src/modules/upload/__tests__/upload.import-state.test.ts`

- [ ] **Step 1: Create the test file**

```ts
// apps/server/src/modules/upload/__tests__/upload.import-state.test.ts
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ImportSourceType } from '../../../generated/prisma/enums.js';
import {
  computeRawHash,
  detectXmlRootElement,
  findImportStateByHash,
  recordSkippedImport,
  upsertImportState,
} from '../upload.import-state.js';

const mockPrisma = vi.hoisted(() => ({
  eventImportState: {
    findFirst: vi.fn(),
    upsert: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock('../../../utils/context.js', () => ({ default: mockPrisma }));

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// computeRawHash
// ---------------------------------------------------------------------------

describe('computeRawHash', () => {
  it('returns the SHA-256 hex digest of the buffer content', () => {
    const input = Buffer.from('hello');
    const expected = createHash('sha256').update(input).digest('hex');
    expect(computeRawHash(input)).toBe(expected);
  });

  it('returns the same hash for identical input on repeated calls', () => {
    const buf = Buffer.from('<ResultList/>');
    expect(computeRawHash(buf)).toBe(computeRawHash(buf));
  });

  it('returns different hashes for different content', () => {
    expect(computeRawHash(Buffer.from('aaa'))).not.toBe(computeRawHash(Buffer.from('bbb')));
  });
});

// ---------------------------------------------------------------------------
// detectXmlRootElement
// ---------------------------------------------------------------------------

describe('detectXmlRootElement', () => {
  it('returns the root element name from XML without a declaration', () => {
    const buf = Buffer.from('<ResultList xmlns="http://example.org">');
    expect(detectXmlRootElement(buf)).toBe('ResultList');
  });

  it('skips <?xml ...?> and returns the first real element name', () => {
    const buf = Buffer.from('<?xml version="1.0" encoding="utf-8"?><StartList xmlns="...">');
    expect(detectXmlRootElement(buf)).toBe('StartList');
  });

  it('returns null when the buffer contains no XML element', () => {
    expect(detectXmlRootElement(Buffer.from('not xml at all'))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findImportStateByHash
// ---------------------------------------------------------------------------

describe('findImportStateByHash', () => {
  it('returns true when a matching successful import row exists', async () => {
    mockPrisma.eventImportState.findFirst.mockResolvedValueOnce({ id: 1 });

    const result = await findImportStateByHash(
      'event-1',
      ImportSourceType.IOF_XML,
      'ResultList',
      'abc123',
    );

    expect(result).toBe(true);
    expect(mockPrisma.eventImportState.findFirst).toHaveBeenCalledWith({
      where: {
        eventId: 'event-1',
        sourceType: ImportSourceType.IOF_XML,
        payloadType: 'ResultList',
        rawHash: 'abc123',
        lastSuccessfulImportAt: { not: null },
      },
      select: { id: true },
    });
  });

  it('returns false when no matching row is found', async () => {
    mockPrisma.eventImportState.findFirst.mockResolvedValueOnce(null);

    const result = await findImportStateByHash(
      'event-1',
      ImportSourceType.IOF_XML,
      'ResultList',
      'abc123',
    );

    expect(result).toBe(false);
  });

  it('does not match when the same hash is stored for a different eventId', async () => {
    mockPrisma.eventImportState.findFirst.mockResolvedValueOnce(null);

    const result = await findImportStateByHash(
      'event-99',
      ImportSourceType.IOF_XML,
      'ResultList',
      'abc123',
    );

    expect(result).toBe(false);
    expect(mockPrisma.eventImportState.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'event-99' }),
    );
  });

  it('does not match when the same hash is stored for a different payloadType', async () => {
    mockPrisma.eventImportState.findFirst.mockResolvedValueOnce(null);

    const result = await findImportStateByHash(
      'event-1',
      ImportSourceType.IOF_XML,
      'StartList',
      'abc123',
    );

    expect(result).toBe(false);
    expect(mockPrisma.eventImportState.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ payloadType: 'StartList' }),
    );
  });
});

// ---------------------------------------------------------------------------
// upsertImportState
// ---------------------------------------------------------------------------

describe('upsertImportState', () => {
  it('calls upsert with the correct compound unique key and sets lastSuccessfulImportAt to now', async () => {
    const now = new Date('2026-05-04T10:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    mockPrisma.eventImportState.upsert.mockResolvedValueOnce({});

    await upsertImportState('event-1', ImportSourceType.IOF_XML, {
      payloadType: 'ResultList',
      rawHash: 'deadbeef',
      creator: 'QuickEvent 3.5.3',
      externalCreateTime: new Date('2026-04-23T15:02:02.000Z'),
      formatVersion: '3.0',
      externalStatus: 'Complete',
      rootElement: 'ResultList',
    });

    expect(mockPrisma.eventImportState.upsert).toHaveBeenCalledWith({
      where: {
        eventId_sourceType_payloadType: {
          eventId: 'event-1',
          sourceType: ImportSourceType.IOF_XML,
          payloadType: 'ResultList',
        },
      },
      update: expect.objectContaining({
        rawHash: 'deadbeef',
        creator: 'QuickEvent 3.5.3',
        lastSuccessfulImportAt: now,
        successCount: { increment: 1 },
      }),
      create: expect.objectContaining({
        eventId: 'event-1',
        sourceType: ImportSourceType.IOF_XML,
        payloadType: 'ResultList',
        rawHash: 'deadbeef',
        creator: 'QuickEvent 3.5.3',
        lastSuccessfulImportAt: now,
        successCount: 1,
        skippedCount: 0,
      }),
    });
  });
});

// ---------------------------------------------------------------------------
// recordSkippedImport
// ---------------------------------------------------------------------------

describe('recordSkippedImport', () => {
  it('calls updateMany scoped to eventId + sourceType + payloadType + rawHash', async () => {
    mockPrisma.eventImportState.updateMany.mockResolvedValueOnce({ count: 1 });

    await recordSkippedImport('event-1', ImportSourceType.IOF_XML, 'ResultList', 'abc123');

    expect(mockPrisma.eventImportState.updateMany).toHaveBeenCalledWith({
      where: {
        eventId: 'event-1',
        sourceType: ImportSourceType.IOF_XML,
        payloadType: 'ResultList',
        rawHash: 'abc123',
      },
      data: expect.objectContaining({
        lastSkippedAt: expect.any(Date),
        skippedCount: { increment: 1 },
      }),
    });
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
pnpm --filter ofeed-server test -- src/modules/upload/__tests__/upload.import-state.test.ts 2>&1 | tail -15
```

Expected: all tests fail with `Cannot find module '../upload.import-state.js'`.

---

### Task 3: Implement `upload.import-state.ts`

**Files:**
- Create: `apps/server/src/modules/upload/upload.import-state.ts`

- [ ] **Step 1: Create the implementation file**

```ts
// apps/server/src/modules/upload/upload.import-state.ts
import { createHash } from 'node:crypto';

import prisma from '../../utils/context.js';
import { ImportSourceType } from '../../generated/prisma/enums.js';

export { ImportSourceType };

export function computeRawHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export function detectXmlRootElement(xmlBuffer: Buffer): string | null {
  // Read only the first 2 KB — enough to find the root tag without loading the
  // whole document. The pattern skips <?xml ...?> because `?` is not [A-Za-z].
  const head = xmlBuffer.subarray(0, 2048).toString('utf8');
  const match = head.match(/<([A-Za-z][A-Za-z0-9_:.-]*)/);
  return match ? match[1] : null;
}

export async function findImportStateByHash(
  eventId: string,
  sourceType: ImportSourceType,
  payloadType: string,
  rawHash: string,
): Promise<boolean> {
  const existing = await prisma.eventImportState.findFirst({
    where: {
      eventId,
      sourceType,
      payloadType,
      rawHash,
      lastSuccessfulImportAt: { not: null },
    },
    select: { id: true },
  });
  return existing !== null;
}

export type ImportStateMeta = {
  payloadType: string;
  rawHash: string;
  creator?: string | null;
  externalCreateTime?: Date | null;
  formatVersion?: string | null;
  externalStatus?: string | null;
  rootElement?: string | null;
};

export async function upsertImportState(
  eventId: string,
  sourceType: ImportSourceType,
  meta: ImportStateMeta,
): Promise<void> {
  const now = new Date();
  await prisma.eventImportState.upsert({
    where: {
      eventId_sourceType_payloadType: {
        eventId,
        sourceType,
        payloadType: meta.payloadType,
      },
    },
    update: {
      rawHash: meta.rawHash,
      creator: meta.creator ?? null,
      externalCreateTime: meta.externalCreateTime ?? null,
      formatVersion: meta.formatVersion ?? null,
      externalStatus: meta.externalStatus ?? null,
      rootElement: meta.rootElement ?? null,
      lastSuccessfulImportAt: now,
      successCount: { increment: 1 },
    },
    create: {
      eventId,
      sourceType,
      payloadType: meta.payloadType,
      rawHash: meta.rawHash,
      creator: meta.creator ?? null,
      externalCreateTime: meta.externalCreateTime ?? null,
      formatVersion: meta.formatVersion ?? null,
      externalStatus: meta.externalStatus ?? null,
      rootElement: meta.rootElement ?? null,
      lastSuccessfulImportAt: now,
      successCount: 1,
      skippedCount: 0,
    },
  });
}

export async function recordSkippedImport(
  eventId: string,
  sourceType: ImportSourceType,
  payloadType: string,
  rawHash: string,
): Promise<void> {
  await prisma.eventImportState.updateMany({
    where: { eventId, sourceType, payloadType, rawHash },
    data: {
      lastSkippedAt: new Date(),
      skippedCount: { increment: 1 },
    },
  });
}
```

- [ ] **Step 2: Run tests — confirm they pass**

```bash
pnpm --filter ofeed-server test -- src/modules/upload/__tests__/upload.import-state.test.ts 2>&1 | tail -15
```

Expected:
```
✓ src/modules/upload/__tests__/upload.import-state.test.ts (12 tests)
```

- [ ] **Step 3: Run type-check**

```bash
pnpm --filter ofeed-server type-check 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/modules/upload/upload.import-state.ts \
        apps/server/src/modules/upload/__tests__/upload.import-state.test.ts
git commit -m "feat(upload): add import-state service for hash deduplication"
```

---

### Task 4: Wire `upload.import-state.ts` into `upload.handlers.ts`

**Files:**
- Modify: `apps/server/src/modules/upload/upload.handlers.ts`

- [ ] **Step 1: Add the import at the top of `upload.handlers.ts`**

After the existing `import { getXsdSchema } from './upload.xsd-cache.js';` line, add:

```ts
import {
  ImportSourceType,
  computeRawHash,
  detectXmlRootElement,
  findImportStateByHash,
  recordSkippedImport,
  upsertImportState,
} from './upload.import-state.js';
```

- [ ] **Step 2: Add the hash check after auth, before `parseXml`**

Locate this block in `handleIofXmlUpload` (the block where `authorId` is assigned):

```ts
    dbResponseEvent = ownership.event;
    authorId = ownership.userId;
  } catch (err) {
```

Immediately after `authorId = ownership.userId;` and before `} catch (err) {` — actually it's right after the closing `}` of the try block. Find the line:

```ts
  let iofXml3: Record<string, any>;
  try {
    iofXml3 = (await parseXml(xmlBuffer)) as Record<string, any>;
```

Insert this block between the end of the auth try/catch and the `let iofXml3` declaration:

```ts
  // Early return: skip identical re-uploads before expensive XML parsing
  const rawHash = computeRawHash(xmlBuffer);
  const detectedPayloadType = detectXmlRootElement(xmlBuffer);

  if (detectedPayloadType !== null && isIofPayloadType(detectedPayloadType)) {
    const isIdentical = await findImportStateByHash(
      eventId,
      ImportSourceType.IOF_XML,
      detectedPayloadType,
      rawHash,
    );
    if (isIdentical) {
      await recordSkippedImport(eventId, ImportSourceType.IOF_XML, detectedPayloadType, rawHash);
      logUploadEvent(c, 'info', 'IOF upload skipped: identical content already imported', {
        ...uploadDetails,
        success: true,
        stage: 'skipped-identical',
        rawHash,
        detectedPayloadType,
      });
      return c.json(
        success('OK', { data: 'Skipped: identical upload already processed', skipped: true }, 200),
        200,
      );
    }
  }
```

- [ ] **Step 3: Extract IOF root metadata after `parseXml`**

After the line:

```ts
  const iofXmlType = checkXmlType(iofXml3);
```

Add:

```ts
  const iofRootKey = Object.keys(iofXml3)[0] ?? '';
  const iofRootAttr = (iofXml3[iofRootKey]?.ATTR ?? {}) as Record<string, string | undefined>;
  const iofRootMeta = {
    creator: iofRootAttr.creator ?? null,
    externalCreateTime: iofRootAttr.createTime ? new Date(iofRootAttr.createTime) : null,
    formatVersion: iofRootAttr.iofVersion ?? null,
    externalStatus: iofRootAttr.status ?? null,
  };
```

- [ ] **Step 4: Persist import state after successful processing**

Find this block near the end of `handleIofXmlUpload`:

```ts
  logUploadEvent(c, 'info', 'IOF upload completed', {
    ...uploadDetails,
    success: true,
    stage: 'completed',
    eventName,
  });

  return c.json(success('OK', { data: 'Iof xml uploaded successfully: ' + eventName }, 200), 200);
```

Insert before the `logUploadEvent` call:

```ts
  // Persist or update import state for each processed payload type
  await Promise.all(
    iofXmlType.map((type) =>
      upsertImportState(eventId, ImportSourceType.IOF_XML, {
        payloadType: type.jsonKey,
        rawHash,
        rootElement: type.jsonKey,
        ...iofRootMeta,
      }).catch((err) => {
        logUploadEvent(c, 'error', 'IOF upload failed to persist import state', {
          ...uploadDetails,
          success: true,
          stage: 'persist-import-state',
          payloadType: type.jsonKey,
          reason: err instanceof Error ? err.message : 'Unknown error',
        });
      }),
    ),
  );
```

- [ ] **Step 5: Run type-check**

```bash
pnpm --filter ofeed-server type-check 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 6: Run lint**

```bash
pnpm --filter ofeed-server lint 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 7: Run the full server test suite**

```bash
pnpm --filter ofeed-server test 2>&1 | tail -20
```

Expected: all tests pass (new import-state tests + all existing tests).

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/modules/upload/upload.handlers.ts
git commit -m "feat(upload): skip identical IOF re-uploads via raw SHA-256 hash check"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Covered by |
|---|---|
| SHA-256 hash from decompressed `xmlBuffer` before `parseXml` | Task 3 — `computeRawHash`; Task 4 step 2 — called after auth, before parse |
| Check (eventId, payloadType, sourceType) | Task 3 — `findImportStateByHash` takes all three; lightweight root detection via `detectXmlRootElement` provides payloadType without full parse |
| Return 200 skipped if identical | Task 4 step 2 — early return with `skipped: true` |
| No `parseXml` / competitors / protocol / publish on skip | Structural: early return before all those code paths |
| Store/update import metadata after successful import | Task 4 steps 3–4 — `iofRootMeta` + `upsertImportState` per type |
| `creator`, `createTime`, `iofVersion`, `status`, root element | Task 3 `ImportStateMeta`; Task 4 step 3 — extracted from `iofXml3[root].ATTR` |
| No second XML parse for metadata | Metadata extracted from already-parsed `iofXml3` object |
| `EventImportState` unique on (eventId, sourceType, payloadType) | Task 1 — `@@unique` + migration index |
| MOP-ready `sourceType` enum | Task 1 — `ImportSourceType { IOF_XML }` enum; payloadType is `String`, not enum |
| Skip only against last successful (not failed) import | Task 3 — `lastSuccessfulImportAt: { not: null }` in `findImportStateByHash` |
| `successCount` / `skippedCount` / timestamps | Task 1 — schema fields; Task 3 — `upsertImportState` increments `successCount`, `recordSkippedImport` increments `skippedCount` |
| Same hash for different eventId does not skip | Task 2 — dedicated test; query always scopes to `eventId` |
| Same hash for different payloadType does not skip | Task 2 — dedicated test; query scopes to `payloadType` from `detectXmlRootElement` |
| Error in `upsertImportState` does not fail a successful upload | Task 4 step 4 — `.catch()` wrapper logs and swallows |

### Placeholder scan

None.

### Type consistency

- `ImportStateMeta.payloadType: string` — created in Task 3, used in Task 4.
- `ImportSourceType` exported from `upload.import-state.ts` — imported in `upload.handlers.ts` in Task 4 step 1.
- `detectXmlRootElement` returns `string | null` — guarded with `!== null && isIofPayloadType()` in Task 4 step 2.
- `rawHash` declared at hash-check site (Task 4 step 2) — in scope for `upsertImportState` call (Task 4 step 4) because both are in the same function body.
