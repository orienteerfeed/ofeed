# MeOS MOP Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `POST /rest/v1/upload/meos` that receives live MeOS Online Protocol (MOP) XML payloads and persists results into existing event tables.

**Architecture:** New `modules/meos/` Hono module mounted at `/rest/v1/upload`. Auth uses `competition` header (integer) resolved via `EventMeosBinding`; a non-expired `EventPassword` is required and checked with AES-GCM decrypt-and-compare. `MOPComplete` triggers full event data reset inside a Prisma transaction then re-imports; `MOPDiff` applies incremental upserts/deletes. Data lands in existing `Competitor`, `Class`, `Organisation`, `Team`, `Split` tables.

**Tech Stack:** Hono, Prisma 7 (MariaDB adapter), `@xmldom/xmldom`, `argon2` (not used — EventPassword uses AES-GCM decrypt, not argon2), Vitest

**Spec:** `docs/superpowers/specs/2026-05-08-meos-mop-endpoint-design.md`

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `apps/server/src/modules/meos/meos.parser.ts` | MOP XML → typed objects, stat mapping, time conversion |
| Create | `apps/server/src/modules/meos/meos.service.ts` | DB reset, upserts, deletes, `processMopDocument` |
| Create | `apps/server/src/modules/meos/meos.handlers.ts` | HTTP handler: auth pipeline → service → MOP XML response |
| Create | `apps/server/src/modules/meos/meos.routes.ts` | `createRouter()` + `registerMeosRoutes()` |
| Create | `apps/server/src/modules/meos/meos.openapi.ts` | `MEOS_OPENAPI` constants + `MEOS_OPENAPI_PATHS` |
| Create | `apps/server/src/modules/meos/index.ts` | Re-export router |
| Create | `apps/server/src/modules/meos/__tests__/meos.parser.test.ts` | Parser unit tests |
| Create | `apps/server/src/modules/meos/__tests__/meos.service.test.ts` | Service unit tests (mocked Prisma) |
| Create | `apps/server/src/modules/meos/__tests__/meos.handlers.test.ts` | Handler HTTP tests |
| Modify | `apps/server/prisma/schema.prisma` | Add `EventMeosBinding` model + `MEOS` to `ImportSourceType` |
| Modify | `apps/server/src/routes/rest/registry.ts` | Register meos router |
| Modify | `apps/server/src/routes/rest/paths.ts` | Add `meos` path constant |
| Modify | `apps/server/src/config/openapi.paths.ts` | Spread `MEOS_OPENAPI_PATHS` |

---

## Task 1: Prisma Schema Changes

**Files:**
- Modify: `apps/server/prisma/schema.prisma`

- [ ] **Step 1: Add `EventMeosBinding` model and `MEOS` enum value**

In `apps/server/prisma/schema.prisma`, add the model after the `EventImportState` model and update the enum:

```prisma
model EventMeosBinding {
  id                Int       @id @default(autoincrement()) @db.UnsignedInt
  event             Event     @relation(fields: [eventId], references: [id], onDelete: Cascade)
  eventId           String
  meosCompetitionId Int       @unique @db.UnsignedInt
  isActive          Boolean   @default(true)
  lastUploadAt      DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  @@index([eventId])
}
```

Also add the relation on `Event`:
```prisma
// Inside the Event model, add to the relations list:
meosEventBindings    EventMeosBinding[]
```

Update the enum (replace existing):
```prisma
enum ImportSourceType {
  IOF_XML
  MEOS
}
```

- [ ] **Step 2: Generate Prisma client and run migration**

```bash
cd apps/server
pnpm db:generate
pnpm db:migrate
# When prompted for migration name: add_meos_event_binding
```

Expected: migration succeeds, `src/generated/prisma/` updated with `EventMeosBinding` model types.

- [ ] **Step 3: Verify type-check passes**

```bash
pnpm --filter ./apps/server type-check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/server/prisma/schema.prisma apps/server/prisma/migrations/
git commit -m "feat(meos): add EventMeosBinding schema and MEOS import source type"
```

---

## Task 2: MOP XML Parser (TDD)

**Files:**
- Create: `apps/server/src/modules/meos/__tests__/meos.parser.test.ts`
- Create: `apps/server/src/modules/meos/meos.parser.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/server/src/modules/meos/__tests__/meos.parser.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  mapMopStat,
  meosTimeToDateTime,
  parseMopDocument,
} from '../meos.parser.js';

const COMPLETE_XML = `<?xml version="1.0" encoding="utf-8"?>
<MOPComplete xmlns="http://www.melin.nu/mop">
  <competition date="2026-05-10" zerotime="10:00:00">My Event</competition>
  <org id="7" nat="SWE">OK Test</org>
  <cls id="1">D10</cls>
  <cmp id="1" card="500188">
    <base org="7" cls="1" stat="1" st="746700" rt="49090">Linda Klick</base>
    <radio>50,17320;150,31760;100,46200</radio>
    <input it="0" tstat="1"/>
  </cmp>
  <tm id="1">
    <base cls="1" stat="1" bib="5" org="7">Team Alpha</base>
  </tm>
</MOPComplete>`;

const DIFF_XML = `<?xml version="1.0" encoding="utf-8"?>
<MOPDiff xmlns="http://www.melin.nu/mop">
  <org delete="true" id="515"></org>
  <cmp delete="true" id="5490"></cmp>
  <cmp id="2" card="123456">
    <base org="7" cls="1" stat="10" st="750000" rt="0">Štěpán Novák</base>
    <radio></radio>
    <input it="0" tstat="10"/>
  </cmp>
</MOPDiff>`;

describe('parseMopDocument', () => {
  it('returns null for invalid XML', () => {
    expect(parseMopDocument('<broken')).toBeNull();
  });

  it('returns null for unknown root element', () => {
    expect(parseMopDocument('<MOPUnknown></MOPUnknown>')).toBeNull();
  });

  it('parses MOPComplete root type', () => {
    const doc = parseMopDocument(COMPLETE_XML);
    expect(doc).not.toBeNull();
    expect(doc!.rootType).toBe('MOPComplete');
  });

  it('parses MOPDiff root type', () => {
    const doc = parseMopDocument(DIFF_XML);
    expect(doc).not.toBeNull();
    expect(doc!.rootType).toBe('MOPDiff');
  });

  it('parses competition metadata', () => {
    const doc = parseMopDocument(COMPLETE_XML)!;
    expect(doc.competition).toEqual({
      name: 'My Event',
      date: '2026-05-10',
      zeroTime: '10:00:00',
    });
  });

  it('parses organisations', () => {
    const doc = parseMopDocument(COMPLETE_XML)!;
    expect(doc.orgs).toHaveLength(1);
    expect(doc.orgs[0]).toMatchObject({
      id: '7',
      name: 'OK Test',
      nationality: 'SWE',
      delete: false,
    });
  });

  it('parses org delete flag', () => {
    const doc = parseMopDocument(DIFF_XML)!;
    const deleted = doc.orgs.find((o) => o.id === '515');
    expect(deleted).toBeDefined();
    expect(deleted!.delete).toBe(true);
  });

  it('parses classes', () => {
    const doc = parseMopDocument(COMPLETE_XML)!;
    expect(doc.classes).toHaveLength(1);
    expect(doc.classes[0]).toMatchObject({ id: '1', name: 'D10', delete: false });
  });

  it('parses competitor with splits', () => {
    const doc = parseMopDocument(COMPLETE_XML)!;
    expect(doc.competitors).toHaveLength(1);
    const cmp = doc.competitors[0];
    expect(cmp.id).toBe('1');
    expect(cmp.card).toBe(500188);
    expect(cmp.firstName).toBe('Linda');
    expect(cmp.lastName).toBe('Klick');
    expect(cmp.orgId).toBe('7');
    expect(cmp.classId).toBe('1');
    expect(cmp.stat).toBe(1);
    expect(cmp.startTime).toBe(746700);
    expect(cmp.runningTime).toBe(49090);
    expect(cmp.totalStat).toBe(1);
    expect(cmp.radio).toEqual([
      { controlCode: 50, time: 1732 },
      { controlCode: 150, time: 3176 },
      { controlCode: 100, time: 4620 },
    ]);
    expect(cmp.delete).toBe(false);
  });

  it('parses competitor delete flag', () => {
    const doc = parseMopDocument(DIFF_XML)!;
    const deleted = doc.competitors.find((c) => c.id === '5490');
    expect(deleted).toBeDefined();
    expect(deleted!.delete).toBe(true);
  });

  it('parses UTF-8 names correctly', () => {
    const doc = parseMopDocument(DIFF_XML)!;
    const cmp = doc.competitors.find((c) => c.id === '2');
    expect(cmp!.firstName).toBe('Štěpán');
    expect(cmp!.lastName).toBe('Novák');
  });

  it('handles empty radio string', () => {
    const doc = parseMopDocument(DIFF_XML)!;
    const cmp = doc.competitors.find((c) => c.id === '2');
    expect(cmp!.radio).toEqual([]);
  });

  it('parses teams', () => {
    const doc = parseMopDocument(COMPLETE_XML)!;
    expect(doc.teams).toHaveLength(1);
    expect(doc.teams[0]).toMatchObject({
      id: '1',
      name: 'Team Alpha',
      classId: '1',
      orgId: '7',
      bibNumber: 5,
      stat: 1,
      delete: false,
    });
  });
});

describe('mapMopStat', () => {
  it.each([
    [0, 'Inactive'],
    [1, 'OK'],
    [2, 'MissingPunch'],
    [3, 'DidNotFinish'],
    [4, 'Disqualified'],
    [5, 'DidNotStart'],
    [9, 'NotCompeting'],
    [10, 'Active'],
    [20, 'Finished'],
    [99, 'Cancelled'],
    [42, 'Inactive'], // unknown → safe default
  ] as const)('maps stat %i to %s', (stat, expected) => {
    expect(mapMopStat(stat)).toBe(expected);
  });
});

describe('meosTimeToDateTime', () => {
  const eventDate = new Date('2026-05-10T00:00:00.000Z');

  it('converts tenths-of-second offset to a DateTime', () => {
    // 746700 tenths = 74670 seconds = 20h 44m 30s from midnight UTC
    const result = meosTimeToDateTime(746700, eventDate);
    expect(result).toEqual(new Date('2026-05-10T20:44:30.000Z'));
  });

  it('returns midnight for offset 0', () => {
    expect(meosTimeToDateTime(0, eventDate)).toEqual(new Date('2026-05-10T00:00:00.000Z'));
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter ./apps/server test src/modules/meos/__tests__/meos.parser.test.ts
```

Expected: all tests FAIL with `Cannot find module '../meos.parser.js'`.

- [ ] **Step 3: Implement `meos.parser.ts`**

Create `apps/server/src/modules/meos/meos.parser.ts`:

```typescript
import { DOMParser } from '@xmldom/xmldom';

import type { ResultStatus } from '../../generated/prisma/enums.js';

export type MopRootType = 'MOPComplete' | 'MOPDiff';

export type MopCompetition = {
  name: string;
  date: string | null;
  zeroTime: string | null;
};

export type MopOrg = {
  id: string;
  name: string;
  nationality: string | null;
  delete: boolean;
};

export type MopClass = {
  id: string;
  name: string;
  delete: boolean;
};

export type MopSplit = {
  controlCode: number;
  time: number; // seconds (tenths ÷ 10)
};

export type MopCompetitor = {
  id: string;
  delete: boolean;
  card: number | null;
  firstName: string;
  lastName: string;
  orgId: string | null;
  classId: string | null;
  stat: number;
  startTime: number | null; // tenths of second from midnight
  runningTime: number | null; // tenths of second
  totalStat: number | null;
  radio: MopSplit[];
};

export type MopTeam = {
  id: string;
  delete: boolean;
  name: string;
  classId: string | null;
  orgId: string | null;
  bibNumber: number;
  stat: number | null;
};

export type MopDocument = {
  rootType: MopRootType;
  competition: MopCompetition | null;
  orgs: MopOrg[];
  classes: MopClass[];
  competitors: MopCompetitor[];
  teams: MopTeam[];
};

const MOP_STAT_MAP: Partial<Record<number, ResultStatus>> = {
  0: 'Inactive',
  1: 'OK',
  2: 'MissingPunch',
  3: 'DidNotFinish',
  4: 'Disqualified',
  5: 'DidNotStart',
  9: 'NotCompeting',
  10: 'Active',
  20: 'Finished',
  99: 'Cancelled',
};

export function mapMopStat(stat: number): ResultStatus {
  return MOP_STAT_MAP[stat] ?? 'Inactive';
}

export function meosTimeToDateTime(tenths: number, eventDate: Date): Date {
  const midnight = new Date(eventDate);
  midnight.setUTCHours(0, 0, 0, 0);
  return new Date(midnight.getTime() + Math.floor(tenths / 10) * 1000);
}

function getAttr(el: Element, name: string): string | null {
  return el.getAttribute(name);
}

function getTextContent(el: Element): string {
  return (el.textContent ?? '').trim();
}

function parseRadio(radioText: string): MopSplit[] {
  if (!radioText.trim()) return [];
  return radioText
    .split(';')
    .map((pair) => {
      const [codeStr, timeStr] = pair.split(',');
      const controlCode = parseInt(codeStr, 10);
      const timeTenths = parseInt(timeStr, 10);
      return { controlCode, time: Math.floor(timeTenths / 10) };
    })
    .filter((s) => !isNaN(s.controlCode) && !isNaN(s.time));
}

export function parseMopDocument(xml: string): MopDocument | null {
  const domParser = new DOMParser({
    errorHandler: { warning: () => {}, error: () => {}, fatalError: () => {} },
  });

  let doc: Document;
  try {
    doc = domParser.parseFromString(xml, 'text/xml');
  } catch {
    return null;
  }

  if (doc.getElementsByTagName('parsererror').length > 0) {
    return null;
  }

  const root = doc.documentElement;
  if (!root) return null;

  const rootName = root.localName ?? root.nodeName;
  if (rootName !== 'MOPComplete' && rootName !== 'MOPDiff') return null;
  const rootType = rootName as MopRootType;

  // competition
  let competition: MopCompetition | null = null;
  const compEls = root.getElementsByTagName('competition');
  if (compEls.length > 0) {
    const el = compEls[0] as Element;
    competition = {
      name: getTextContent(el),
      date: getAttr(el, 'date'),
      zeroTime: getAttr(el, 'zerotime'),
    };
  }

  // orgs
  const orgs: MopOrg[] = [];
  const orgEls = root.getElementsByTagName('org');
  for (let i = 0; i < orgEls.length; i++) {
    const el = orgEls[i] as Element;
    const id = getAttr(el, 'id');
    if (!id) continue;
    orgs.push({
      id,
      name: getTextContent(el),
      nationality: getAttr(el, 'nat'),
      delete: getAttr(el, 'delete') === 'true',
    });
  }

  // classes
  const classes: MopClass[] = [];
  const clsEls = root.getElementsByTagName('cls');
  for (let i = 0; i < clsEls.length; i++) {
    const el = clsEls[i] as Element;
    const id = getAttr(el, 'id');
    if (!id) continue;
    classes.push({
      id,
      name: getTextContent(el),
      delete: getAttr(el, 'delete') === 'true',
    });
  }

  // competitors
  const competitors: MopCompetitor[] = [];
  const cmpEls = root.getElementsByTagName('cmp');
  for (let i = 0; i < cmpEls.length; i++) {
    const el = cmpEls[i] as Element;
    const id = getAttr(el, 'id');
    if (!id) continue;

    if (getAttr(el, 'delete') === 'true') {
      competitors.push({
        id,
        delete: true,
        card: null,
        firstName: '',
        lastName: '',
        orgId: null,
        classId: null,
        stat: 0,
        startTime: null,
        runningTime: null,
        totalStat: null,
        radio: [],
      });
      continue;
    }

    const baseEls = el.getElementsByTagName('base');
    const baseEl = baseEls.length > 0 ? (baseEls[0] as Element) : null;

    const fullName = baseEl ? getTextContent(baseEl) : '';
    const spaceIdx = fullName.indexOf(' ');
    const firstName = spaceIdx >= 0 ? fullName.slice(0, spaceIdx) : '';
    const lastName = spaceIdx >= 0 ? fullName.slice(spaceIdx + 1) : fullName;

    const stat = baseEl ? parseInt(getAttr(baseEl, 'stat') ?? '0', 10) : 0;
    const stRaw = baseEl ? getAttr(baseEl, 'st') : null;
    const rtRaw = baseEl ? getAttr(baseEl, 'rt') : null;
    const cardRaw = getAttr(el, 'card');

    const radioEls = el.getElementsByTagName('radio');
    const radioText = radioEls.length > 0 ? getTextContent(radioEls[0] as Element) : '';
    const radio = parseRadio(radioText);

    const inputEls = el.getElementsByTagName('input');
    let totalStat: number | null = null;
    if (inputEls.length > 0) {
      const tstatRaw = getAttr(inputEls[0] as Element, 'tstat');
      if (tstatRaw !== null) totalStat = parseInt(tstatRaw, 10);
    }

    competitors.push({
      id,
      delete: false,
      card: cardRaw !== null ? parseInt(cardRaw, 10) : null,
      firstName,
      lastName,
      orgId: baseEl ? getAttr(baseEl, 'org') : null,
      classId: baseEl ? getAttr(baseEl, 'cls') : null,
      stat,
      startTime: stRaw !== null ? parseInt(stRaw, 10) : null,
      runningTime: rtRaw !== null ? parseInt(rtRaw, 10) : null,
      totalStat,
      radio,
    });
  }

  // teams
  const teams: MopTeam[] = [];
  const tmEls = root.getElementsByTagName('tm');
  for (let i = 0; i < tmEls.length; i++) {
    const el = tmEls[i] as Element;
    const id = getAttr(el, 'id');
    if (!id) continue;

    if (getAttr(el, 'delete') === 'true') {
      teams.push({ id, delete: true, name: '', classId: null, orgId: null, bibNumber: 0, stat: null });
      continue;
    }

    const baseEls = el.getElementsByTagName('base');
    const baseEl = baseEls.length > 0 ? (baseEls[0] as Element) : null;
    const bibRaw = baseEl ? getAttr(baseEl, 'bib') : null;
    const statRaw = baseEl ? getAttr(baseEl, 'stat') : null;

    teams.push({
      id,
      delete: false,
      name: baseEl ? getTextContent(baseEl) : '',
      classId: baseEl ? getAttr(baseEl, 'cls') : null,
      orgId: baseEl ? getAttr(baseEl, 'org') : null,
      bibNumber: bibRaw !== null ? parseInt(bibRaw, 10) : 0,
      stat: statRaw !== null ? parseInt(statRaw, 10) : null,
    });
  }

  return { rootType, competition, orgs, classes, competitors, teams };
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
pnpm --filter ./apps/server test src/modules/meos/__tests__/meos.parser.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/meos/meos.parser.ts \
        apps/server/src/modules/meos/__tests__/meos.parser.test.ts
git commit -m "feat(meos): add MOP XML parser with TDD"
```

---

## Task 3: MeOS DB Service (TDD)

**Files:**
- Create: `apps/server/src/modules/meos/__tests__/meos.service.test.ts`
- Create: `apps/server/src/modules/meos/meos.service.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/server/src/modules/meos/__tests__/meos.service.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MopDocument } from '../meos.parser.js';
import {
  deleteMeosClass,
  deleteMeosCompetitor,
  deleteMeosOrg,
  deleteMeosTeam,
  processMopDocument,
  resetEventData,
  upsertMeosClass,
  upsertMeosCompetitor,
  upsertMeosOrg,
  upsertMeosTeam,
} from '../meos.service.js';

const mockPrisma = vi.hoisted(() => ({
  class: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  organisation: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  competitor: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  team: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  split: {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  protocol: {
    deleteMany: vi.fn(),
  },
  eventMeosBinding: {
    update: vi.fn(),
  },
  eventImportState: {
    upsert: vi.fn(),
    updateMany: vi.fn(),
    findFirst: vi.fn(),
  },
  event: {
    findUnique: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock('@/utils/context.js', () => ({ default: mockPrisma }));

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// resetEventData
// ---------------------------------------------------------------------------

describe('resetEventData', () => {
  it('deletes splits, protocols, competitors, teams, classes, and organisations in order', async () => {
    mockPrisma.class.findMany.mockResolvedValueOnce([{ id: 10 }, { id: 11 }]);
    mockPrisma.competitor.findMany.mockResolvedValueOnce([{ id: 100 }, { id: 101 }]);
    mockPrisma.split.deleteMany.mockResolvedValueOnce({ count: 3 });
    mockPrisma.protocol.deleteMany.mockResolvedValueOnce({ count: 0 });
    mockPrisma.competitor.deleteMany.mockResolvedValueOnce({ count: 2 });
    mockPrisma.team.deleteMany.mockResolvedValueOnce({ count: 1 });
    mockPrisma.class.deleteMany.mockResolvedValueOnce({ count: 2 });
    mockPrisma.organisation.deleteMany.mockResolvedValueOnce({ count: 1 });

    await resetEventData(mockPrisma as any, 'event-1');

    expect(mockPrisma.split.deleteMany).toHaveBeenCalledWith({
      where: { competitorId: { in: [100, 101] } },
    });
    expect(mockPrisma.protocol.deleteMany).toHaveBeenCalledWith({
      where: { competitorId: { in: [100, 101] } },
    });
    expect(mockPrisma.competitor.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [100, 101] } },
    });
    expect(mockPrisma.team.deleteMany).toHaveBeenCalledWith({
      where: { classId: { in: [10, 11] } },
    });
    expect(mockPrisma.class.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [10, 11] } },
    });
    expect(mockPrisma.organisation.deleteMany).toHaveBeenCalledWith({
      where: { eventId: 'event-1' },
    });
  });

  it('skips competitor/split/team deletes when no classes exist', async () => {
    mockPrisma.class.findMany.mockResolvedValueOnce([]);
    mockPrisma.organisation.deleteMany.mockResolvedValueOnce({ count: 0 });

    await resetEventData(mockPrisma as any, 'event-empty');

    expect(mockPrisma.competitor.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.split.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.organisation.deleteMany).toHaveBeenCalledWith({
      where: { eventId: 'event-empty' },
    });
  });
});

// ---------------------------------------------------------------------------
// upsertMeosOrg
// ---------------------------------------------------------------------------

describe('upsertMeosOrg', () => {
  it('creates a new organisation when not found', async () => {
    mockPrisma.organisation.findUnique.mockResolvedValueOnce(null);
    mockPrisma.organisation.create.mockResolvedValueOnce({ id: 42 });

    const id = await upsertMeosOrg(mockPrisma as any, 'event-1', {
      id: '7',
      name: 'OK Test',
      nationality: 'SWE',
      delete: false,
    });

    expect(id).toBe(42);
    expect(mockPrisma.organisation.create).toHaveBeenCalledWith({
      data: { eventId: 'event-1', externalId: '7', name: 'OK Test', nationality: 'SWE' },
      select: { id: true },
    });
  });

  it('updates an existing organisation when found', async () => {
    mockPrisma.organisation.findUnique.mockResolvedValueOnce({ id: 42 });
    mockPrisma.organisation.update.mockResolvedValueOnce({ id: 42 });

    const id = await upsertMeosOrg(mockPrisma as any, 'event-1', {
      id: '7',
      name: 'OK Updated',
      nationality: null,
      delete: false,
    });

    expect(id).toBe(42);
    expect(mockPrisma.organisation.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { name: 'OK Updated', nationality: null },
    });
  });
});

// ---------------------------------------------------------------------------
// upsertMeosClass
// ---------------------------------------------------------------------------

describe('upsertMeosClass', () => {
  it('creates a new class when not found', async () => {
    mockPrisma.class.findFirst.mockResolvedValueOnce(null);
    mockPrisma.class.create.mockResolvedValueOnce({ id: 10 });

    const id = await upsertMeosClass(mockPrisma as any, 'event-1', {
      id: '1',
      name: 'D10',
      delete: false,
    });

    expect(id).toBe(10);
    expect(mockPrisma.class.create).toHaveBeenCalledWith({
      data: { eventId: 'event-1', externalId: '1', name: 'D10' },
      select: { id: true },
    });
  });

  it('updates an existing class when found', async () => {
    mockPrisma.class.findFirst.mockResolvedValueOnce({ id: 10 });
    mockPrisma.class.update.mockResolvedValueOnce({ id: 10 });

    const id = await upsertMeosClass(mockPrisma as any, 'event-1', {
      id: '1',
      name: 'D10 Updated',
      delete: false,
    });

    expect(id).toBe(10);
    expect(mockPrisma.class.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { name: 'D10 Updated' },
    });
  });
});

// ---------------------------------------------------------------------------
// upsertMeosCompetitor
// ---------------------------------------------------------------------------

describe('upsertMeosCompetitor', () => {
  const eventDate = new Date('2026-05-10T00:00:00.000Z');
  const orgIdMap = new Map([['7', 42]]);
  const classIdMap = new Map([['1', 10]]);
  const event = { date: eventDate, timezone: 'Europe/Prague' };

  it('creates a new competitor with splits', async () => {
    mockPrisma.competitor.findUnique.mockResolvedValueOnce(null);
    mockPrisma.competitor.create.mockResolvedValueOnce({ id: 100 });
    mockPrisma.split.createMany.mockResolvedValueOnce({ count: 3 });

    await upsertMeosCompetitor(
      mockPrisma as any,
      'event-1',
      {
        id: '1',
        delete: false,
        card: 500188,
        firstName: 'Linda',
        lastName: 'Klick',
        orgId: '7',
        classId: '1',
        stat: 1,
        startTime: 746700,
        runningTime: 49090,
        totalStat: 1,
        radio: [
          { controlCode: 50, time: 1732 },
          { controlCode: 150, time: 3176 },
          { controlCode: 100, time: 4620 },
        ],
      },
      orgIdMap,
      classIdMap,
      event,
    );

    expect(mockPrisma.competitor.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          classId: 10,
          externalId: '1',
          firstname: 'Linda',
          lastname: 'Klick',
          registration: '',
          card: 500188,
          organisationId: 42,
          status: 'OK',
          time: 4909,
        }),
        select: { id: true },
      }),
    );
    expect(mockPrisma.split.createMany).toHaveBeenCalledWith({
      data: [
        { competitorId: 100, controlCode: 50, time: 1732 },
        { competitorId: 100, controlCode: 150, time: 3176 },
        { competitorId: 100, controlCode: 100, time: 4620 },
      ],
    });
  });

  it('updates existing competitor and replaces splits', async () => {
    mockPrisma.competitor.findUnique.mockResolvedValueOnce({ id: 100 });
    mockPrisma.split.deleteMany.mockResolvedValueOnce({ count: 2 });
    mockPrisma.competitor.update.mockResolvedValueOnce({ id: 100 });
    mockPrisma.split.createMany.mockResolvedValueOnce({ count: 1 });

    await upsertMeosCompetitor(
      mockPrisma as any,
      'event-1',
      {
        id: '1',
        delete: false,
        card: null,
        firstName: 'Linda',
        lastName: 'Klick',
        orgId: null,
        classId: '1',
        stat: 20,
        startTime: null,
        runningTime: 49090,
        totalStat: null,
        radio: [{ controlCode: 50, time: 1732 }],
      },
      orgIdMap,
      classIdMap,
      event,
    );

    expect(mockPrisma.split.deleteMany).toHaveBeenCalledWith({
      where: { competitorId: 100 },
    });
    expect(mockPrisma.competitor.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 100 },
        data: expect.objectContaining({ status: 'Finished' }),
      }),
    );
  });

  it('skips competitor whose class is not in classIdMap', async () => {
    await upsertMeosCompetitor(
      mockPrisma as any,
      'event-1',
      {
        id: '99',
        delete: false,
        card: null,
        firstName: 'X',
        lastName: 'Y',
        orgId: null,
        classId: '999',
        stat: 0,
        startTime: null,
        runningTime: null,
        totalStat: null,
        radio: [],
      },
      orgIdMap,
      classIdMap,
      event,
    );

    expect(mockPrisma.competitor.create).not.toHaveBeenCalled();
    expect(mockPrisma.competitor.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deleteMeosCompetitor
// ---------------------------------------------------------------------------

describe('deleteMeosCompetitor', () => {
  it('deletes splits then competitor when found', async () => {
    mockPrisma.class.findMany.mockResolvedValueOnce([{ id: 10 }]);
    mockPrisma.competitor.findFirst.mockResolvedValueOnce({ id: 100 });
    mockPrisma.split.deleteMany.mockResolvedValueOnce({ count: 2 });
    mockPrisma.protocol.deleteMany.mockResolvedValueOnce({ count: 0 });
    mockPrisma.competitor.delete.mockResolvedValueOnce({ id: 100 });

    await deleteMeosCompetitor(mockPrisma as any, 'event-1', '5490');

    expect(mockPrisma.split.deleteMany).toHaveBeenCalledWith({
      where: { competitorId: 100 },
    });
    expect(mockPrisma.competitor.delete).toHaveBeenCalledWith({ where: { id: 100 } });
  });

  it('does nothing when competitor not found', async () => {
    mockPrisma.class.findMany.mockResolvedValueOnce([{ id: 10 }]);
    mockPrisma.competitor.findFirst.mockResolvedValueOnce(null);

    await deleteMeosCompetitor(mockPrisma as any, 'event-1', '9999');

    expect(mockPrisma.competitor.delete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deleteMeosOrg
// ---------------------------------------------------------------------------

describe('deleteMeosOrg', () => {
  it('deletes the org when found', async () => {
    mockPrisma.organisation.findUnique.mockResolvedValueOnce({ id: 42 });
    mockPrisma.organisation.delete.mockResolvedValueOnce({ id: 42 });

    await deleteMeosOrg(mockPrisma as any, 'event-1', '515');

    expect(mockPrisma.organisation.delete).toHaveBeenCalledWith({ where: { id: 42 } });
  });

  it('does nothing when org not found', async () => {
    mockPrisma.organisation.findUnique.mockResolvedValueOnce(null);

    await deleteMeosOrg(mockPrisma as any, 'event-1', '999');

    expect(mockPrisma.organisation.delete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deleteMeosClass
// ---------------------------------------------------------------------------

describe('deleteMeosClass', () => {
  it('deletes class with its cascaded competitors and teams', async () => {
    mockPrisma.class.findFirst.mockResolvedValueOnce({ id: 10 });
    mockPrisma.competitor.findMany.mockResolvedValueOnce([{ id: 100 }]);
    mockPrisma.split.deleteMany.mockResolvedValueOnce({ count: 1 });
    mockPrisma.protocol.deleteMany.mockResolvedValueOnce({ count: 0 });
    mockPrisma.competitor.deleteMany.mockResolvedValueOnce({ count: 1 });
    mockPrisma.team.deleteMany.mockResolvedValueOnce({ count: 0 });
    mockPrisma.class.delete.mockResolvedValueOnce({ id: 10 });

    await deleteMeosClass(mockPrisma as any, 'event-1', '1');

    expect(mockPrisma.split.deleteMany).toHaveBeenCalledWith({ where: { competitorId: { in: [100] } } });
    expect(mockPrisma.class.delete).toHaveBeenCalledWith({ where: { id: 10 } });
  });
});

// ---------------------------------------------------------------------------
// deleteMeosTeam
// ---------------------------------------------------------------------------

describe('deleteMeosTeam', () => {
  it('deletes team when found', async () => {
    mockPrisma.class.findMany.mockResolvedValueOnce([{ id: 10 }]);
    mockPrisma.team.findFirst.mockResolvedValueOnce({ id: 50 });
    mockPrisma.team.delete.mockResolvedValueOnce({ id: 50 });

    await deleteMeosTeam(mockPrisma as any, 'event-1', '1');

    expect(mockPrisma.team.delete).toHaveBeenCalledWith({ where: { id: 50 } });
  });
});

// ---------------------------------------------------------------------------
// processMopDocument — integration
// ---------------------------------------------------------------------------

describe('processMopDocument', () => {
  it('performs full reset then inserts on MOPComplete', async () => {
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
    );
    // Reset mocks
    mockPrisma.class.findMany.mockResolvedValue([]);
    mockPrisma.organisation.deleteMany.mockResolvedValue({ count: 0 });
    // Upsert org
    mockPrisma.organisation.findUnique.mockResolvedValue(null);
    mockPrisma.organisation.create.mockResolvedValue({ id: 42 });
    // Upsert class
    mockPrisma.class.findFirst.mockResolvedValue(null);
    mockPrisma.class.create.mockResolvedValue({ id: 10 });
    // Upsert competitor
    mockPrisma.competitor.findUnique.mockResolvedValue(null);
    mockPrisma.competitor.create.mockResolvedValue({ id: 100 });
    mockPrisma.split.createMany.mockResolvedValue({ count: 0 });

    const doc: MopDocument = {
      rootType: 'MOPComplete',
      competition: null,
      orgs: [{ id: '7', name: 'OK Test', nationality: null, delete: false }],
      classes: [{ id: '1', name: 'D10', delete: false }],
      competitors: [
        {
          id: '1',
          delete: false,
          card: null,
          firstName: 'A',
          lastName: 'B',
          orgId: '7',
          classId: '1',
          stat: 1,
          startTime: null,
          runningTime: 6000,
          totalStat: null,
          radio: [],
        },
      ],
      teams: [],
    };

    await processMopDocument('event-1', doc, {
      date: new Date('2026-05-10T00:00:00.000Z'),
      timezone: 'Europe/Prague',
    });

    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
    // reset was called (empty event so only org.deleteMany matters)
    expect(mockPrisma.organisation.deleteMany).toHaveBeenCalledWith({ where: { eventId: 'event-1' } });
    // org, class, competitor inserted
    expect(mockPrisma.organisation.create).toHaveBeenCalledOnce();
    expect(mockPrisma.class.create).toHaveBeenCalledOnce();
    expect(mockPrisma.competitor.create).toHaveBeenCalledOnce();
  });

  it('applies incremental upserts on MOPDiff without reset', async () => {
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
    );
    // MOPDiff: load existing classes for id resolution
    mockPrisma.class.findMany
      .mockResolvedValueOnce([{ id: 10, externalId: '1' }]) // existing classes for MOPDiff resolution
    mockPrisma.organisation.findMany.mockResolvedValueOnce([{ id: 42, externalId: '7' }]);
    // No new orgs or classes in this diff, just a competitor update
    mockPrisma.competitor.findUnique.mockResolvedValueOnce({ id: 100 });
    mockPrisma.split.deleteMany.mockResolvedValueOnce({ count: 0 });
    mockPrisma.competitor.update.mockResolvedValueOnce({ id: 100 });
    mockPrisma.split.createMany.mockResolvedValueOnce({ count: 0 });

    const doc: MopDocument = {
      rootType: 'MOPDiff',
      competition: null,
      orgs: [],
      classes: [],
      competitors: [
        {
          id: '1',
          delete: false,
          card: null,
          firstName: 'A',
          lastName: 'B',
          orgId: '7',
          classId: '1',
          stat: 20,
          startTime: null,
          runningTime: 6000,
          totalStat: null,
          radio: [],
        },
      ],
      teams: [],
    };

    await processMopDocument('event-1', doc, {
      date: new Date('2026-05-10T00:00:00.000Z'),
      timezone: 'Europe/Prague',
    });

    // reset NOT called — no deleteMany for classes/competitors
    expect(mockPrisma.class.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.competitor.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.competitor.update).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter ./apps/server test src/modules/meos/__tests__/meos.service.test.ts
```

Expected: FAIL — `Cannot find module '../meos.service.js'`.

- [ ] **Step 3: Implement `meos.service.ts`**

Create `apps/server/src/modules/meos/meos.service.ts`:

```typescript
import prisma from '../../utils/context.js';
import { mapMopStat, meosTimeToDateTime } from './meos.parser.js';
import type { MopClass, MopCompetitor, MopDocument, MopOrg, MopTeam } from './meos.parser.js';

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function resetEventData(tx: PrismaTx, eventId: string): Promise<void> {
  const classes = await tx.class.findMany({ where: { eventId }, select: { id: true } });
  const classIds = classes.map((c) => c.id);

  if (classIds.length > 0) {
    const competitors = await tx.competitor.findMany({
      where: { classId: { in: classIds } },
      select: { id: true },
    });
    const competitorIds = competitors.map((c) => c.id);

    if (competitorIds.length > 0) {
      await tx.split.deleteMany({ where: { competitorId: { in: competitorIds } } });
      await tx.protocol.deleteMany({ where: { competitorId: { in: competitorIds } } });
      await tx.competitor.deleteMany({ where: { id: { in: competitorIds } } });
    }

    await tx.team.deleteMany({ where: { classId: { in: classIds } } });
    await tx.class.deleteMany({ where: { id: { in: classIds } } });
  }

  await tx.organisation.deleteMany({ where: { eventId } });
}

export async function upsertMeosOrg(
  tx: PrismaTx,
  eventId: string,
  org: MopOrg,
): Promise<number> {
  const existing = await tx.organisation.findUnique({
    where: { eventId_externalId: { eventId, externalId: org.id } },
    select: { id: true },
  });

  if (existing) {
    await tx.organisation.update({
      where: { id: existing.id },
      data: { name: org.name, nationality: org.nationality ?? null },
    });
    return existing.id;
  }

  const created = await tx.organisation.create({
    data: { eventId, externalId: org.id, name: org.name, nationality: org.nationality ?? null },
    select: { id: true },
  });
  return created.id;
}

export async function upsertMeosClass(
  tx: PrismaTx,
  eventId: string,
  cls: MopClass,
): Promise<number> {
  const existing = await tx.class.findFirst({
    where: { eventId, externalId: cls.id },
    select: { id: true },
  });

  if (existing) {
    await tx.class.update({ where: { id: existing.id }, data: { name: cls.name } });
    return existing.id;
  }

  const created = await tx.class.create({
    data: { eventId, externalId: cls.id, name: cls.name },
    select: { id: true },
  });
  return created.id;
}

export async function upsertMeosCompetitor(
  tx: PrismaTx,
  eventId: string,
  cmp: MopCompetitor,
  orgIdMap: Map<string, number>,
  classIdMap: Map<string, number>,
  event: { date: Date; timezone: string },
): Promise<void> {
  if (!cmp.classId) return;
  const classId = classIdMap.get(cmp.classId);
  if (classId === undefined) return;

  const orgId = cmp.orgId !== null ? (orgIdMap.get(cmp.orgId) ?? null) : null;
  const finalStat = cmp.totalStat !== null ? cmp.totalStat : cmp.stat;
  const status = mapMopStat(finalStat);
  const startTime =
    cmp.startTime !== null ? meosTimeToDateTime(cmp.startTime, event.date) : null;

  const data = {
    firstname: cmp.firstName,
    lastname: cmp.lastName,
    registration: '' as string,
    card: cmp.card ?? null,
    organisationId: orgId,
    status,
    startTime,
    time: cmp.runningTime !== null ? Math.floor(cmp.runningTime / 10) : null,
  };

  const existing = await tx.competitor.findUnique({
    where: { classId_externalId: { classId, externalId: cmp.id } },
    select: { id: true },
  });

  let competitorId: number;
  if (existing) {
    await tx.competitor.update({ where: { id: existing.id }, data });
    competitorId = existing.id;
    await tx.split.deleteMany({ where: { competitorId: existing.id } });
  } else {
    const created = await tx.competitor.create({
      data: { ...data, classId, externalId: cmp.id },
      select: { id: true },
    });
    competitorId = created.id;
  }

  if (cmp.radio.length > 0) {
    await tx.split.createMany({
      data: cmp.radio.map((s) => ({
        competitorId,
        controlCode: s.controlCode,
        time: s.time,
      })),
    });
  }
}

export async function upsertMeosTeam(
  tx: PrismaTx,
  eventId: string,
  tm: MopTeam,
  classIdMap: Map<string, number>,
  orgIdMap: Map<string, number>,
): Promise<void> {
  if (!tm.classId) return;
  const classId = classIdMap.get(tm.classId);
  if (classId === undefined) return;

  const orgId = tm.orgId !== null ? (orgIdMap.get(tm.orgId) ?? null) : null;
  const data = {
    name: tm.name,
    bibNumber: tm.bibNumber,
    organisationId: orgId,
  };

  const existing = await tx.team.findUnique({
    where: { classId_externalId: { classId, externalId: tm.id } },
    select: { id: true },
  });

  if (existing) {
    await tx.team.update({ where: { id: existing.id }, data });
  } else {
    await tx.team.create({ data: { ...data, classId, externalId: tm.id } });
  }
}

export async function deleteMeosCompetitor(
  tx: PrismaTx,
  eventId: string,
  meosId: string,
): Promise<void> {
  const classes = await tx.class.findMany({ where: { eventId }, select: { id: true } });
  const classIds = classes.map((c) => c.id);
  if (classIds.length === 0) return;

  const competitor = await tx.competitor.findFirst({
    where: { classId: { in: classIds }, externalId: meosId },
    select: { id: true },
  });
  if (!competitor) return;

  await tx.split.deleteMany({ where: { competitorId: competitor.id } });
  await tx.protocol.deleteMany({ where: { competitorId: competitor.id } });
  await tx.competitor.delete({ where: { id: competitor.id } });
}

export async function deleteMeosOrg(
  tx: PrismaTx,
  eventId: string,
  meosId: string,
): Promise<void> {
  const existing = await tx.organisation.findUnique({
    where: { eventId_externalId: { eventId, externalId: meosId } },
    select: { id: true },
  });
  if (!existing) return;
  await tx.organisation.delete({ where: { id: existing.id } });
}

export async function deleteMeosClass(
  tx: PrismaTx,
  eventId: string,
  meosId: string,
): Promise<void> {
  const cls = await tx.class.findFirst({
    where: { eventId, externalId: meosId },
    select: { id: true },
  });
  if (!cls) return;

  const competitors = await tx.competitor.findMany({
    where: { classId: cls.id },
    select: { id: true },
  });
  const competitorIds = competitors.map((c) => c.id);

  if (competitorIds.length > 0) {
    await tx.split.deleteMany({ where: { competitorId: { in: competitorIds } } });
    await tx.protocol.deleteMany({ where: { competitorId: { in: competitorIds } } });
    await tx.competitor.deleteMany({ where: { classId: cls.id } });
  }
  await tx.team.deleteMany({ where: { classId: cls.id } });
  await tx.class.delete({ where: { id: cls.id } });
}

export async function deleteMeosTeam(
  tx: PrismaTx,
  eventId: string,
  meosId: string,
): Promise<void> {
  const classes = await tx.class.findMany({ where: { eventId }, select: { id: true } });
  const classIds = classes.map((c) => c.id);
  if (classIds.length === 0) return;

  const team = await tx.team.findFirst({
    where: { classId: { in: classIds }, externalId: meosId },
    select: { id: true },
  });
  if (!team) return;

  await tx.team.delete({ where: { id: team.id } });
}

export async function processMopDocument(
  eventId: string,
  doc: MopDocument,
  event: { date: Date; timezone: string },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    if (doc.rootType === 'MOPComplete') {
      await resetEventData(tx, eventId);
    }

    // Upsert / delete orgs; build id map
    const orgIdMap = new Map<string, number>();
    for (const org of doc.orgs) {
      if (org.delete) {
        await deleteMeosOrg(tx, eventId, org.id);
      } else {
        const dbId = await upsertMeosOrg(tx, eventId, org);
        orgIdMap.set(org.id, dbId);
      }
    }

    // Upsert / delete classes; build id map
    const classIdMap = new Map<string, number>();
    for (const cls of doc.classes) {
      if (cls.delete) {
        await deleteMeosClass(tx, eventId, cls.id);
      } else {
        const dbId = await upsertMeosClass(tx, eventId, cls);
        classIdMap.set(cls.id, dbId);
      }
    }

    // For MOPDiff: load existing classes/orgs not present in this diff
    if (doc.rootType === 'MOPDiff') {
      const existingClasses = await tx.class.findMany({
        where: { eventId },
        select: { id: true, externalId: true },
      });
      for (const c of existingClasses) {
        if (c.externalId && !classIdMap.has(c.externalId)) {
          classIdMap.set(c.externalId, c.id);
        }
      }
      const existingOrgs = await tx.organisation.findMany({
        where: { eventId },
        select: { id: true, externalId: true },
      });
      for (const o of existingOrgs) {
        if (o.externalId && !orgIdMap.has(o.externalId)) {
          orgIdMap.set(o.externalId, o.id);
        }
      }
    }

    for (const cmp of doc.competitors) {
      if (cmp.delete) {
        await deleteMeosCompetitor(tx, eventId, cmp.id);
      } else {
        await upsertMeosCompetitor(tx, eventId, cmp, orgIdMap, classIdMap, event);
      }
    }

    for (const tm of doc.teams) {
      if (tm.delete) {
        await deleteMeosTeam(tx, eventId, tm.id);
      } else {
        await upsertMeosTeam(tx, eventId, tm, classIdMap, orgIdMap);
      }
    }
  });
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
pnpm --filter ./apps/server test src/modules/meos/__tests__/meos.service.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/meos/meos.service.ts \
        apps/server/src/modules/meos/__tests__/meos.service.test.ts
git commit -m "feat(meos): add MeOS DB service with reset, upsert and delete operations"
```

---

## Task 4: Handler, Routes & Module (TDD)

**Files:**
- Create: `apps/server/src/modules/meos/__tests__/meos.handlers.test.ts`
- Create: `apps/server/src/modules/meos/meos.handlers.ts`
- Create: `apps/server/src/modules/meos/meos.routes.ts`
- Create: `apps/server/src/modules/meos/meos.openapi.ts`
- Create: `apps/server/src/modules/meos/index.ts`

- [ ] **Step 1: Write the failing handler tests**

Create `apps/server/src/modules/meos/__tests__/meos.handlers.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRouter } from '../../../lib/create-app.js';
import { registerMeosRoutes } from '../meos.routes.js';

// Hoisted mocks must be defined before any import that triggers the module
const mockPrisma = vi.hoisted(() => ({
  eventMeosBinding: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  eventPassword: {
    findUnique: vi.fn(),
  },
  eventImportState: {
    upsert: vi.fn(),
    findFirst: vi.fn(),
  },
  event: {
    findUnique: vi.fn(),
  },
}));

vi.mock('@/utils/context.js', () => ({ default: mockPrisma }));
vi.mock('../meos.service.js', () => ({
  processMopDocument: vi.fn(),
}));
vi.mock('@/lib/crypto/encryption.js', () => ({
  decrypt: vi.fn(),
  decodeBase64: vi.fn(),
}));

// Import mocked modules after vi.mock declarations
const { processMopDocument } = await import('../meos.service.js');
const { decrypt, decodeBase64 } = await import('@/lib/crypto/encryption.js');

const VALID_BINDING = {
  id: 1,
  eventId: 'event-abc',
  meosCompetitionId: 1001,
  isActive: true,
  lastUploadAt: null,
  event: { date: new Date('2026-05-10T00:00:00.000Z'), timezone: 'Europe/Prague' },
};

const VALID_COMPLETE_XML = `<?xml version="1.0" encoding="utf-8"?>
<MOPComplete xmlns="http://www.melin.nu/mop">
  <competition date="2026-05-10">Test</competition>
</MOPComplete>`;

const VALID_DIFF_XML = `<?xml version="1.0" encoding="utf-8"?>
<MOPDiff xmlns="http://www.melin.nu/mop">
</MOPDiff>`;

function makeApp() {
  const router = createRouter();
  registerMeosRoutes(router);
  return router;
}

function mopRequest(
  body: string,
  headers: Record<string, string> = {},
) {
  return new Request('http://localhost/meos', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', ...headers },
    body,
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('POST /meos', () => {
  it('returns BADCMP when competition header is missing', async () => {
    const app = makeApp();
    const res = await app.request(mopRequest(VALID_COMPLETE_XML));
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).toContain('status="BADCMP"');
    expect(res.headers.get('content-type')).toContain('text/xml');
  });

  it('returns BADCMP when competition header is not a valid integer', async () => {
    const app = makeApp();
    const res = await app.request(mopRequest(VALID_COMPLETE_XML, { competition: 'abc' }));
    expect(await res.text()).toContain('status="BADCMP"');
  });

  it('returns BADCMP when no active binding is found', async () => {
    mockPrisma.eventMeosBinding.findUnique.mockResolvedValueOnce(null);
    const app = makeApp();
    const res = await app.request(mopRequest(VALID_COMPLETE_XML, { competition: '9999' }));
    expect(await res.text()).toContain('status="BADCMP"');
  });

  it('returns BADCMP when binding is inactive', async () => {
    mockPrisma.eventMeosBinding.findUnique.mockResolvedValueOnce({
      ...VALID_BINDING,
      isActive: false,
    });
    const app = makeApp();
    const res = await app.request(mopRequest(VALID_COMPLETE_XML, { competition: '1001' }));
    expect(await res.text()).toContain('status="BADCMP"');
  });

  it('returns BADPWD when EventPassword exists and pwd does not match', async () => {
    mockPrisma.eventMeosBinding.findUnique.mockResolvedValueOnce(VALID_BINDING);
    mockPrisma.eventPassword.findUnique.mockResolvedValueOnce({
      password: 'encrypted',
      expiresAt: new Date(Date.now() + 86400000),
    });
    vi.mocked(decodeBase64).mockReturnValueOnce({ iv: 'x', content: 'y' } as any);
    vi.mocked(decrypt).mockReturnValueOnce('correct-password');

    const app = makeApp();
    const res = await app.request(
      mopRequest(VALID_COMPLETE_XML, { competition: '1001', pwd: 'wrong-password' }),
    );
    expect(await res.text()).toContain('status="BADPWD"');
  });

  it('returns BADPWD when no EventPassword is configured', async () => {
    mockPrisma.eventMeosBinding.findUnique.mockResolvedValueOnce(VALID_BINDING);
    mockPrisma.eventPassword.findUnique.mockResolvedValueOnce(null);
    mockPrisma.eventMeosBinding.update.mockResolvedValueOnce({});
    mockPrisma.eventImportState.upsert.mockResolvedValueOnce({});
    vi.mocked(processMopDocument).mockResolvedValueOnce(undefined);

    const app = makeApp();
    const res = await app.request(
      mopRequest(VALID_COMPLETE_XML, { competition: '1001', pwd: 'secret' }),
    );
    expect(await res.text()).toContain('status="BADPWD"');
  });

  it('returns OK when pwd matches EventPassword', async () => {
    mockPrisma.eventMeosBinding.findUnique.mockResolvedValueOnce(VALID_BINDING);
    mockPrisma.eventPassword.findUnique.mockResolvedValueOnce({
      password: 'encrypted',
      expiresAt: new Date(Date.now() + 86400000),
    });
    vi.mocked(decodeBase64).mockReturnValueOnce({ iv: 'x', content: 'y' } as any);
    vi.mocked(decrypt).mockReturnValueOnce('secret');
    mockPrisma.eventMeosBinding.update.mockResolvedValueOnce({});
    mockPrisma.eventImportState.upsert.mockResolvedValueOnce({});
    vi.mocked(processMopDocument).mockResolvedValueOnce(undefined);

    const app = makeApp();
    const res = await app.request(
      mopRequest(VALID_COMPLETE_XML, { competition: '1001', pwd: 'secret' }),
    );
    expect(await res.text()).toContain('status="OK"');
  });

  it('returns NOZIP when body starts with PK', async () => {
    const app = makeApp();
    const res = await app.request(
      mopRequest('PK\x03\x04some zip content', { competition: '1001' }),
    );
    expect(await res.text()).toContain('status="NOZIP"');
  });

  it('returns ERROR for invalid XML', async () => {
    mockPrisma.eventMeosBinding.findUnique.mockResolvedValueOnce(VALID_BINDING);
    mockPrisma.eventPassword.findUnique.mockResolvedValueOnce(null);

    const app = makeApp();
    const res = await app.request(
      mopRequest('<broken xml', { competition: '1001' }),
    );
    expect(await res.text()).toContain('status="ERROR"');
  });

  it('returns ERROR for unsupported root element', async () => {
    mockPrisma.eventMeosBinding.findUnique.mockResolvedValueOnce(VALID_BINDING);
    mockPrisma.eventPassword.findUnique.mockResolvedValueOnce(null);

    const app = makeApp();
    const res = await app.request(
      mopRequest('<MOPUnknown></MOPUnknown>', { competition: '1001' }),
    );
    expect(await res.text()).toContain('status="ERROR"');
  });

  it('returns ERROR when processMopDocument throws', async () => {
    mockPrisma.eventMeosBinding.findUnique.mockResolvedValueOnce(VALID_BINDING);
    mockPrisma.eventPassword.findUnique.mockResolvedValueOnce(null);
    vi.mocked(processMopDocument).mockRejectedValueOnce(new Error('DB failure'));

    const app = makeApp();
    const res = await app.request(
      mopRequest(VALID_COMPLETE_XML, { competition: '1001' }),
    );
    expect(await res.text()).toContain('status="ERROR"');
  });

  it('returns OK for MOPDiff', async () => {
    mockPrisma.eventMeosBinding.findUnique.mockResolvedValueOnce(VALID_BINDING);
    mockPrisma.eventPassword.findUnique.mockResolvedValueOnce(null);
    mockPrisma.eventMeosBinding.update.mockResolvedValueOnce({});
    mockPrisma.eventImportState.upsert.mockResolvedValueOnce({});
    vi.mocked(processMopDocument).mockResolvedValueOnce(undefined);

    const app = makeApp();
    const res = await app.request(mopRequest(VALID_DIFF_XML, { competition: '1001' }));
    expect(await res.text()).toContain('status="OK"');
  });

  it('returns ERROR for body exceeding size limit', async () => {
    mockPrisma.eventMeosBinding.findUnique.mockResolvedValueOnce(VALID_BINDING);
    mockPrisma.eventPassword.findUnique.mockResolvedValueOnce(null);

    const hugeBody = 'x'.repeat(11 * 1024 * 1024); // 11 MB
    const app = makeApp();
    const res = await app.request(mopRequest(hugeBody, { competition: '1001' }));
    expect(await res.text()).toContain('status="ERROR"');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter ./apps/server test src/modules/meos/__tests__/meos.handlers.test.ts
```

Expected: FAIL — `Cannot find module '../meos.routes.js'`.

- [ ] **Step 3: Create `meos.openapi.ts`**

Create `apps/server/src/modules/meos/meos.openapi.ts`:

```typescript
import { API_DEFAULTS } from '../../constants/index.js';
import type { OpenApiOperation, OpenApiPathItem } from '../../config/openapi.types.js';

export const MEOS_OPENAPI = {
  tag: 'Upload',
  basePath: `${API_DEFAULTS.BASE_PATH}/upload`,
} as const;

const meopBase = MEOS_OPENAPI.basePath;

export const MEOS_OPENAPI_PATHS: Record<string, OpenApiPathItem> = {
  [`${meopBase}/meos`]: {
    post: {
      tags: [MEOS_OPENAPI.tag],
      operationId: 'uploadMeosMop',
      summary: 'Receive MeOS Online Protocol (MOP) upload',
      description:
        'Accepts MOPComplete or MOPDiff XML from MeOS timing software. ' +
        'Always returns HTTP 200 with a MOP XML status body.',
      security: [] as NonNullable<OpenApiOperation['security']>,
      parameters: [
        {
          in: 'header',
          name: 'competition',
          required: true,
          schema: { type: 'integer' },
          description: 'MeOS integer competition ID',
        },
        {
          in: 'header',
          name: 'pwd',
          required: true,
          schema: { type: 'string' },
          description: 'MeOS upload password matching an active EventPassword',
        },
      ],
      requestBody: {
        required: true,
        content: {
          'text/plain': {
            schema: { type: 'string', description: 'MOP XML payload (MOPComplete or MOPDiff)' },
          },
        },
      },
      responses: {
        200: {
          description: 'MOP status response (always HTTP 200)',
          content: {
            'text/xml': {
              schema: { type: 'string' },
              example: '<?xml version="1.0"?><MOPStatus status="OK"></MOPStatus>',
            },
          },
        },
      },
    },
  },
};
```

- [ ] **Step 4: Create `meos.handlers.ts`**

Create `apps/server/src/modules/meos/meos.handlers.ts`:

```typescript
import { createHash } from 'node:crypto';

import { decrypt, decodeBase64 } from '../../lib/crypto/encryption.js';
import { upsertImportState } from '../upload/upload.import-state.js';
import { ImportSourceType } from '../../generated/prisma/enums.js';
import type { AppOpenAPI } from '../../types/index.js';
import prisma from '../../utils/context.js';
import { parseMopDocument } from './meos.parser.js';
import { processMopDocument } from './meos.service.js';

const MEOS_MAX_BODY_BYTES = 10 * 1024 * 1024; // 10 MB

const MOP_RESPONSES = {
  OK: '<?xml version="1.0"?><MOPStatus status="OK"></MOPStatus>',
  BADCMP: '<?xml version="1.0"?><MOPStatus status="BADCMP"></MOPStatus>',
  BADPWD: '<?xml version="1.0"?><MOPStatus status="BADPWD"></MOPStatus>',
  NOZIP: '<?xml version="1.0"?><MOPStatus status="NOZIP"></MOPStatus>',
  ERROR: '<?xml version="1.0"?><MOPStatus status="ERROR"></MOPStatus>',
} as const;

type MopStatusCode = keyof typeof MOP_RESPONSES;

function mopResponse(status: MopStatusCode): Response {
  return new Response(MOP_RESPONSES[status], {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}

export function registerMeosHandler(router: AppOpenAPI): void {
  router.post('/meos', async (c) => {
    let logger: { info: Function; warn: Function; error: Function } | undefined;
    try {
      logger = c.get('logger');
    } catch {
      // no-op — logger may not be available in tests
    }

    // 1. Read body
    const rawBody = await c.req.text();

    // 2. Size guard
    if (rawBody.length > MEOS_MAX_BODY_BYTES) {
      logger?.warn('MeOS upload rejected: body too large', {
        stage: 'size-guard',
        payloadSizeBytes: rawBody.length,
      });
      return mopResponse('ERROR');
    }

    // 3. ZIP check (before competition header — MeOS still sends competition header with ZIPs)
    if (rawBody.startsWith('PK')) {
      logger?.warn('MeOS upload rejected: ZIP payload not supported', { stage: 'zip-check' });
      return mopResponse('NOZIP');
    }

    // 4. competition header
    const competitionHeader = c.req.header('competition');
    const competitionId = competitionHeader ? parseInt(competitionHeader, 10) : NaN;
    if (!competitionHeader || isNaN(competitionId) || competitionId <= 0) {
      logger?.warn('MeOS upload rejected: invalid competition header', {
        stage: 'competition-header',
        competitionHeader,
      });
      return mopResponse('BADCMP');
    }

    // 5. Binding lookup
    const binding = await prisma.eventMeosBinding.findUnique({
      where: { meosCompetitionId: competitionId },
      include: { event: { select: { date: true, timezone: true } } },
    });

    if (!binding || !binding.isActive) {
      logger?.warn('MeOS upload rejected: no active binding', {
        stage: 'binding-lookup',
        meosCompetitionId: competitionId,
      });
      return mopResponse('BADCMP');
    }

    const { eventId } = binding;

    // 6. Password check
    const eventPassword = await prisma.eventPassword.findUnique({
      where: { eventId },
      select: { password: true, expiresAt: true },
    });

    if (eventPassword && new Date(eventPassword.expiresAt) > new Date()) {
      let decryptedPassword: string;
      try {
        decryptedPassword = decrypt(decodeBase64(eventPassword.password));
      } catch (err) {
        logger?.error('MeOS upload: failed to decrypt event password', {
          stage: 'password-decrypt',
          eventId,
          reason: err instanceof Error ? err.message : 'unknown',
        });
        return mopResponse('ERROR');
      }

      const pwdHeader = c.req.header('pwd') ?? '';
      if (pwdHeader !== decryptedPassword) {
        logger?.warn('MeOS upload rejected: wrong password', {
          stage: 'password-check',
          meosCompetitionId: competitionId,
          eventId,
        });
        return mopResponse('BADPWD');
      }
    }

    // 7. Parse XML
    const doc = parseMopDocument(rawBody);
    if (!doc) {
      logger?.warn('MeOS upload rejected: invalid or unsupported XML', {
        stage: 'xml-parse',
        meosCompetitionId: competitionId,
        eventId,
      });
      return mopResponse('ERROR');
    }

    // 8. Process
    try {
      await processMopDocument(eventId, doc, {
        date: binding.event.date,
        timezone: binding.event.timezone,
      });
    } catch (err) {
      logger?.error('MeOS upload failed during processing', {
        stage: 'processing',
        meosCompetitionId: competitionId,
        eventId,
        rootElement: doc.rootType,
        reason: err instanceof Error ? err.message : 'unknown',
      });
      return mopResponse('ERROR');
    }

    // 9. Record import state
    const rawHash = createHash('sha256').update(rawBody).digest('hex');
    await upsertImportState(eventId, ImportSourceType.MEOS, {
      payloadType: doc.rootType,
      rawHash,
      rootElement: doc.rootType,
    }).catch((err) => {
      logger?.error('MeOS upload: failed to persist import state', {
        stage: 'import-state',
        eventId,
        reason: err instanceof Error ? err.message : 'unknown',
      });
    });

    // 10. Update lastUploadAt
    await prisma.eventMeosBinding
      .update({ where: { id: binding.id }, data: { lastUploadAt: new Date() } })
      .catch(() => {
        // non-critical
      });

    logger?.info('MeOS upload completed', {
      stage: 'completed',
      meosCompetitionId: competitionId,
      eventId,
      rootElement: doc.rootType,
      payloadSizeBytes: rawBody.length,
    });

    return mopResponse('OK');
  });
}
```

- [ ] **Step 5: Create `meos.routes.ts`**

Create `apps/server/src/modules/meos/meos.routes.ts`:

```typescript
import { createRouter } from '../../lib/create-app.js';
import { registerMeosHandler } from './meos.handlers.js';

export function registerMeosRoutes(router: ReturnType<typeof createRouter>): void {
  registerMeosHandler(router);
}

const router = createRouter();
registerMeosRoutes(router);

export default router;
```

- [ ] **Step 6: Create `index.ts`**

Create `apps/server/src/modules/meos/index.ts`:

```typescript
export { default } from './meos.routes.js';
```

- [ ] **Step 7: Run tests and confirm they pass**

```bash
pnpm --filter ./apps/server test src/modules/meos/__tests__/meos.handlers.test.ts
```

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/modules/meos/meos.openapi.ts \
        apps/server/src/modules/meos/meos.handlers.ts \
        apps/server/src/modules/meos/meos.routes.ts \
        apps/server/src/modules/meos/index.ts \
        apps/server/src/modules/meos/__tests__/meos.handlers.test.ts
git commit -m "feat(meos): add MeOS MOP endpoint handler and routes"
```

---

## Task 5: Route Registration & OpenAPI Docs

**Files:**
- Modify: `apps/server/src/routes/rest/paths.ts`
- Modify: `apps/server/src/routes/rest/registry.ts`
- Modify: `apps/server/src/config/openapi.paths.ts`

- [ ] **Step 1: Add meos path constant to `paths.ts`**

In `apps/server/src/routes/rest/paths.ts`, add the meos import and path entry:

```typescript
import { ADMIN_OPENAPI } from '../../modules/admin/admin.openapi.js';
import { AUTH_OPENAPI } from '../../modules/auth/auth.openapi.js';
import { EVENT_OPENAPI } from '../../modules/event/event.openapi.js';
import { MAP_OPENAPI } from '../../modules/map/map.openapi.js';
import { MEOS_OPENAPI } from '../../modules/meos/meos.openapi.js';
import { UPLOAD_OPENAPI } from '../../modules/upload/upload.openapi.js';
import { USER_OPENAPI } from '../../modules/user/user.openapi.js';

export const REST_ROUTE_PATHS = {
  admin: ADMIN_OPENAPI.basePath,
  auth: AUTH_OPENAPI.basePath,
  events: EVENT_OPENAPI.basePath,
  map: MAP_OPENAPI.basePath,
  meos: MEOS_OPENAPI.basePath,
  upload: UPLOAD_OPENAPI.basePath,
  myEvents: USER_OPENAPI.basePath,
} as const;
```

- [ ] **Step 2: Register the meos router in `registry.ts`**

In `apps/server/src/routes/rest/registry.ts`, add the meos import and registry entry:

```typescript
import adminRouter from '../../modules/admin/index.js';
import authRouter from '../../modules/auth/index.js';
import eventRouter from '../../modules/event/index.js';
import mapRouter from '../../modules/map/index.js';
import meosRouter from '../../modules/meos/index.js';
import uploadRouter from '../../modules/upload/index.js';
import userRouter from '../../modules/user/index.js';

import { REST_ROUTE_PATHS } from './paths.js';

export const REST_ROUTE_REGISTRY = [
  { path: REST_ROUTE_PATHS.admin, router: adminRouter },
  { path: REST_ROUTE_PATHS.auth, router: authRouter },
  { path: REST_ROUTE_PATHS.events, router: eventRouter },
  { path: REST_ROUTE_PATHS.map, router: mapRouter },
  { path: REST_ROUTE_PATHS.meos, router: meosRouter },
  { path: REST_ROUTE_PATHS.upload, router: uploadRouter },
  { path: REST_ROUTE_PATHS.myEvents, router: userRouter },
] as const;
```

- [ ] **Step 3: Add `MEOS_OPENAPI_PATHS` to `openapi.paths.ts`**

In `apps/server/src/config/openapi.paths.ts`, add the import and spread:

```typescript
import { ADMIN_OPENAPI, ADMIN_OPENAPI_PATHS } from '../modules/admin/admin.openapi.js';
import { AUTH_OPENAPI, AUTH_OPENAPI_PATHS } from '../modules/auth/auth.openapi.js';
import { EVENT_OPENAPI, EVENT_OPENAPI_PATHS } from '../modules/event/event.openapi.js';
import { MAP_OPENAPI, MAP_OPENAPI_PATHS } from '../modules/map/map.openapi.js';
import { GRAPHQL_OPENAPI, GRAPHQL_OPENAPI_PATHS } from '../modules/graphql/graphql.openapi.js';
import { MEOS_OPENAPI_PATHS } from '../modules/meos/meos.openapi.js';
import { UPLOAD_OPENAPI, UPLOAD_OPENAPI_PATHS } from '../modules/upload/upload.openapi.js';
import { USER_OPENAPI, USER_OPENAPI_PATHS } from '../modules/user/user.openapi.js';
import { okJson, okText } from './openapi.helpers.js';
import type { OpenApiPathItem } from './openapi.types.js';

export const OPENAPI_TAGS = [
  { name: 'Index', description: 'Service meta endpoints' },
  { name: 'Health', description: 'Health and readiness endpoints' },
  { name: 'Monitoring', description: 'Monitoring and metrics endpoints' },
  { name: GRAPHQL_OPENAPI.tag, description: 'GraphQL HTTP endpoint' },
  { name: ADMIN_OPENAPI.tag, description: 'Admin zone endpoints' },
  { name: AUTH_OPENAPI.tag, description: 'Authentication and OAuth2 endpoints' },
  {
    name: EVENT_OPENAPI.tag,
    description: 'Events and competitor management endpoints',
  },
  { name: MAP_OPENAPI.tag, description: 'Map tile proxy endpoints' },
  { name: UPLOAD_OPENAPI.tag, description: 'Upload and import endpoints' },
  { name: USER_OPENAPI.tag, description: 'User scoped endpoints' },
] as const;

export const OPENAPI_PATHS: Record<string, OpenApiPathItem> = {
  '/doc': {
    get: {
      tags: ['Index'],
      operationId: 'openapiDoc',
      summary: 'OpenAPI JSON document',
      security: [],
      responses: {
        200: okJson('OpenAPI document', 'object'),
      },
    },
  },
  '/reference': {
    get: {
      tags: ['Index'],
      operationId: 'openapiReference',
      summary: 'API reference UI',
      security: [],
      responses: {
        200: okText('Scalar API reference'),
      },
    },
  },
  ...GRAPHQL_OPENAPI_PATHS,
  ...ADMIN_OPENAPI_PATHS,
  ...AUTH_OPENAPI_PATHS,
  ...EVENT_OPENAPI_PATHS,
  ...MAP_OPENAPI_PATHS,
  ...MEOS_OPENAPI_PATHS,
  ...UPLOAD_OPENAPI_PATHS,
  ...USER_OPENAPI_PATHS,
};
```

- [ ] **Step 4: Verify type-check passes**

```bash
pnpm --filter ./apps/server type-check
```

Expected: no errors.

- [ ] **Step 5: Run the full test suite**

```bash
pnpm --filter ./apps/server test
```

Expected: all tests PASS including existing upload tests.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routes/rest/paths.ts \
        apps/server/src/routes/rest/registry.ts \
        apps/server/src/config/openapi.paths.ts
git commit -m "feat(meos): register MeOS module in REST router and OpenAPI docs"
```

---

## Self-Review Checklist

- [x] Spec §1 (EventMeosBinding model) → Task 1
- [x] Spec §1 (ImportSourceType MEOS) → Task 1
- [x] Spec §1 (EventImportState reuse) → Task 4 handler (upsertImportState call)
- [x] Spec §2 (module structure) → Task 4
- [x] Spec §3.1 pipeline (size guard, ZIP, competition header, binding, password, parse, process, import state, lastUploadAt) → Task 4 handler
- [x] Spec §3.2 MOPComplete full reset → Task 3 resetEventData
- [x] Spec §3.3 MOPDiff incremental → Task 3 processMopDocument
- [x] Spec §3.3 delete="true" → Task 3 delete functions
- [x] Spec §4.1 @xmldom/xmldom, no XXE → Task 2 meos.parser.ts (DOMParser, no external entities)
- [x] Spec §4.2 competitor field mapping (stat, time conversion, splits) → Task 2 + Task 3
- [x] Spec §4.3 stat map → Task 2 mapMopStat
- [x] Spec §5 MOP responses (OK/BADCMP/BADPWD/NOZIP/ERROR, always HTTP 200, text/xml) → Task 4
- [x] Spec §6 tests (all scenarios covered) → Task 2, 3, 4 tests
- [x] Spec §7 Team.bibNumber defaults to 0 → Task 2 parser + Task 3 upsertMeosTeam
- [x] Spec §7 Split deletion before Competitor → Task 3 (deleteMeosCompetitor, deleteMeosClass, resetEventData)
- [x] Pino logging (never logs passwords or raw body) → Task 4 handler
- [x] EventPassword decrypt-and-compare (not argon2) → Task 4 handler uses `decrypt(decodeBase64(...))`
