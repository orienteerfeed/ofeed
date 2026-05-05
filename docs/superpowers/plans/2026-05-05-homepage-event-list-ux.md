# Homepage Event List UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "ALL events sorted oldest-first" default with a contextual Overview tab showing today's, upcoming, and recent events in relevant order.

**Architecture:** Four changes working together: (1) backend sort-order fix for RECENT/ALL filters; (2) shared GraphQL types/converter extracted so both EventList and EventsOverview import from one place; (3) new EventsOverview component with three independent queries rendered as labelled sections; (4) EventsTabs becomes a controlled component so the Overview's "See all" buttons can switch tabs.

**Tech Stack:** Hono/Prisma/Pothos backend, React 19 + Apollo Client, TanStack Router, i18next, Tailwind CSS 4, shadcn/ui, Vitest.

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Modify | `apps/server/src/graphql/event/query.ts` | Fix RECENT ordering to DESC; fix ALL ordering to DESC |
| Modify | `apps/server/src/graphql/event/__tests__/query.test.ts` | Add `events()` unit tests for ordering, pagination, filters |
| Create | `apps/client/src/pages/Home/eventsGql.ts` | Shared GraphQL query definition + converter extracted from EventList |
| Modify | `apps/client/src/pages/Home/EventList.tsx` | Import from eventsGql.ts, remove duplicated definitions |
| Create | `apps/client/src/pages/Home/EventsOverview.tsx` | Multi-section overview: Today → Upcoming → Recent |
| Modify | `apps/client/src/pages/Home/EventsTabs.tsx` | Controlled tab state, Overview as default, pass onTabChange |
| Modify | `apps/client/src/i18n/locales/en/translation.json` | Add Overview tab label + section empty-state strings |
| Modify | `apps/client/src/i18n/locales/cs/translation.json` | Czech translations |
| Modify | `apps/client/src/i18n/locales/de/translation.json` | German translations |
| Modify | `apps/client/src/i18n/locales/es/translation.json` | Spanish translations |
| Modify | `apps/client/src/i18n/locales/sv/translation.json` | Swedish translations |

---

## Task 1: Fix backend sort ordering

**Files:**
- Modify: `apps/server/src/graphql/event/query.ts:108`

**Background:** The single `orderBy` on line 108 currently reads `[{ date: 'asc' }, { id: 'asc' }]` for all filters. RECENT should return newest past events first (DESC). ALL should return newest/most-future events first (DESC) so infinite scroll reveals history. UPCOMING stays ASC (soonest first). TODAY stays ASC (earliest start time first within a day).

- [ ] **Step 1: Update orderBy to be filter-aware**

Replace the single `orderBy` inside the `try` block at line 108 in `apps/server/src/graphql/event/query.ts`:

```typescript
// Before (line 108):
orderBy: [{ date: 'asc' }, { id: 'asc' }],

// After – replace with:
const orderBy: Prisma.EventOrderByWithRelationInput[] =
  filter === 'UPCOMING' || filter === 'TODAY'
    ? [{ date: 'asc' }, { id: 'asc' }]
    : [{ date: 'desc' }, { id: 'desc' }];
```

Then pass it to `findMany`:
```typescript
const events = await prisma.event.findMany({
  where,
  take: first + 1,
  ...cursorClause,
  orderBy,
  include: {
    sport: true,
    country: true,
    classes: true,
  },
});
```

The `orderBy` variable declaration must go **before** the `prisma.event.findMany` call inside the `try` block. The `Prisma` import is already present at line 2.

---

## Task 2: Write and run backend tests for `events()`

**Files:**
- Modify: `apps/server/src/graphql/event/__tests__/query.test.ts`

The existing file only tests `searchEvents`. Extend the mock to include `event.findMany`, then add a new `describe` block for `events()`.

- [ ] **Step 1: Write failing tests — extend the mock and add describe block**

Replace the entire file content with:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  event: {
    findMany: vi.fn(),
  },
}));

vi.mock('../../../utils/context.js', () => ({
  default: prismaMock,
}));

import { events, searchEvents } from '../query.js';

describe('event GraphQL query searchEvents', () => {
  beforeEach(() => {
    prismaMock.$queryRaw.mockReset();
  });

  it('returns only published events from full-text search', async () => {
    prismaMock.$queryRaw.mockImplementation((strings: TemplateStringsArray, query: string) => {
      const sql = strings.join('__QUERY__');
      expect(query).toBe('Test');
      if (sql.includes('published = true')) {
        return Promise.resolve([{ id: 'public-event', name: 'Test event', published: true }]);
      }
      return Promise.resolve([{ id: 'private-event', name: 'Private test event', published: false }]);
    });

    await expect(searchEvents(null, { query: 'Test' })).resolves.toEqual([
      { id: 'public-event', name: 'Test event', published: true },
    ]);
  });
});

describe('event GraphQL query events()', () => {
  const makeEvents = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: `id-${i}`,
      name: `Event ${i}`,
      date: new Date(Date.now() + i * 86_400_000),
      sport: { id: 1, name: 'Orienteering' },
      country: null,
      classes: [],
    }));

  beforeEach(() => {
    prismaMock.event.findMany.mockReset();
    prismaMock.event.findMany.mockResolvedValue([]);
  });

  it('RECENT filter uses descending date order', async () => {
    await events(null, { input: { filter: 'RECENT' } });
    const arg = prismaMock.event.findMany.mock.calls[0][0];
    expect(arg.orderBy).toEqual([{ date: 'desc' }, { id: 'desc' }]);
  });

  it('ALL filter uses descending date order', async () => {
    await events(null, { input: { filter: 'ALL' } });
    const arg = prismaMock.event.findMany.mock.calls[0][0];
    expect(arg.orderBy).toEqual([{ date: 'desc' }, { id: 'desc' }]);
  });

  it('UPCOMING filter uses ascending date order', async () => {
    await events(null, { input: { filter: 'UPCOMING' } });
    const arg = prismaMock.event.findMany.mock.calls[0][0];
    expect(arg.orderBy).toEqual([{ date: 'asc' }, { id: 'asc' }]);
  });

  it('TODAY filter uses ascending date order and restricts to today', async () => {
    await events(null, { input: { filter: 'TODAY' } });
    const arg = prismaMock.event.findMany.mock.calls[0][0];
    expect(arg.orderBy).toEqual([{ date: 'asc' }, { id: 'asc' }]);
    expect(arg.where.date).toHaveProperty('gte');
    expect(arg.where.date).toHaveProperty('lte');
  });

  it('returns hasNextPage true and trims extra event when more results exist', async () => {
    prismaMock.event.findMany.mockResolvedValue(makeEvents(13));
    const result = await events(null, { input: { first: 12 } });
    expect(result.pageInfo.hasNextPage).toBe(true);
    expect(result.edges).toHaveLength(12);
  });

  it('returns hasNextPage false when results fit in one page', async () => {
    prismaMock.event.findMany.mockResolvedValue(makeEvents(5));
    const result = await events(null, { input: { first: 12 } });
    expect(result.pageInfo.hasNextPage).toBe(false);
    expect(result.edges).toHaveLength(5);
  });

  it('only returns published events (where clause)', async () => {
    await events(null, { input: {} });
    const arg = prismaMock.event.findMany.mock.calls[0][0];
    expect(arg.where.published).toBe(true);
  });
});
```

- [ ] **Step 2: Run the new tests — expect failures on ordering tests (Task 1 not yet applied) or passes if Task 1 was done first**

```bash
pnpm --filter server test -- src/graphql/event/__tests__/query.test.ts
```

Expected after Task 1 is done: all 8 tests pass.

- [ ] **Step 3: Verify full server test suite still passes**

```bash
pnpm --filter server test
```

Expected: all tests pass.

---

## Task 3: Extract shared GraphQL module

**Files:**
- Create: `apps/client/src/pages/Home/eventsGql.ts`

Extract the query definition, interfaces, and converter that are used by both `EventList` and the upcoming `EventsOverview`. This prevents the two files from drifting.

- [ ] **Step 1: Create `apps/client/src/pages/Home/eventsGql.ts`**

```typescript
import { cn, formatDate } from '@/lib/utils';
import type { Country } from '@/types/country';
import type {
  EventDiscipline,
  EventEntriesStatus,
  EventSport,
  EventStatusPrimary,
} from '@/types/event';
import { gql } from '@apollo/client';
import type { HomeEventListItem } from './types';

export interface GraphQLEvent {
  id: string;
  name: string;
  organizer?: string | null;
  date: string;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  featuredImage?: string | null;
  country?: {
    countryCode: string;
    countryName: string;
  } | null;
  sport: EventSport;
  discipline: EventDiscipline;
  relay: boolean;
  statusSummary: {
    primary: EventStatusPrimary;
    entries: EventEntriesStatus;
    entriesConfigured: boolean;
  };
}

export interface EventsData {
  events: {
    edges: {
      node: GraphQLEvent;
      cursor: string;
    }[];
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
  };
}

export interface EventsVariables {
  filter: string | null;
  first: number;
  after?: string | null;
}

export const EVENTS_QUERY = gql`
  query Events($filter: EventFilter, $first: Int!, $after: String) {
    events(input: { filter: $filter, first: $first, after: $after }) {
      edges {
        node {
          id
          name
          organizer
          date
          location
          latitude
          longitude
          featuredImage
          country {
            countryCode
            countryName
          }
          sport {
            id
            name
          }
          relay
          discipline
          statusSummary {
            primary
            entries
            entriesConfigured
          }
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const toOptionalCountry = (
  country: GraphQLEvent['country']
): Country | undefined => {
  if (!country?.countryCode || !country.countryName) {
    return undefined;
  }
  return {
    countryCode: country.countryCode,
    countryName: country.countryName,
  };
};

export const convertGraphQLEventToHomeEvent = (
  graphqlEvent: GraphQLEvent
): HomeEventListItem => {
  const slug = graphqlEvent.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

  const formattedDate = formatDate(graphqlEvent.date);
  const country = toOptionalCountry(graphqlEvent.country);

  return {
    id: graphqlEvent.id,
    slug,
    name: graphqlEvent.name,
    date: formattedDate,
    ...(graphqlEvent.organizer ? { organizer: graphqlEvent.organizer } : {}),
    ...(graphqlEvent.location ? { location: graphqlEvent.location } : {}),
    ...(graphqlEvent.featuredImage
      ? { featuredImage: graphqlEvent.featuredImage }
      : {}),
    ...(country ? { country } : {}),
    ...(typeof graphqlEvent.latitude === 'number'
      ? { latitude: graphqlEvent.latitude }
      : {}),
    ...(typeof graphqlEvent.longitude === 'number'
      ? { longitude: graphqlEvent.longitude }
      : {}),
    sport: graphqlEvent.sport,
    discipline: graphqlEvent.discipline,
    status: graphqlEvent.statusSummary.primary,
    entriesStatus: graphqlEvent.statusSummary.entries,
    entriesConfigured: graphqlEvent.statusSummary.entriesConfigured,
    relay: graphqlEvent.relay,
  };
};
```

Note: the `cn` import is unused — remove it. The file doesn't use `cn`.

Corrected imports:
```typescript
import { formatDate } from '@/lib/utils';
import type { Country } from '@/types/country';
import type {
  EventDiscipline,
  EventEntriesStatus,
  EventSport,
  EventStatusPrimary,
} from '@/types/event';
import { gql } from '@apollo/client';
import type { HomeEventListItem } from './types';
```

---

## Task 4: Update EventList.tsx to import from eventsGql.ts

**Files:**
- Modify: `apps/client/src/pages/Home/EventList.tsx:42-212`

Remove the duplicated definitions and import from `eventsGql.ts`.

- [ ] **Step 1: Replace duplicated block in EventList.tsx**

Remove lines 42–198 (the `GraphQLEvent`, `EventsData`, `EventsVariables`, `EVENTS_QUERY`, `toOptionalCountry`, `convertGraphQLEventToHomeEvent` declarations) and replace with a single import line.

At the top of `EventList.tsx`, add this import after the existing imports:

```typescript
import {
  EVENTS_QUERY,
  convertGraphQLEventToHomeEvent,
  type EventsData,
  type EventsVariables,
} from './eventsGql';
```

Then delete (do NOT keep) these blocks from EventList.tsx:
- The `interface GraphQLEvent { ... }` block (lines 42–63)
- The `interface EventsData { ... }` block (lines 65–76)
- The `interface EventsVariables { ... }` block (lines 78–82)
- The `const EVENTS_QUERY = gql\`...\`` block (lines 111–148)
- The `const toOptionalCountry = ...` function (lines 150–161)
- The `const convertGraphQLEventToHomeEvent = ...` function (lines 163–198)

Keep `mapFilterToGraphQL` (lines 200–212) — it stays in EventList.tsx because it's specific to that component's filter-to-GQL mapping.

- [ ] **Step 2: Run TypeScript check to confirm no regressions**

```bash
pnpm --filter client type-check
```

Expected: no type errors.

---

## Task 5: Add i18n keys for Overview

**Files:**
- Modify: `apps/client/src/i18n/locales/en/translation.json`
- Modify: `apps/client/src/i18n/locales/cs/translation.json`
- Modify: `apps/client/src/i18n/locales/de/translation.json`
- Modify: `apps/client/src/i18n/locales/es/translation.json`
- Modify: `apps/client/src/i18n/locales/sv/translation.json`

Each file's `Pages.Event.Tabs` object needs an `"Overview"` key. Each file also needs a new `Pages.Event.Overview` object with section empty-state strings.

- [ ] **Step 1: Add to `en/translation.json`**

In the `"Tabs"` object under `"Pages" > "Event"` (currently at line 357), add after the existing `"All"` key:

```json
"Overview": "Overview",
```

After the closing `}` of the `"Tabs"` object (and before `"Live"`), add a new sibling object:

```json
"Overview": {
  "NoEventsToday": "No events today",
  "NoUpcoming": "No upcoming events in the next 14 days",
  "NoRecent": "No recent events",
  "SeeAll": "See all"
},
```

- [ ] **Step 2: Add to `cs/translation.json`**

In the same `Tabs` object (line ~358 in cs file), add:
```json
"Overview": "Přehled",
```

Add the sibling `Overview` object:
```json
"Overview": {
  "NoEventsToday": "Dnes žádné závody",
  "NoUpcoming": "Žádné plánované závody v příštích 14 dnech",
  "NoRecent": "Žádné nedávné závody",
  "SeeAll": "Zobrazit vše"
},
```

- [ ] **Step 3: Add to `de/translation.json`**

Find the `"Pages" > "Event" > "Tabs"` object in the German file. If it doesn't exist, add it at the correct nesting level. Add:
```json
"Overview": "Übersicht",
```

Add the sibling `Overview` object:
```json
"Overview": {
  "NoEventsToday": "Heute keine Veranstaltungen",
  "NoUpcoming": "Keine kommenden Veranstaltungen in den nächsten 14 Tagen",
  "NoRecent": "Keine aktuellen Veranstaltungen",
  "SeeAll": "Alle anzeigen"
},
```

- [ ] **Step 4: Add to `es/translation.json`**

```json
"Overview": "Resumen",
```

```json
"Overview": {
  "NoEventsToday": "No hay eventos hoy",
  "NoUpcoming": "No hay eventos próximos en los próximos 14 días",
  "NoRecent": "No hay eventos recientes",
  "SeeAll": "Ver todos"
},
```

- [ ] **Step 5: Add to `sv/translation.json`**

```json
"Overview": "Översikt",
```

```json
"Overview": {
  "NoEventsToday": "Inga evenemang idag",
  "NoUpcoming": "Inga kommande evenemang inom 14 dagar",
  "NoRecent": "Inga senaste evenemang",
  "SeeAll": "Visa alla"
},
```

---

## Task 6: Create EventsOverview.tsx

**Files:**
- Create: `apps/client/src/pages/Home/EventsOverview.tsx`

This component makes three separate Apollo queries (TODAY, UPCOMING, RECENT) and renders them as labelled sections. The `onTabChange` prop allows "See all" buttons to switch the parent's active tab.

- [ ] **Step 1: Create `apps/client/src/pages/Home/EventsOverview.tsx`**

```typescript
import { useQuery } from '@apollo/client/react';
import { TFunction } from 'i18next';
import { Loader2 } from 'lucide-react';
import { type FC } from 'react';
import { EventCard } from './EventCard';
import {
  EVENTS_QUERY,
  convertGraphQLEventToHomeEvent,
  type EventsData,
  type EventsVariables,
} from './eventsGql';
import type { HomeEventListItem } from './types';

interface EventsOverviewProps {
  t: TFunction;
  onTabChange: (tab: string) => void;
}

interface SectionProps {
  title: string;
  events: HomeEventListItem[];
  loading: boolean;
  emptyMessage: string;
  seeAllTab?: string;
  seeAllLabel?: string;
  onTabChange?: (tab: string) => void;
}

function OverviewSection({
  title,
  events,
  loading,
  emptyMessage,
  seeAllTab,
  seeAllLabel,
  onTabChange,
}: SectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-mono font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        {seeAllTab && onTabChange && events.length > 0 && (
          <button
            onClick={() => onTabChange(seeAllTab)}
            className="text-xs font-mono text-primary hover:underline"
          >
            {seeAllLabel} →
          </button>
        )}
      </div>
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : events.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground font-mono">
          {emptyMessage}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {events.map(event => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

export const EventsOverview: FC<EventsOverviewProps> = ({ t, onTabChange }) => {
  const { data: todayData, loading: todayLoading } = useQuery<
    EventsData,
    EventsVariables
  >(EVENTS_QUERY, {
    variables: { filter: 'TODAY', first: 50, after: null },
    fetchPolicy: 'network-only',
  });

  const { data: upcomingData, loading: upcomingLoading } = useQuery<
    EventsData,
    EventsVariables
  >(EVENTS_QUERY, {
    variables: { filter: 'UPCOMING', first: 8, after: null },
    fetchPolicy: 'network-only',
  });

  const { data: recentData, loading: recentLoading } = useQuery<
    EventsData,
    EventsVariables
  >(EVENTS_QUERY, {
    variables: { filter: 'RECENT', first: 8, after: null },
    fetchPolicy: 'network-only',
  });

  const todayEvents =
    todayData?.events.edges.map(e => convertGraphQLEventToHomeEvent(e.node)) ??
    [];
  const upcomingEvents =
    upcomingData?.events.edges.map(e =>
      convertGraphQLEventToHomeEvent(e.node)
    ) ?? [];
  const recentEvents =
    recentData?.events.edges.map(e => convertGraphQLEventToHomeEvent(e.node)) ??
    [];

  return (
    <div className="space-y-10">
      <OverviewSection
        title={t('Pages.Event.Tabs.Today')}
        events={todayEvents}
        loading={todayLoading}
        emptyMessage={t('Pages.Event.Overview.NoEventsToday')}
      />
      <OverviewSection
        title={t('Pages.Event.Tabs.Upcoming')}
        events={upcomingEvents}
        loading={upcomingLoading}
        emptyMessage={t('Pages.Event.Overview.NoUpcoming')}
        seeAllTab="upcoming"
        seeAllLabel={t('Pages.Event.Overview.SeeAll')}
        onTabChange={onTabChange}
      />
      <OverviewSection
        title={t('Pages.Event.Tabs.Recent')}
        events={recentEvents}
        loading={recentLoading}
        emptyMessage={t('Pages.Event.Overview.NoRecent')}
        seeAllTab="recent"
        seeAllLabel={t('Pages.Event.Overview.SeeAll')}
        onTabChange={onTabChange}
      />
    </div>
  );
};
```

- [ ] **Step 2: Run TypeScript check**

```bash
pnpm --filter client type-check
```

Expected: no errors.

---

## Task 7: Update EventsTabs.tsx

**Files:**
- Modify: `apps/client/src/pages/Home/EventsTabs.tsx`

Make the tab component controlled so the Overview's "See all" buttons can switch the active tab. Replace the TODAY tab with OVERVIEW as the default. New tab order: Overview → Upcoming → Recent → All.

- [ ] **Step 1: Replace EventsTabs.tsx entirely**

```typescript
import { TFunction } from 'i18next';
import React, { useCallback, useRef, useState } from 'react';
import { Tabs } from '../../components/molecules';
import { EventList } from './EventList';
import { EventsOverview } from './EventsOverview';

interface EventTabsProps {
  t: TFunction;
}

export const EventsTabs: React.FC<EventTabsProps> = ({ t }) => {
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState('overview');

  const tabs = [
    {
      value: 'overview',
      label: (
        <span className="font-mono">
          {t('Pages.Event.Tabs.Overview').toUpperCase()}
        </span>
      ),
    },
    {
      value: 'upcoming',
      label: (
        <span className="font-mono">
          {t('Pages.Event.Tabs.Upcoming').toUpperCase()}
        </span>
      ),
    },
    {
      value: 'recent',
      label: (
        <span className="font-mono">
          {t('Pages.Event.Tabs.Recent').toUpperCase()}
        </span>
      ),
    },
    {
      value: 'all',
      label: (
        <span className="font-mono">
          {t('Pages.Event.Tabs.All').toUpperCase()}
        </span>
      ),
    },
  ];

  const scrollToTabs = useCallback(() => {
    setTimeout(() => {
      if (tabsContainerRef.current) {
        const navbar = document.querySelector('header');
        const navbarHeight = navbar?.getBoundingClientRect().height || 64;
        const tabsOffset = 8;

        const tabsRect = tabsContainerRef.current.getBoundingClientRect();
        const currentScroll =
          window.pageYOffset || document.documentElement.scrollTop;
        const targetPosition =
          currentScroll + tabsRect.top - navbarHeight - tabsOffset;

        const positionDiff = Math.abs(currentScroll - targetPosition);

        if (positionDiff > 20) {
          window.scrollTo({
            top: Math.max(0, targetPosition),
            behavior: 'smooth',
          });
        }
      }
    }, 50);
  }, []);

  const handleValueChange = useCallback(
    (newValue: string) => {
      setActiveTab(newValue);
      scrollToTabs();
    },
    [scrollToTabs]
  );

  return (
    <div ref={tabsContainerRef}>
      <Tabs
        value={activeTab}
        onValueChange={handleValueChange}
        tabs={tabs}
        className="space-y-6"
        listClassName="sticky top-18 z-50 grid w-full grid-cols-4 max-w-2xl mx-auto"
        triggerClassName="font-mono"
        contentClassName="space-y-4"
      >
        <EventsOverview t={t} onTabChange={handleValueChange} />
        <EventList t={t} filter="upcoming" />
        <EventList t={t} filter="recent" />
        <EventList t={t} filter="all" />
      </Tabs>
    </div>
  );
};
```

- [ ] **Step 2: Run TypeScript check**

```bash
pnpm --filter client type-check
```

Expected: no errors.

- [ ] **Step 3: Run linter**

```bash
pnpm --filter client lint
```

Expected: no errors.

---

## Task 8: Final verification

- [ ] **Step 1: Run full server test suite**

```bash
pnpm --filter server test
```

Expected: all tests pass, including the new ordering tests from Task 2.

- [ ] **Step 2: Run full type-check across monorepo**

```bash
pnpm type-check
```

Expected: no errors.

- [ ] **Step 3: Run lint across monorepo**

```bash
pnpm lint
```

Expected: no errors.

---

## Summary

### Final tab structure
| Tab | Value | Default | Content |
|-----|-------|---------|---------|
| Overview | `overview` | **YES** | 3 sections: Today · Upcoming (8) · Recent (8) with "See all →" |
| Upcoming | `upcoming` | no | EventList with UPCOMING filter, date ASC, infinite scroll |
| Recent | `recent` | no | EventList with RECENT filter, date DESC, infinite scroll |
| All | `all` | no | EventList with ALL filter, date DESC, infinite scroll |

### Ordering rules
| Filter | Sort |
|--------|------|
| TODAY | date ASC (earliest start first within the day) |
| UPCOMING | date ASC (soonest upcoming first) |
| RECENT | date DESC (newest past first) ← **changed** |
| ALL | date DESC (most recent/upcoming first) ← **changed** |

### Event date model
Events have a single `date` field. A LIVE event is one whose `date` falls on today (timezone-aware, computed server-side as `statusSummary.primary === 'LIVE'`).

### Remaining risks / follow-up improvements
- **ALL tab sort ambiguity:** date DESC shows far-future first. A truly "most-relevant" ALL sort (today → near future → near past → old past) would require a computed column or UNION query and is incompatible with cursor pagination. Current DESC is a pragmatic improvement.
- **RECENT 30-day window:** the backend still hard-codes 30 days for RECENT. The Overview's "Recent" section shows only 8 events from this window. Consider making the window configurable (`from` param) as a follow-up.
- **Overview has no search/filter bar:** the EventList tabs support text search; the Overview sections don't. This is intentional — Overview is a snapshot, not a search UI.
- **No client-side tests for EventsOverview:** Apollo's `MockedProvider` could cover loading/empty states in unit tests. Left as a follow-up.
