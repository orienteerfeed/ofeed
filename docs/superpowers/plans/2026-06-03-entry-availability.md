# Entry Availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose a public `GET /rest/v1/events/{eventId}/entry-availability` REST endpoint and a `eventEntryAvailability` GraphQL query that return per-class vacant start slots, available capacity, and computed entry fee for an event — covering new entries, late entries, and competitor slot-change scenarios.

**Architecture:** A pure function `computeClassCapacity` (no DB, fully unit-testable) composes with the existing `computeClassFee` pure function. A service function `listEventEntryAvailability` in `start-slot-vacancy.service.ts` executes one Prisma query and calls both pure functions; both the REST handler and GraphQL resolver call this same service. The REST route is public (no auth). The GraphQL query uses dedicated `objectRef` types (not `ClassRef`) so the shape is independent.

**Tech Stack:** Hono, Prisma 7, Pothos GraphQL, Vitest, `@repo/shared` (`resolveEffectiveStartMode`).

---

## File Map

| Action | File | Responsibility |
| --- | --- | --- |
| Create | `apps/server/src/modules/class/class.capacity.ts` | Pure function `computeClassCapacity` |
| Create | `apps/server/src/modules/class/__tests__/class.capacity.test.ts` | Unit tests for pure function |
| Modify | `apps/server/src/modules/start-slot-vacancy/start-slot-vacancy.service.ts` | Add types + `listEventEntryAvailability` |
| Create | `apps/server/src/modules/start-slot-vacancy/__tests__/entry-availability.service.test.ts` | Service unit tests |
| Modify | `apps/server/src/modules/event/event.public.handlers.ts` | REST handler for `/:eventId/entry-availability` |
| Create | `apps/server/src/modules/event/__tests__/entry-availability.handler.test.ts` | REST handler test |
| Modify | `apps/server/src/modules/event/event.openapi.ts` | OpenAPI spec for new endpoint |
| Modify | `apps/server/postman/collection.json` | 2 Postman scenarios in folder `09` |
| Create | `apps/server/src/modules/start-slot-vacancy/start-slot-vacancy.graphql.ts` | GraphQL types + `eventEntryAvailability` query |
| Modify | `apps/server/src/graphql/schema.ts` | Side-effect import of new graphql module |
| Modify | `apps/server/src/graphql/__tests__/schema.test.ts` | Add `eventEntryAvailability` to query field list |
| Modify | `apps/server/src/graphql/__tests__/__snapshots__/schema.test.ts.snap` | Regenerated snapshot |

---

## Task 1: Pure function `computeClassCapacity`

**Files:**
- Create: `apps/server/src/modules/class/class.capacity.ts`
- Create: `apps/server/src/modules/class/__tests__/class.capacity.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/modules/class/__tests__/class.capacity.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { computeClassCapacity } from '../class.capacity.js';

describe('computeClassCapacity — FreeStart mode', () => {
  it('returns max minus live count when max is set', () => {
    expect(
      computeClassCapacity({
        effectiveStartMode: 'FreeStart',
        maxNumberOfCompetitors: 50,
        competitorCount: 17,
        vacancyCount: 0,
      }),
    ).toEqual({ availableCount: 33, capacityMode: 'FreeStart', isFull: false });
  });

  it('returns 0 when max is null (no cap configured)', () => {
    expect(
      computeClassCapacity({
        effectiveStartMode: 'FreeStart',
        maxNumberOfCompetitors: null,
        competitorCount: 5,
        vacancyCount: 0,
      }),
    ).toEqual({ availableCount: 0, capacityMode: 'FreeStart', isFull: true });
  });

  it('clamps to 0 when competitors exceed max', () => {
    expect(
      computeClassCapacity({
        effectiveStartMode: 'FreeStart',
        maxNumberOfCompetitors: 10,
        competitorCount: 12,
        vacancyCount: 0,
      }),
    ).toEqual({ availableCount: 0, capacityMode: 'FreeStart', isFull: true });
  });

  it('is full when max equals competitor count', () => {
    const result = computeClassCapacity({
      effectiveStartMode: 'FreeStart',
      maxNumberOfCompetitors: 20,
      competitorCount: 20,
      vacancyCount: 0,
    });
    expect(result.isFull).toBe(true);
    expect(result.availableCount).toBe(0);
  });
});

describe('computeClassCapacity — StartSlot mode', () => {
  it('returns vacancy count regardless of max', () => {
    expect(
      computeClassCapacity({
        effectiveStartMode: 'StartList',
        maxNumberOfCompetitors: 100,
        competitorCount: 10,
        vacancyCount: 7,
      }),
    ).toEqual({ availableCount: 7, capacityMode: 'StartSlot', isFull: false });
  });

  it('is full when vacancyCount is 0', () => {
    expect(
      computeClassCapacity({
        effectiveStartMode: 'MassStart',
        maxNumberOfCompetitors: null,
        competitorCount: 30,
        vacancyCount: 0,
      }),
    ).toEqual({ availableCount: 0, capacityMode: 'StartSlot', isFull: true });
  });

  it('uses vacancyCount, not max - competitorCount', () => {
    const result = computeClassCapacity({
      effectiveStartMode: 'WaveStart',
      maxNumberOfCompetitors: 50,
      competitorCount: 20,
      vacancyCount: 4,
    });
    expect(result.availableCount).toBe(4);
    expect(result.capacityMode).toBe('StartSlot');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter ./apps/server test -- --reporter=verbose --testPathPattern="class.capacity"
```

Expected: FAIL — `Cannot find module '../class.capacity.js'`

- [ ] **Step 3: Implement `computeClassCapacity`**

Create `apps/server/src/modules/class/class.capacity.ts`:

```typescript
export type CapacityMode = 'FreeStart' | 'StartSlot';

export interface ComputeClassCapacityInput {
  effectiveStartMode: string;
  maxNumberOfCompetitors: number | null;
  competitorCount: number;
  vacancyCount: number;
}

export interface ComputedClassCapacity {
  availableCount: number;
  capacityMode: CapacityMode;
  isFull: boolean;
}

export function computeClassCapacity(input: ComputeClassCapacityInput): ComputedClassCapacity {
  const { effectiveStartMode, maxNumberOfCompetitors, competitorCount, vacancyCount } = input;

  if (effectiveStartMode === 'FreeStart') {
    const availableCount =
      maxNumberOfCompetitors !== null
        ? Math.max(0, maxNumberOfCompetitors - competitorCount)
        : 0;
    return { availableCount, capacityMode: 'FreeStart', isFull: availableCount === 0 };
  }

  return { availableCount: vacancyCount, capacityMode: 'StartSlot', isFull: vacancyCount === 0 };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter ./apps/server test -- --reporter=verbose --testPathPattern="class.capacity"
```

Expected: 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/class/class.capacity.ts \
        apps/server/src/modules/class/__tests__/class.capacity.test.ts
git commit -m "feat(server): add computeClassCapacity pure function"
```

---

## Task 2: Service `listEventEntryAvailability`

**Files:**
- Modify: `apps/server/src/modules/start-slot-vacancy/start-slot-vacancy.service.ts`
- Create: `apps/server/src/modules/start-slot-vacancy/__tests__/entry-availability.service.test.ts`

- [ ] **Step 1: Write the failing service test**

Create `apps/server/src/modules/start-slot-vacancy/__tests__/entry-availability.service.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';

import { listEventEntryAvailability } from '../start-slot-vacancy.service.js';

const DEADLINE = new Date('2026-06-10T23:59:59.000Z');
const NOW_BEFORE = new Date('2026-06-01T10:00:00.000Z');

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    entriesOpenAt: new Date('2026-05-01T00:00:00.000Z'),
    entriesCloseAt: DEADLINE,
    defaultStartMode: 'StartList',
    vatPayer: false,
    vatRate: null,
    lateEntryFeePercent: null,
    currency: { iso4217Alpha3: 'CZK', name: 'Czech koruna' },
    classes: [],
    ...overrides,
  };
}

function makeClass(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    name: 'H21E',
    sex: 'M',
    minAge: null,
    maxAge: null,
    maxNumberOfCompetitors: 100,
    startMode: null,
    fee: null,
    startSlotVacancies: [],
    _count: { competitors: 0 },
    ...overrides,
  };
}

describe('listEventEntryAvailability', () => {
  it('returns null when event does not exist', async () => {
    const prisma = { event: { findUnique: vi.fn().mockResolvedValue(null) } };
    await expect(
      listEventEntryAvailability(prisma as never, 'missing-id'),
    ).resolves.toBeNull();
  });

  it('maps event-level metadata correctly', async () => {
    const prisma = {
      event: { findUnique: vi.fn().mockResolvedValue(makeEvent()) },
    };
    const result = await listEventEntryAvailability(prisma as never, 'event-1');
    expect(result?.currency).toEqual({ code: 'CZK', name: 'Czech koruna' });
    expect(result?.vatPayer).toBe(false);
    expect(result?.defaultStartMode).toBe('StartList');
  });

  it('StartList class: availableCount = vacancyCount, slots populated', async () => {
    const slot1 = { id: 1, startTime: new Date('2026-06-15T08:00:00.000Z'), bibNumber: 10 };
    const slot2 = { id: 2, startTime: new Date('2026-06-15T08:02:00.000Z'), bibNumber: null };
    const prisma = {
      event: {
        findUnique: vi.fn().mockResolvedValue(
          makeEvent({
            classes: [
              makeClass({
                startMode: null,
                startSlotVacancies: [slot1, slot2],
                _count: { competitors: 80 },
              }),
            ],
          }),
        ),
      },
    };

    const result = await listEventEntryAvailability(prisma as never, 'event-1');
    const cls = result!.classes[0];
    expect(cls.capacityMode).toBe('StartSlot');
    expect(cls.availableCount).toBe(2);
    expect(cls.isFull).toBe(false);
    expect(cls.slots).toEqual([slot1, slot2]);
    expect(cls.startMode).toBe('StartList');
    expect(cls.competitorCount).toBe(80);
  });

  it('FreeStart class: availableCount = max - competitorCount, slots empty', async () => {
    const prisma = {
      event: {
        findUnique: vi.fn().mockResolvedValue(
          makeEvent({
            classes: [
              makeClass({
                startMode: 'FreeStart',
                maxNumberOfCompetitors: 50,
                startSlotVacancies: [],
                _count: { competitors: 17 },
              }),
            ],
          }),
        ),
      },
    };

    const result = await listEventEntryAvailability(prisma as never, 'event-1');
    const cls = result!.classes[0];
    expect(cls.capacityMode).toBe('FreeStart');
    expect(cls.availableCount).toBe(33);
    expect(cls.slots).toEqual([]);
    expect(cls.startMode).toBe('FreeStart');
  });

  it('FreeStart with null max: availableCount = 0, isFull', async () => {
    const prisma = {
      event: {
        findUnique: vi.fn().mockResolvedValue(
          makeEvent({
            classes: [
              makeClass({
                startMode: 'FreeStart',
                maxNumberOfCompetitors: null,
                _count: { competitors: 5 },
              }),
            ],
          }),
        ),
      },
    };

    const result = await listEventEntryAvailability(prisma as never, 'event-1');
    expect(result!.classes[0].availableCount).toBe(0);
    expect(result!.classes[0].isFull).toBe(true);
  });

  it('class inherits event defaultStartMode when startMode is null', async () => {
    const prisma = {
      event: {
        findUnique: vi.fn().mockResolvedValue(
          makeEvent({
            defaultStartMode: 'MassStart',
            classes: [makeClass({ startMode: null })],
          }),
        ),
      },
    };

    const result = await listEventEntryAvailability(prisma as never, 'event-1');
    expect(result!.classes[0].startMode).toBe('MassStart');
  });

  it('computes fee fields using computeClassFee', async () => {
    const prisma = {
      event: {
        findUnique: vi.fn().mockResolvedValue(
          makeEvent({
            entriesCloseAt: DEADLINE,
            vatPayer: true,
            vatRate: { toNumber: () => 21 },
            lateEntryFeePercent: null,
            classes: [
              makeClass({
                fee: { toNumber: () => 242 },
              }),
            ],
          }),
        ),
      },
    };

    const result = await listEventEntryAvailability(prisma as never, 'event-1');
    const cls = result!.classes[0];
    expect(cls.fee).toBe(242);
    expect(cls.currentFee).toBe(242);
    expect(cls.feeNet).toBe(200);
    expect(cls.feeVat).toBe(42);
  });

  it('calls prisma with the correct select shape', async () => {
    const prisma = {
      event: { findUnique: vi.fn().mockResolvedValue(makeEvent()) },
    };

    await listEventEntryAvailability(prisma as never, 'event-42');

    expect(prisma.event.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event-42' },
      }),
    );
    const select = prisma.event.findUnique.mock.calls[0][0].select;
    expect(select.classes.select).toHaveProperty('startSlotVacancies');
    expect(select.classes.select).toHaveProperty('_count');
    expect(select.currency).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter ./apps/server test -- --reporter=verbose --testPathPattern="entry-availability.service"
```

Expected: FAIL — `listEventEntryAvailability is not a function`

- [ ] **Step 3: Add types and `listEventEntryAvailability` to the service**

Open `apps/server/src/modules/start-slot-vacancy/start-slot-vacancy.service.ts`.

Add imports at the top (after the existing imports):

```typescript
import { resolveEffectiveStartMode } from '@repo/shared';

import { computeClassFee } from '../class/class.fee.js';
import { computeClassCapacity, type CapacityMode } from '../class/class.capacity.js';
```

Add the new types and function at the end of the file (after `deleteMatchingStartSlotVacancy`):

```typescript
export interface EntryAvailabilitySlot {
  id: number;
  startTime: Date;
  bibNumber: number | null;
}

export interface EntryAvailabilityClass {
  id: number;
  name: string;
  sex: string;
  minAge: number | null;
  maxAge: number | null;
  maxNumberOfCompetitors: number | null;
  competitorCount: number;
  startMode: string;
  fee: number | null;
  currentFee: number | null;
  feeNet: number | null;
  feeVat: number | null;
  capacityMode: CapacityMode;
  availableCount: number;
  isFull: boolean;
  slots: EntryAvailabilitySlot[];
}

export interface EventEntryAvailability {
  entriesOpenAt: Date | null;
  entriesCloseAt: Date | null;
  currency: { code: string; name: string };
  vatPayer: boolean;
  vatRate: number | null;
  defaultStartMode: string;
  classes: EntryAvailabilityClass[];
}

/**
 * Aggregate entry availability for an event: per-class capacity (vacant start
 * slots or FreeStart headroom) and computed entry fee. Returns null when the
 * event does not exist.
 *
 * Used by the public REST endpoint and the GraphQL query — both transports call
 * this function and get an identical data shape.
 */
export async function listEventEntryAvailability(
  prisma: AppPrismaClient,
  eventId: string,
): Promise<EventEntryAvailability | null> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      entriesOpenAt: true,
      entriesCloseAt: true,
      defaultStartMode: true,
      vatPayer: true,
      vatRate: true,
      lateEntryFeePercent: true,
      currency: { select: { iso4217Alpha3: true, name: true } },
      classes: {
        select: {
          id: true,
          name: true,
          sex: true,
          minAge: true,
          maxAge: true,
          maxNumberOfCompetitors: true,
          startMode: true,
          fee: true,
          startSlotVacancies: {
            select: { id: true, startTime: true, bibNumber: true },
            orderBy: { startTime: 'asc' },
          },
          _count: { select: { competitors: true } },
        },
        orderBy: { name: 'asc' },
      },
    },
  });

  if (!event) return null;

  const now = new Date();
  const { entriesCloseAt, vatPayer, vatRate, lateEntryFeePercent } = event;

  const classes: EntryAvailabilityClass[] = event.classes.map((eventClass) => {
    const effectiveStartMode = resolveEffectiveStartMode(
      eventClass.startMode,
      event.defaultStartMode,
    );
    const competitorCount = eventClass._count.competitors;
    const vacancyCount = eventClass.startSlotVacancies.length;

    const { currentFee, feeNet, feeVat } = computeClassFee({
      baseFee: eventClass.fee?.toNumber() ?? null,
      now,
      entriesCloseAt,
      lateEntryFeePercent: lateEntryFeePercent?.toNumber() ?? null,
      vatPayer,
      vatRate: vatRate?.toNumber() ?? null,
    });

    const { availableCount, capacityMode, isFull } = computeClassCapacity({
      effectiveStartMode,
      maxNumberOfCompetitors: eventClass.maxNumberOfCompetitors,
      competitorCount,
      vacancyCount,
    });

    return {
      id: eventClass.id,
      name: eventClass.name,
      sex: eventClass.sex as string,
      minAge: eventClass.minAge,
      maxAge: eventClass.maxAge,
      maxNumberOfCompetitors: eventClass.maxNumberOfCompetitors,
      competitorCount,
      startMode: effectiveStartMode,
      fee: eventClass.fee?.toNumber() ?? null,
      currentFee,
      feeNet,
      feeVat,
      capacityMode,
      availableCount,
      isFull,
      slots: capacityMode === 'StartSlot' ? eventClass.startSlotVacancies : [],
    };
  });

  return {
    entriesOpenAt: event.entriesOpenAt,
    entriesCloseAt: event.entriesCloseAt,
    currency: { code: event.currency.iso4217Alpha3, name: event.currency.name },
    vatPayer: event.vatPayer,
    vatRate: event.vatRate?.toNumber() ?? null,
    defaultStartMode: event.defaultStartMode,
    classes,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter ./apps/server test -- --reporter=verbose --testPathPattern="entry-availability.service"
```

Expected: 7 tests PASS

- [ ] **Step 5: Run the full server test suite to catch regressions**

```bash
pnpm --filter ./apps/server test -- --reporter=verbose 2>&1 | tail -10
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/modules/start-slot-vacancy/start-slot-vacancy.service.ts \
        apps/server/src/modules/start-slot-vacancy/__tests__/entry-availability.service.test.ts
git commit -m "feat(server): add listEventEntryAvailability service"
```

---

## Task 3: REST handler, OpenAPI spec, Postman scenarios

**Files:**
- Modify: `apps/server/src/modules/event/event.public.handlers.ts`
- Create: `apps/server/src/modules/event/__tests__/entry-availability.handler.test.ts`
- Modify: `apps/server/src/modules/event/event.openapi.ts`
- Modify: `apps/server/postman/collection.json`

- [ ] **Step 1: Write the failing handler test**

Create `apps/server/src/modules/event/__tests__/entry-availability.handler.test.ts`:

```typescript
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({}));
const mockListEventEntryAvailability = vi.hoisted(() => vi.fn());
const s3Mock = vi.hoisted(() => ({ getPublicObject: vi.fn() }));

vi.mock('../../../utils/context.js', () => ({ default: prismaMock }));
vi.mock('../../../lib/storage/s3.js', () => ({
  getPublicObject: s3Mock.getPublicObject,
}));
vi.mock('../../../modules/start-slot-vacancy/start-slot-vacancy.service.js', () => ({
  listEventEntryAvailability: mockListEventEntryAvailability,
}));

import publicEventRoutes from '../event.public.routes.js';

const AVAILABILITY_FIXTURE = {
  entriesOpenAt: null,
  entriesCloseAt: null,
  currency: { code: 'CZK', name: 'Czech koruna' },
  vatPayer: false,
  vatRate: null,
  defaultStartMode: 'StartList',
  classes: [
    {
      id: 10,
      name: 'H21E',
      sex: 'M',
      minAge: null,
      maxAge: null,
      maxNumberOfCompetitors: 100,
      competitorCount: 80,
      startMode: 'StartList',
      fee: null,
      currentFee: null,
      feeNet: null,
      feeVat: null,
      capacityMode: 'StartSlot',
      availableCount: 5,
      isFull: false,
      slots: [{ id: 1, startTime: new Date('2026-06-15T08:00:00.000Z'), bibNumber: null }],
    },
  ],
};

describe('GET /:eventId/entry-availability', () => {
  let app: Hono;

  beforeEach(() => {
    mockListEventEntryAvailability.mockReset();
    app = new Hono();
    app.route('/', publicEventRoutes as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with entry availability data', async () => {
    mockListEventEntryAvailability.mockResolvedValue(AVAILABILITY_FIXTURE);

    const response = await app.request('http://localhost/event-1/entry-availability');

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.currency).toEqual({ code: 'CZK', name: 'Czech koruna' });
    expect(json.data.classes).toHaveLength(1);
    expect(json.data.classes[0]).toMatchObject({
      birthYearFrom: null,
      birthYearTo: null,
    });
    expect(json.data.classes[0]).not.toHaveProperty('minAge');
    expect(json.data.classes[0]).not.toHaveProperty('maxAge');
    expect(json.data.classes[0].availableCount).toBe(5);
    expect(mockListEventEntryAvailability).toHaveBeenCalledWith(prismaMock, 'event-1');
  });

  it('returns 422 when event does not exist', async () => {
    mockListEventEntryAvailability.mockResolvedValue(null);

    const response = await app.request('http://localhost/missing-event/entry-availability');

    expect(response.status).toBe(422);
  });

  it('returns 500 when the service throws', async () => {
    mockListEventEntryAvailability.mockRejectedValue(new Error('DB down'));

    const response = await app.request('http://localhost/event-1/entry-availability');

    expect(response.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter ./apps/server test -- --reporter=verbose --testPathPattern="entry-availability.handler"
```

Expected: FAIL — route not yet registered, 404

- [ ] **Step 3: Add the REST handler**

Open `apps/server/src/modules/event/event.public.handlers.ts`.

Add this import at the top with the other imports (after `import { validateEventConnection }` line):

```typescript
import { listEventEntryAvailability } from '../start-slot-vacancy/start-slot-vacancy.service.js';
```

Add a transport helper that converts the service's age bounds to the public
REST contract:

```typescript
function ageToRestClass<T extends { minAge: number | null; maxAge: number | null }>(
  cls: T,
  refYear: number,
): Omit<T, 'minAge' | 'maxAge'> & { birthYearFrom: number | null; birthYearTo: number | null } {
  const { minAge, maxAge, ...rest } = cls;
  return {
    ...rest,
    birthYearFrom: maxAge !== null ? refYear - maxAge : null,
    birthYearTo: minAge !== null ? refYear - minAge : null,
  };
}
```

Add this route inside `registerPublicEventRoutes`, **before** the final `router.post('/:eventId/czech-ranking', ...)` handler:

```typescript
  router.get('/:eventId/entry-availability', async (c) => {
    const parsedParams = eventIdParamsSchema.safeParse(c.req.param());
    if (!parsedParams.success) {
      return c.json(responseValidationIssues(parsedParams.error.issues), 422);
    }

    const { eventId } = parsedParams.data;

    try {
      const result = await listEventEntryAvailability(prisma as never, eventId);
      if (!result) {
        return c.json(
          validation(`Event with ID ${eventId} does not exist in the database`, 422),
          422,
        );
      }
      const refYear = new Date().getFullYear();
      const data = {
        ...result,
        classes: result.classes.map((cls) => ageToRestClass(cls, refYear)),
      };
      return c.json(success('OK', { data }, 200), 200);
    } catch (err) {
      logEndpoint(c, 'error', 'Entry availability query failed', {
        eventId,
        ...getErrorDetails(err),
      });
      return c.json(error('Failed to load entry availability', 500), 500);
    }
  });
```

- [ ] **Step 4: Run the handler tests to verify they pass**

```bash
pnpm --filter ./apps/server test -- --reporter=verbose --testPathPattern="entry-availability.handler"
```

Expected: 3 tests PASS

- [ ] **Step 5: Add the OpenAPI spec**

Open `apps/server/src/modules/event/event.openapi.ts`.

Find the line `const eventsBase = EVENT_OPENAPI.basePath;` near line 325. Add the new path entry to the exported paths object — locate the `[`${eventsBase}/{eventId}/competitors`]` block and add the entry-availability path immediately before it:

```typescript
  [`${eventsBase}/{eventId}/entry-availability`]: {
    get: {
      tags: [EVENT_OPENAPI.tag],
      operationId: 'eventEntryAvailability',
      summary: 'Entry availability — capacity and fee per class',
      description:
        'Returns all classes for the event with their available start slots, capacity, ' +
        'and computed entry fee. Covers new entries, late entries, and competitor slot-change scenarios. ' +
        'No authentication required.',
      security: [],
      parameters: [eventIdParam],
      responses: {
        200: okJson('Entry availability'),
        422: okJson('Event not found'),
        500: okJson('Internal server error'),
      },
    },
  },
```

- [ ] **Step 6: Add Postman scenarios**

Open `apps/server/postman/collection.json`. Find the folder with `"name": "09 - Public Assertions & Bulk Delete"`. Add the following two items to its `item` array (append after the last existing item in that folder):

```json
{
  "name": "[GET] /rest/v1/events/{{eventId}}/entry-availability - Returns entry availability",
  "request": {
    "method": "GET",
    "header": [],
    "url": {
      "raw": "{{baseUrl}}/rest/v1/events/{{eventId}}/entry-availability",
      "host": ["{{baseUrl}}"],
      "path": ["rest", "v1", "events", "{{eventId}}", "entry-availability"]
    }
  },
  "response": [],
  "event": [
    {
      "listen": "test",
      "script": {
        "type": "text/javascript",
        "exec": [
          "pm.test('Status is 200', function () { pm.response.to.have.status(200); });",
          "pm.test('Response is JSON', function () {",
          "  pm.expect(pm.response.headers.get('Content-Type') || '').to.include('application/json');",
          "});",
          "const json = pm.response.json();",
          "pm.test('data has classes array', function () {",
          "  pm.expect(json.data).to.have.property('classes');",
          "  pm.expect(json.data.classes).to.be.an('array');",
          "});",
          "pm.test('data has currency object', function () {",
          "  pm.expect(json.data.currency).to.be.an('object');",
          "  pm.expect(json.data.currency.code).to.be.a('string');",
          "});",
          "pm.test('each class has required fields', function () {",
          "  json.data.classes.forEach(function (cls) {",
          "    pm.expect(cls.id, 'cls.id').to.be.a('number');",
          "    pm.expect(cls.name, 'cls.name').to.be.a('string');",
          "    pm.expect(cls.availableCount, 'cls.availableCount').to.be.a('number');",
          "    pm.expect(cls.isFull, 'cls.isFull').to.be.a('boolean');",
          "    pm.expect(cls.slots, 'cls.slots').to.be.an('array');",
          "    pm.expect(cls.startMode, 'cls.startMode').to.be.a('string');",
          "    pm.expect(['StartSlot', 'FreeStart'], 'cls.capacityMode').to.include(cls.capacityMode);",
          "  });",
          "});"
        ]
      }
    }
  ]
},
{
  "name": "[GET] /rest/v1/events/invalid-id/entry-availability - Returns 422 for unknown event",
  "request": {
    "method": "GET",
    "header": [],
    "url": {
      "raw": "{{baseUrl}}/rest/v1/events/nonexistent-event-id/entry-availability",
      "host": ["{{baseUrl}}"],
      "path": ["rest", "v1", "events", "nonexistent-event-id", "entry-availability"]
    }
  },
  "response": [],
  "event": [
    {
      "listen": "test",
      "script": {
        "type": "text/javascript",
        "exec": [
          "pm.test('Status is 422 for unknown event', function () { pm.response.to.have.status(422); });"
        ]
      }
    }
  ]
}
```

- [ ] **Step 7: Run the full server tests to verify no regressions**

```bash
pnpm --filter ./apps/server test -- --reporter=verbose 2>&1 | tail -10
```

Expected: all tests PASS

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/modules/event/event.public.handlers.ts \
        apps/server/src/modules/event/__tests__/entry-availability.handler.test.ts \
        apps/server/src/modules/event/event.openapi.ts \
        apps/server/postman/collection.json
git commit -m "feat(server): add GET entry-availability public REST endpoint"
```

---

## Task 4: GraphQL types, query, schema registration

**Files:**
- Create: `apps/server/src/modules/start-slot-vacancy/start-slot-vacancy.graphql.ts`
- Modify: `apps/server/src/graphql/schema.ts`
- Modify: `apps/server/src/graphql/__tests__/schema.test.ts`
- Modify: `apps/server/src/graphql/__tests__/__snapshots__/schema.test.ts.snap`

- [ ] **Step 1: Create the GraphQL module**

Create `apps/server/src/modules/start-slot-vacancy/start-slot-vacancy.graphql.ts`:

```typescript
import { builder } from '../../graphql/builder.js';
import { StartModeRef } from '../event/event.graphql-types.js';
import {
  listEventEntryAvailability,
  type EntryAvailabilitySlot,
  type EntryAvailabilityClass,
  type EventEntryAvailability,
} from './start-slot-vacancy.service.js';

const EntryAvailabilitySlotRef = builder
  .objectRef<EntryAvailabilitySlot>('EntryAvailabilitySlot')
  .implement({
    fields: (t) => ({
      id: t.exposeInt('id'),
      startTime: t.expose('startTime', { type: 'DateTime' }),
      bibNumber: t.exposeInt('bibNumber', { nullable: true }),
    }),
  });

const EntryAvailabilityCurrencyRef = builder
  .objectRef<{ code: string; name: string }>('EntryAvailabilityCurrency')
  .implement({
    fields: (t) => ({
      code: t.exposeString('code'),
      name: t.exposeString('name'),
    }),
  });

const CapacityModeRef = builder.enumType('CapacityMode', {
  values: ['FreeStart', 'StartSlot'] as const,
});

const EntryAvailabilityClassRef = builder
  .objectRef<EntryAvailabilityClass>('EntryAvailabilityClass')
  .implement({
    fields: (t) => ({
      id: t.exposeInt('id'),
      name: t.exposeString('name'),
      sex: t.exposeString('sex'),
      minAge: t.exposeInt('minAge', { nullable: true }),
      maxAge: t.exposeInt('maxAge', { nullable: true }),
      maxNumberOfCompetitors: t.exposeInt('maxNumberOfCompetitors', { nullable: true }),
      competitorCount: t.exposeInt('competitorCount'),
      startMode: t.field({
        type: StartModeRef,
        resolve: (cls) => cls.startMode as never,
      }),
      fee: t.exposeFloat('fee', { nullable: true }),
      currentFee: t.exposeFloat('currentFee', { nullable: true }),
      feeNet: t.exposeFloat('feeNet', { nullable: true }),
      feeVat: t.exposeFloat('feeVat', { nullable: true }),
      capacityMode: t.field({
        type: CapacityModeRef,
        resolve: (cls) => cls.capacityMode,
      }),
      availableCount: t.exposeInt('availableCount'),
      isFull: t.exposeBoolean('isFull'),
      slots: t.field({
        type: [EntryAvailabilitySlotRef],
        resolve: (cls) => cls.slots,
      }),
    }),
  });

const EntryAvailabilityRef = builder
  .objectRef<EventEntryAvailability>('EntryAvailability')
  .implement({
    fields: (t) => ({
      entriesOpenAt: t.expose('entriesOpenAt', { type: 'DateTime', nullable: true }),
      entriesCloseAt: t.expose('entriesCloseAt', { type: 'DateTime', nullable: true }),
      currency: t.field({
        type: EntryAvailabilityCurrencyRef,
        resolve: (ea) => ea.currency,
      }),
      vatPayer: t.exposeBoolean('vatPayer'),
      vatRate: t.exposeFloat('vatRate', { nullable: true }),
      defaultStartMode: t.field({
        type: StartModeRef,
        resolve: (ea) => ea.defaultStartMode as never,
      }),
      classes: t.field({
        type: [EntryAvailabilityClassRef],
        resolve: (ea) => ea.classes,
      }),
    }),
  });

builder.queryFields((t) => ({
  eventEntryAvailability: t.field({
    type: EntryAvailabilityRef,
    nullable: true,
    args: {
      eventId: t.arg.string({ required: true }),
    },
    resolve: (_root, args, context) =>
      listEventEntryAvailability(context.prisma, args.eventId),
  }),
}));
```

- [ ] **Step 2: Register the new module in schema.ts**

Open `apps/server/src/graphql/schema.ts`. Add this import after the last existing module import line (after `system-message.graphql.js`):

```typescript
import '../modules/start-slot-vacancy/start-slot-vacancy.graphql.js';
```

- [ ] **Step 3: Update `schema.test.ts` — add `eventEntryAvailability` to the query list**

Open `apps/server/src/graphql/__tests__/schema.test.ts`. Find the sorted array of query field names and add `'eventEntryAvailability'` to it:

```typescript
      sorted([
        '_empty',
        'activeSystemMessages',
        'changelogByEvent',
        'classById',
        'competitorById',
        'competitorSplits',
        'competitorsByClass',
        'competitorsByOrganisation',
        'competitorsByTeam',
        'countries',
        'currentUser',
        'currentUserCards',
        'event',
        'eventClasses',
        'eventClassesByIds',
        'eventEntryAvailability',
        'events',
        'eventsBySport',
        'eventsByUser',
        'myEvents',
        'organisationNames',
        'organisations',
        'searchEvents',
        'searchOrganisationNames',
        'sport',
        'sports',
        'splitPublicationStatus',
        'teamById',
        'teamsByClass',
      ]),
```

- [ ] **Step 4: Run the tests to observe the snapshot failure**

```bash
pnpm --filter ./apps/server test -- --reporter=verbose --testPathPattern="schema.test"
```

Expected: the query list test PASSES; the snapshot test FAILS (snapshot outdated).

- [ ] **Step 5: Update the snapshot**

```bash
pnpm --filter ./apps/server test -- --reporter=verbose --testPathPattern="schema.test" --update-snapshots
```

Expected: snapshot updated, all schema tests PASS.

- [ ] **Step 6: Run the full server test suite**

```bash
pnpm --filter ./apps/server test -- --reporter=verbose 2>&1 | tail -10
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/modules/start-slot-vacancy/start-slot-vacancy.graphql.ts \
        apps/server/src/graphql/schema.ts \
        apps/server/src/graphql/__tests__/schema.test.ts \
        "apps/server/src/graphql/__tests__/__snapshots__/schema.test.ts.snap"
git commit -m "feat(server): add eventEntryAvailability GraphQL query"
```

---

## Task 5: Final verification

- [ ] **Step 1: Run the complete server test suite**

```bash
pnpm --filter ./apps/server test 2>&1 | tail -5
```

Expected output:
```
Test Files  NN passed (NN)
     Tests  NNN passed (NNN)
```

All tests must pass with zero failures.

- [ ] **Step 2: Type-check the server**

```bash
pnpm --filter ./apps/server type-check 2>&1 | tail -5
```

Expected: no TypeScript errors.

- [ ] **Step 3: Type-check the GraphQL schema profile**

```bash
pnpm type-check:graphql 2>&1 | tail -5
```

Expected: no errors.
