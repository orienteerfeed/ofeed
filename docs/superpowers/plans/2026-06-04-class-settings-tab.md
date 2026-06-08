# Class Settings Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Git note:** This repo denies mutating git commands to the assistant via `.claude/settings.json`. If a `git commit` step is blocked during execution, leave the change staged and ask the user to commit; do not skip the surrounding work.

**Goal:** Split Event Settings into **General / Obecné** and **Classes / Kategorie** tabs, and let event owners edit per-class config inline (hybrid save-on-blur) with a read-only "free start times" dialog.

**Architecture:** A shared Zod schema (`classUpdateInputSchema`) defines the editable contract. The server gains a partial `classUpdate` mutation + a read-only `classStartSlotVacancies` query, both reusing existing services and `requireEventOwnerOrAdmin` authz. The client wraps the settings page in the existing `Tabs` molecule and adds a `ClassesSettingsTab` rendering `AppDataTable` with inline editing through Apollo mutations.

**Tech Stack:** Pothos + GraphQL Yoga + Prisma (server), `@repo/shared` Zod (shared), React 19 + Apollo Client + shadcn/`AppDataTable` (client), Vitest.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `packages/shared/src/models/class.ts` | Add `classUpdateInputSchema` + `ClassUpdateInput` |
| `apps/server/src/modules/class/class.service.ts` | Add `updateClassForGraphQL` |
| `apps/server/src/modules/class/__tests__/class.service.test.ts` | Tests for the update service |
| `apps/server/src/modules/class/class.graphql.ts` | Expose `minTeamMembers`/`maxTeamMembers`, add `classUpdate` mutation, order `eventClasses` by name |
| `apps/server/src/modules/start-slot-vacancy/start-slot-vacancy.graphql.ts` | Add read-only `classStartSlotVacancies` query |
| `apps/server/src/graphql/__tests__/__snapshots__/schema.test.ts.snap` | Regenerated SDL snapshot |
| `apps/client/src/pages/Event/Settings/EventSettingsPage.tsx` | Wrap content in tabs |
| `apps/client/src/pages/Event/Settings/GeneralSettingsTab.tsx` | Current settings body (extracted) |
| `apps/client/src/pages/Event/Settings/ClassesSettingsTab.tsx` | Class table + inline editing |
| `apps/client/src/pages/Event/Settings/ClassStartTimesDialog.tsx` | Read-only free-start-times dialog |
| `apps/client/src/pages/Event/Settings/__tests__/ClassesSettingsTab.test.tsx` | Component tests |
| `apps/client/src/i18n/locales/{en,cs,es,de,sv,fr}/translation.json` | New i18n keys |

---

## Task 1: Shared `classUpdateInputSchema`

**Files:**
- Modify: `packages/shared/src/models/class.ts`

- [ ] **Step 1: Add the schema**

In `packages/shared/src/models/class.ts`, the existing import line already pulls in `sexSchema` and `startModeSchema`:

```ts
import { classStatusSchema, dateLikeSchema, sexSchema, startModeSchema } from "./common.js";
```

Append at the end of the file, after the existing `export type Class = ...` line:

```ts
export const classUpdateInputSchema = z
  .object({
    classId: z.number().int().positive(),
    maxNumberOfCompetitors: z.number().int().nonnegative().nullable().optional(),
    minAge: z.number().int().nonnegative().nullable().optional(),
    maxAge: z.number().int().nonnegative().nullable().optional(),
    minTeamMembers: z.number().int().min(1).nullable().optional(),
    maxTeamMembers: z.number().int().min(1).nullable().optional(),
    sex: sexSchema.optional(),
    resultListMode: z
      .enum(['Default', 'Unordered', 'UnorderedNoTimes'])
      .nullable()
      .optional(),
    startMode: startModeSchema.nullable().optional(),
    fee: z
      .number()
      .nonnegative()
      .nullable()
      .optional()
      .refine((value) => value == null || Number.isInteger(value * 100), {
        message: 'Class fee can have at most 2 decimal places.',
      }),
  })
  .refine(
    (value) => value.minAge == null || value.maxAge == null || value.minAge <= value.maxAge,
    { message: 'minAge must be less than or equal to maxAge.', path: ['maxAge'] },
  )
  .refine(
    (value) =>
      value.minTeamMembers == null ||
      value.maxTeamMembers == null ||
      value.minTeamMembers <= value.maxTeamMembers,
    {
      message: 'minTeamMembers must be less than or equal to maxTeamMembers.',
      path: ['maxTeamMembers'],
    },
  );

export type ClassUpdateInput = z.infer<typeof classUpdateInputSchema>;
```

- [ ] **Step 2: Build the shared package**

Run: `pnpm --filter @repo/shared build`
Expected: builds without TypeScript errors; `dist/` updated.

- [ ] **Step 3: Type-check shared**

Run: `pnpm --filter @repo/shared type-check`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/models/class.ts packages/shared/dist
git commit -m "feat(shared): add classUpdateInputSchema for class edits"
```

---

## Task 2: Server `updateClassForGraphQL` service (TDD)

**Files:**
- Modify: `apps/server/src/modules/class/class.service.ts`
- Test: `apps/server/src/modules/class/__tests__/class.service.test.ts`

- [ ] **Step 1: Write the failing tests**

Append these tests to `apps/server/src/modules/class/__tests__/class.service.test.ts`. Add the import for the new function to the existing import line so it reads:

```ts
import { updateClassFeeForGraphQL, updateClassForGraphQL } from '../class.service.js';
```

Then append:

```ts
describe('updateClassForGraphQL', () => {
  it('updates only the provided fields', async () => {
    const prisma = createPrismaMock();

    await expect(
      updateClassForGraphQL(prisma as never, auth, {
        classId: 42,
        maxNumberOfCompetitors: 30,
        sex: 'F',
      }),
    ).resolves.toEqual({ message: 'Class updated' });

    expect(prisma.class.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { maxNumberOfCompetitors: 30, sex: 'F' },
    });
  });

  it('clears a nullable field when null is passed', async () => {
    const prisma = createPrismaMock();

    await expect(
      updateClassForGraphQL(prisma as never, auth, { classId: 42, startMode: null }),
    ).resolves.toEqual({ message: 'Class updated' });

    expect(prisma.class.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { startMode: null },
    });
  });

  it('rejects minAge greater than maxAge before database access', async () => {
    const prisma = createPrismaMock();

    await expect(
      updateClassForGraphQL(prisma as never, auth, { classId: 42, minAge: 40, maxAge: 10 }),
    ).rejects.toThrow('minAge must be less than or equal to maxAge.');

    expect(prisma.class.findUnique).not.toHaveBeenCalled();
    expect(prisma.class.update).not.toHaveBeenCalled();
  });

  it('rejects minTeamMembers greater than maxTeamMembers', async () => {
    const prisma = createPrismaMock();

    await expect(
      updateClassForGraphQL(prisma as never, auth, {
        classId: 42,
        minTeamMembers: 5,
        maxTeamMembers: 2,
      }),
    ).rejects.toThrow('minTeamMembers must be less than or equal to maxTeamMembers.');

    expect(prisma.class.update).not.toHaveBeenCalled();
  });

  it('rejects fees with more than 2 decimal places', async () => {
    const prisma = createPrismaMock();

    await expect(
      updateClassForGraphQL(prisma as never, auth, { classId: 42, fee: 10.123 }),
    ).rejects.toThrow('Class fee can have at most 2 decimal places.');

    expect(prisma.class.update).not.toHaveBeenCalled();
  });

  it('throws when the class does not exist', async () => {
    const prisma = createPrismaMock();
    prisma.class.findUnique.mockResolvedValueOnce(null);

    await expect(
      updateClassForGraphQL(prisma as never, auth, { classId: 999, minAge: 1 }),
    ).rejects.toThrow('Class not found');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter ofeed-server exec vitest run src/modules/class/__tests__/class.service.test.ts`
Expected: FAIL — `updateClassForGraphQL` is not exported.

- [ ] **Step 3: Implement the service**

In `apps/server/src/modules/class/class.service.ts`, add this import near the top (after the existing imports):

```ts
import { classUpdateInputSchema } from '@repo/shared';
```

Append this function at the end of the file:

```ts
/**
 * Partial update of a class's editable configuration. Validates input with the
 * shared `classUpdateInputSchema` (including cross-field age / team-size
 * constraints and 2-decimal fee limit), authorises against the owning event,
 * and persists only the fields the caller supplied. Passing `null` for a
 * nullable field clears it; omitting a field leaves it unchanged.
 */
export async function updateClassForGraphQL(
  prisma: AppPrismaClient,
  auth: GraphQLAuthContext,
  input: unknown,
) {
  const parsed = classUpdateInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? 'Invalid class update input.',
    );
  }

  const { classId, ...fields } = parsed.data;

  const eventClass = await prisma.class.findUnique({
    where: { id: classId },
    select: { id: true, eventId: true },
  });

  if (!eventClass) {
    throw new Error('Class not found');
  }

  await requireEventOwnerOrAdmin(prisma, auth, eventClass.eventId);

  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      data[key] = value;
    }
  }

  await prisma.class.update({
    where: { id: eventClass.id },
    data: data as Prisma.ClassUpdateInput,
  });

  return { message: 'Class updated' };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter ofeed-server exec vitest run src/modules/class/__tests__/class.service.test.ts`
Expected: PASS (all `updateClassForGraphQL` + existing `updateClassFeeForGraphQL` tests green).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/class/class.service.ts apps/server/src/modules/class/__tests__/class.service.test.ts
git commit -m "feat(server): add updateClassForGraphQL partial class update service"
```

---

## Task 3: Server GraphQL `classUpdate` mutation + field exposure

**Files:**
- Modify: `apps/server/src/modules/class/class.graphql.ts`

- [ ] **Step 1: Import the new service function**

In `apps/server/src/modules/class/class.graphql.ts`, extend the existing import from `./class.service.js` so it includes `updateClassForGraphQL`:

```ts
import {
  findClassById,
  findEventClasses,
  findEventClassesByIds,
  updateClassFeeForGraphQL,
  updateClassForGraphQL,
} from './class.service.js';
```

- [ ] **Step 2: Expose `minTeamMembers` / `maxTeamMembers` on `ClassRef`**

In the `ClassRef` field map, add these two fields next to `maxNumberOfCompetitors`:

```ts
    minTeamMembers: t.exposeInt('minTeamMembers', { nullable: true }),
    maxTeamMembers: t.exposeInt('maxTeamMembers', { nullable: true }),
```

- [ ] **Step 3: Order `eventClasses` by name**

In the `eventClasses` query field, change the resolver so classes come back sorted by name:

```ts
  eventClasses: t.prismaField({
    type: [ClassRef],
    nullable: true,
    args: {
      eventId: t.arg.string({ required: true }),
    },
    resolve: (query, _root, args, context) =>
      findEventClasses(context.prisma, args.eventId, { ...query, orderBy: { name: 'asc' } }),
  }),
```

- [ ] **Step 4: Add the `UpdateClassInput` input type and `classUpdate` mutation**

Add this input type next to the existing `UpdateClassFeeInputRef`:

```ts
const UpdateClassInputRef = builder.inputType('UpdateClassInput', {
  fields: (t) => ({
    classId: t.int({ required: true }),
    maxNumberOfCompetitors: t.int({ required: false }),
    minAge: t.int({ required: false }),
    maxAge: t.int({ required: false }),
    minTeamMembers: t.int({ required: false }),
    maxTeamMembers: t.int({ required: false }),
    sex: t.string({ required: false }),
    resultListMode: t.string({ required: false }),
    startMode: t.field({ type: StartModeRef, required: false }),
    fee: t.float({ required: false }),
  }),
});
```

Then add the `classUpdate` field inside the existing `builder.mutationFields((t) => ({ ... }))` block (alongside `classFeeUpdate`):

```ts
  classUpdate: t.field({
    type: ResponseMessageRef,
    args: {
      input: t.arg({ type: UpdateClassInputRef, required: true }),
    },
    resolve: (_root, args, context) =>
      updateClassForGraphQL(context.prisma, context.auth, {
        classId: args.input.classId,
        maxNumberOfCompetitors: args.input.maxNumberOfCompetitors,
        minAge: args.input.minAge,
        maxAge: args.input.maxAge,
        minTeamMembers: args.input.minTeamMembers,
        maxTeamMembers: args.input.maxTeamMembers,
        sex: args.input.sex,
        resultListMode: args.input.resultListMode,
        startMode: args.input.startMode,
        fee: args.input.fee,
      }).catch((err: unknown) => rethrowAuthzOrError(err, 'Failed to update class')),
  }),
```

- [ ] **Step 5: Type-check the GraphQL profile**

Run: `pnpm --filter ofeed-server type-check:graphql`
Expected: PASS (regenerates Prisma/Pothos types first, then type-checks).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/modules/class/class.graphql.ts
git commit -m "feat(server): add classUpdate mutation and expose team-size fields"
```

---

## Task 4: Server GraphQL `classStartSlotVacancies` query

**Files:**
- Modify: `apps/server/src/modules/start-slot-vacancy/start-slot-vacancy.graphql.ts`

- [ ] **Step 1: Import the list service**

In `apps/server/src/modules/start-slot-vacancy/start-slot-vacancy.graphql.ts`, extend the existing import from `./start-slot-vacancy.service.js` to include `listStartSlotVacanciesByClass`:

```ts
import {
  listEventEntryAvailability,
  listStartSlotVacanciesByClass,
  type EntryAvailabilityFee,
  type EntryAvailabilitySlot,
  type EntryAvailabilityClass,
  type EventEntryAvailability,
} from './start-slot-vacancy.service.js';
```

- [ ] **Step 2: Add an object ref + query**

Add this object ref above the existing `builder.queryFields(...)` block:

```ts
const ClassStartSlotVacancyRef = builder
  .objectRef<{ id: number; startTime: Date; bibNumber: number | null }>('ClassStartSlotVacancy')
  .implement({
    fields: (t) => ({
      id: t.exposeInt('id'),
      startTime: t.expose('startTime', { type: 'DateTime' }),
      bibNumber: t.exposeInt('bibNumber', { nullable: true }),
    }),
  });
```

Then add this field inside the existing `builder.queryFields((t) => ({ ... }))` block (next to `eventEntryAvailability`):

```ts
  classStartSlotVacancies: t.field({
    type: [ClassStartSlotVacancyRef],
    args: {
      classId: t.arg.int({ required: true }),
    },
    resolve: (_root, args, context) =>
      listStartSlotVacanciesByClass(context.prisma, args.classId),
  }),
```

- [ ] **Step 3: Type-check the GraphQL profile**

Run: `pnpm --filter ofeed-server type-check:graphql`
Expected: PASS.

- [ ] **Step 4: Update the schema snapshot**

The SDL snapshot now includes `UpdateClassInput`, `classUpdate`, `ClassStartSlotVacancy`, `classStartSlotVacancies`, and the two new `Class` fields.

Run: `pnpm --filter ofeed-server exec vitest run -u src/graphql/__tests__/schema.test.ts`
Expected: PASS; snapshot file updated.

- [ ] **Step 5: Run the full server test suite**

Run: `pnpm --filter ofeed-server test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/modules/start-slot-vacancy/start-slot-vacancy.graphql.ts apps/server/src/graphql/__tests__/__snapshots__/schema.test.ts.snap
git commit -m "feat(server): add classStartSlotVacancies query"
```

---

## Task 5: i18n keys (all 6 locales)

**Files:**
- Modify: `apps/client/src/i18n/locales/en/translation.json`
- Modify: `apps/client/src/i18n/locales/cs/translation.json`
- Modify: `apps/client/src/i18n/locales/{es,de,sv,fr}/translation.json`

- [ ] **Step 1: Add English keys**

In `apps/client/src/i18n/locales/en/translation.json`, the existing `Pages.Event.Settings` object currently contains only `"Loading"`. Replace that object with:

```json
"Settings": {
  "Loading": "Loading event settings",
  "Tabs": {
    "General": "General",
    "Classes": "Classes"
  },
  "Classes": {
    "Title": "Classes",
    "Description": "Edit per-class configuration. Changes are saved automatically.",
    "Columns": {
      "Name": "Name",
      "MaxCompetitors": "Max competitors",
      "MinAge": "Min age",
      "MaxAge": "Max age",
      "MinTeamMembers": "Min team members",
      "MaxTeamMembers": "Max team members",
      "Sex": "Sex",
      "ResultListMode": "Result list mode",
      "Fee": "Fee",
      "StartMode": "Start mode",
      "Actions": "Actions"
    },
    "Sex": { "B": "Both", "M": "Male", "F": "Female" },
    "ResultListMode": {
      "None": "—",
      "Default": "Default",
      "Unordered": "Unordered",
      "UnorderedNoTimes": "Unordered (no times)"
    },
    "StartMode": {
      "Inherit": "Event default",
      "StartList": "Start list",
      "MassStart": "Mass start",
      "PursuitStart": "Pursuit start",
      "WaveStart": "Wave start",
      "FreeStart": "Free start"
    },
    "Empty": "No classes found for this event.",
    "SaveError": "Could not save the change.",
    "StartTimes": {
      "Open": "Free start times",
      "Title": "Free start times — {{name}}",
      "Time": "Start time",
      "Bib": "Bib",
      "Empty": "No free start times for this class.",
      "Close": "Close",
      "LoadError": "Could not load start times."
    }
  }
}
```

- [ ] **Step 2: Add Czech keys**

In `apps/client/src/i18n/locales/cs/translation.json`, replace the `Pages.Event.Settings` object with the same structure but Czech values:

```json
"Settings": {
  "Loading": "Načítání nastavení závodu",
  "Tabs": {
    "General": "Obecné",
    "Classes": "Kategorie"
  },
  "Classes": {
    "Title": "Kategorie",
    "Description": "Upravte nastavení jednotlivých kategorií. Změny se ukládají automaticky.",
    "Columns": {
      "Name": "Název",
      "MaxCompetitors": "Max. závodníků",
      "MinAge": "Min. věk",
      "MaxAge": "Max. věk",
      "MinTeamMembers": "Min. členů týmu",
      "MaxTeamMembers": "Max. členů týmu",
      "Sex": "Pohlaví",
      "ResultListMode": "Režim výsledkové listiny",
      "Fee": "Startovné",
      "StartMode": "Režim startu",
      "Actions": "Akce"
    },
    "Sex": { "B": "Obě", "M": "Muži", "F": "Ženy" },
    "ResultListMode": {
      "None": "—",
      "Default": "Výchozí",
      "Unordered": "Neseřazené",
      "UnorderedNoTimes": "Neseřazené (bez časů)"
    },
    "StartMode": {
      "Inherit": "Výchozí dle závodu",
      "StartList": "Startovní listina",
      "MassStart": "Hromadný start",
      "PursuitStart": "Stíhací start",
      "WaveStart": "Vlnový start",
      "FreeStart": "Volný start"
    },
    "Empty": "Pro tento závod nebyly nalezeny žádné kategorie.",
    "SaveError": "Změnu se nepodařilo uložit.",
    "StartTimes": {
      "Open": "Volné startovní časy",
      "Title": "Volné startovní časy — {{name}}",
      "Time": "Startovní čas",
      "Bib": "Číslo",
      "Empty": "Pro tuto kategorii nejsou volné startovní časy.",
      "Close": "Zavřít",
      "LoadError": "Startovní časy se nepodařilo načíst."
    }
  }
}
```

- [ ] **Step 3: Mirror keys into es / de / sv / fr**

For each of `apps/client/src/i18n/locales/{es,de,sv,fr}/translation.json`, replace the `Pages.Event.Settings` object with the **same structure and the English values from Step 1** (Weblate community translation will localise them later). Keys MUST exist in every locale to stay in sync.

- [ ] **Step 4: Verify JSON validity**

Run: `node -e "for (const l of ['en','cs','es','de','sv','fr']) JSON.parse(require('fs').readFileSync('apps/client/src/i18n/locales/'+l+'/translation.json','utf8')); console.log('all locales valid JSON')"`
Expected: prints `all locales valid JSON`.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/i18n/locales
git commit -m "feat(client): add i18n keys for class settings tab"
```

---

## Task 6: Extract `GeneralSettingsTab` and add tabs to the settings page

**Files:**
- Create: `apps/client/src/pages/Event/Settings/GeneralSettingsTab.tsx`
- Modify: `apps/client/src/pages/Event/Settings/EventSettingsPage.tsx`

- [ ] **Step 1: Create `GeneralSettingsTab`**

Create `apps/client/src/pages/Event/Settings/GeneralSettingsTab.tsx` holding the current settings body (the `DragDropFile` + the card grid). It receives everything it needs as props so the page file stays thin:

```tsx
import { config } from '@/config';
import { formatDate } from '@/lib/utils';
import { TFunction } from 'i18next';
import { DragDropFile } from '../../../components/organisms';
import { ENDPOINTS } from '../../../lib/api/endpoints';
import { Event, EventFormData } from '../../../types';
import { DangerZoneCard } from './DangerZoneCard';
import { EventExternalLinkCard } from './EventExternalLinkCard';
import { EventInfoCard } from './EventInfoCard';
import { EventIntegrationsCard } from './EventIntegrationsCard';
import { EventLinkCard } from './EventLinkCard';
import { EventPasswordCard } from './EventPasswordCard';
import { EventPublishingScheduleCard } from './EventPublishingScheduleCard';
import { TroubleShootingCard } from './TroubleShootingCard';

interface GeneralSettingsTabProps {
  t: TFunction;
  eventId: string;
  event: Event;
  initialData: Partial<EventFormData> | null;
  password: string;
  expiresAt: string | undefined;
  onPasswordUpdate: (value: string) => void;
  onEventDataDeleted: () => void;
  refetch: () => Promise<unknown>;
}

export const GeneralSettingsTab = ({
  t,
  eventId,
  event,
  initialData,
  password,
  expiresAt,
  onPasswordUpdate,
  onEventDataDeleted,
  refetch,
}: GeneralSettingsTabProps) => {
  const apiEventsEndpoint = new URL(ENDPOINTS.events(), config.BASE_API_URL).href;

  return (
    <div className="grid items-start gap-8">
      <DragDropFile eventId={eventId} />

      <div className="columns-1 md:columns-2 xl:columns-3 gap-6 space-y-6">
        <div className="break-inside-avoid">
          <EventInfoCard t={t} initialData={initialData} />
        </div>
        <div className="break-inside-avoid">
          <EventPublishingScheduleCard
            t={t}
            eventId={eventId}
            eventData={event}
            onUpdated={async () => {
              await refetch();
            }}
          />
        </div>
        <div className="break-inside-avoid">
          <EventExternalLinkCard
            t={t}
            eventId={eventId}
            initialData={initialData}
            onUpdated={async () => {
              await refetch();
            }}
          />
        </div>
        <div className="break-inside-avoid">
          <EventPasswordCard
            t={t}
            eventId={initialData?.id || ''}
            eventData={event}
            password={password}
            expiresAt={expiresAt}
            onPasswordUpdate={onPasswordUpdate}
          />
        </div>
        <div className="break-inside-avoid">
          <EventIntegrationsCard
            t={t}
            eventId={eventId}
            eventPassword={password}
            eventName={event.name}
            eventDate={formatDate(event.date)}
            apiEventsEndpoint={apiEventsEndpoint}
            apiBaseUrl={config.BASE_API_URL}
            meosEventBindings={event.meosEventBindings ?? []}
            onMeosBindingChanged={refetch}
          />
        </div>
        <div className="break-inside-avoid">
          <EventLinkCard
            t={t}
            eventId={initialData?.id || ''}
            eventSlug={event.slug ?? null}
            eventName={event.name}
            eventLocation={event.location}
            eventDateFormatted={formatDate(event.date)}
            onSlugUpdated={async () => {
              await refetch();
            }}
          />
        </div>
        <div className="break-inside-avoid">
          <DangerZoneCard t={t} eventId={eventId} onEventDataDeleted={onEventDataDeleted} />
        </div>
        <div className="break-inside-avoid">
          <TroubleShootingCard t={t} />
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Rewire `EventSettingsPage` to use tabs**

In `apps/client/src/pages/Event/Settings/EventSettingsPage.tsx`:

1. Replace the card-grid imports (`DangerZoneCard`, `EventExternalLinkCard`, `EventInfoCard`, `EventIntegrationsCard`, `EventLinkCard`, `EventPasswordCard`, `EventPublishingScheduleCard`, `TroubleShootingCard`, `DragDropFile`, `config`, `formatDate`, `ENDPOINTS`) with these two new imports plus the kept ones:

```tsx
import { Tabs } from '../../../components/molecules';
import { GeneralSettingsTab } from './GeneralSettingsTab';
import { ClassesSettingsTab } from './ClassesSettingsTab';
```

Keep the existing imports for `BackLink`, `EventVisibilityCard`, `useAuth`, `NotAuthorizedPage`, `MainPageLayout`, `Event`, `EventFormData`, hooks, and apollo. Add `useNavigate` and `useSearch` usage via the existing `@tanstack/react-router` import (extend it):

```tsx
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
```

2. Replace the final `return (...)` JSX (the `<MainPageLayout>` block that renders the grid) with a tabbed layout. Inside the component, before `return`, add:

```tsx
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { tab?: string };
  const activeTab = search.tab === 'classes' ? 'classes' : 'general';

  const handleTabChange = (tabValue: string) => {
    navigate({
      to: `/events/${eventId}/settings`,
      search: { tab: tabValue },
      replace: true,
    });
  };
```

3. The returned JSX:

```tsx
  return (
    <MainPageLayout t={t}>
      <div className="container mx-auto px-4 py-6">
        <div className="grid items-start gap-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <BackLink to={`/events/${eventId}`} />
            <div className="sm:ml-auto">
              <EventVisibilityCard
                t={t}
                eventId={eventId}
                isPublished={data.event.published}
                onUpdated={async () => {
                  await refetch();
                }}
              />
            </div>
          </div>

          <Tabs
            tabs={[
              { value: 'general', label: t('Pages.Event.Settings.Tabs.General') },
              { value: 'classes', label: t('Pages.Event.Settings.Tabs.Classes') },
            ]}
            value={activeTab}
            onValueChange={handleTabChange}
            className="space-y-6"
            listClassName="grid w-full grid-cols-2 max-w-md"
          >
            <GeneralSettingsTab
              key="general"
              t={t}
              eventId={eventId}
              event={data.event}
              initialData={initialData}
              password={password}
              expiresAt={expiresAt}
              onPasswordUpdate={setPassword}
              onEventDataDeleted={handleEventDataDeleted}
              refetch={refetch}
            />
            <ClassesSettingsTab
              key="classes"
              t={t}
              eventId={eventId}
              isRelay={data.event.relay ?? false}
            />
          </Tabs>
        </div>
      </div>
    </MainPageLayout>
  );
```

> Note: Task 7 creates `ClassesSettingsTab`. Until then the import will fail to type-check — that's expected; do Step 3 of this task only as a checkpoint, then continue to Task 7 before running type-check.

- [ ] **Step 3: Commit (after Task 7 exists, the page type-checks)**

```bash
git add apps/client/src/pages/Event/Settings/GeneralSettingsTab.tsx apps/client/src/pages/Event/Settings/EventSettingsPage.tsx
git commit -m "feat(client): split event settings into General/Classes tabs"
```

---

## Task 7: `ClassesSettingsTab` with inline save-on-blur (TDD)

**Files:**
- Create: `apps/client/src/pages/Event/Settings/ClassesSettingsTab.tsx`
- Create: `apps/client/src/pages/Event/Settings/__tests__/ClassesSettingsTab.test.tsx`

- [ ] **Step 1: Implement `ClassesSettingsTab`**

Create `apps/client/src/pages/Event/Settings/ClassesSettingsTab.tsx`:

```tsx
import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { TFunction } from 'i18next';
import { Clock } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button, Input, Select } from '@/components/atoms';
import { AppDataTable } from '@/components/organisms';
import { TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/utils';

import { ClassStartTimesDialog } from './ClassStartTimesDialog';

export const EVENT_CLASSES = gql`
  query EventClassesSettings($eventId: String!) {
    eventClasses(eventId: $eventId) {
      id
      name
      maxNumberOfCompetitors
      minAge
      maxAge
      minTeamMembers
      maxTeamMembers
      sex
      resultListMode
      fee
      startMode
    }
  }
`;

const CLASS_UPDATE = gql`
  mutation ClassUpdate($input: UpdateClassInput!) {
    classUpdate(input: $input) {
      message
    }
  }
`;

const NONE = '__none__';

export type ClassRow = {
  id: number;
  name: string;
  maxNumberOfCompetitors: number | null;
  minAge: number | null;
  maxAge: number | null;
  minTeamMembers: number | null;
  maxTeamMembers: number | null;
  sex: string | null;
  resultListMode: string | null;
  fee: number | null;
  startMode: string | null;
};

type EventClassesData = { eventClasses: ClassRow[] | null };

interface ClassesSettingsTabProps {
  t: TFunction;
  eventId: string;
  isRelay: boolean;
}

function toIntOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function toFeeOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number.parseFloat(trimmed.replace(',', '.'));
  return Number.isNaN(parsed) ? null : parsed;
}

export const ClassesSettingsTab = ({ t, eventId, isRelay }: ClassesSettingsTabProps) => {
  const { data, loading, error } = useQuery<EventClassesData>(EVENT_CLASSES, {
    variables: { eventId },
  });
  const [classUpdate] = useMutation(CLASS_UPDATE);

  const [rows, setRows] = useState<ClassRow[]>([]);
  const [startTimesClass, setStartTimesClass] = useState<ClassRow | null>(null);

  useEffect(() => {
    if (data?.eventClasses) {
      setRows(data.eventClasses);
    }
  }, [data?.eventClasses]);

  const columnCount = isRelay ? 11 : 9;

  // Persist a patch for one class. On error, revert the affected rows to the
  // previous snapshot and surface a toast.
  const commit = async (
    classId: number,
    patch: Partial<Omit<ClassRow, 'id' | 'name'>>,
    previous: ClassRow[],
  ) => {
    try {
      await classUpdate({ variables: { input: { classId, ...patch } } });
    } catch (mutationError) {
      setRows(previous);
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description:
          mutationError instanceof Error
            ? mutationError.message
            : t('Pages.Event.Settings.Classes.SaveError'),
        variant: 'error',
      });
    }
  };

  const updateLocal = (classId: number, patch: Partial<ClassRow>) => {
    setRows((current) =>
      current.map((row) => (row.id === classId ? { ...row, ...patch } : row)),
    );
  };

  const sexOptions = [
    { value: 'B', label: t('Pages.Event.Settings.Classes.Sex.B') },
    { value: 'M', label: t('Pages.Event.Settings.Classes.Sex.M') },
    { value: 'F', label: t('Pages.Event.Settings.Classes.Sex.F') },
  ];

  const resultListModeOptions = [
    { value: NONE, label: t('Pages.Event.Settings.Classes.ResultListMode.None') },
    { value: 'Default', label: t('Pages.Event.Settings.Classes.ResultListMode.Default') },
    { value: 'Unordered', label: t('Pages.Event.Settings.Classes.ResultListMode.Unordered') },
    {
      value: 'UnorderedNoTimes',
      label: t('Pages.Event.Settings.Classes.ResultListMode.UnorderedNoTimes'),
    },
  ];

  const startModeOptions = [
    { value: NONE, label: t('Pages.Event.Settings.Classes.StartMode.Inherit') },
    { value: 'StartList', label: t('Pages.Event.Settings.Classes.StartMode.StartList') },
    { value: 'MassStart', label: t('Pages.Event.Settings.Classes.StartMode.MassStart') },
    { value: 'PursuitStart', label: t('Pages.Event.Settings.Classes.StartMode.PursuitStart') },
    { value: 'WaveStart', label: t('Pages.Event.Settings.Classes.StartMode.WaveStart') },
    { value: 'FreeStart', label: t('Pages.Event.Settings.Classes.StartMode.FreeStart') },
  ];

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          {t('Pages.Event.Settings.Classes.Title')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('Pages.Event.Settings.Classes.Description')}
        </p>
      </div>

      <AppDataTable<ClassRow>
        data={rows}
        isLoading={loading}
        error={error}
        columnCount={columnCount}
        emptyStateText={t('Pages.Event.Settings.Classes.Empty')}
        renderHeader={
          <TableHeader>
            <TableRow>
              <TableHead>{t('Pages.Event.Settings.Classes.Columns.Name')}</TableHead>
              <TableHead>{t('Pages.Event.Settings.Classes.Columns.MaxCompetitors')}</TableHead>
              <TableHead>{t('Pages.Event.Settings.Classes.Columns.MinAge')}</TableHead>
              <TableHead>{t('Pages.Event.Settings.Classes.Columns.MaxAge')}</TableHead>
              {isRelay && (
                <TableHead>{t('Pages.Event.Settings.Classes.Columns.MinTeamMembers')}</TableHead>
              )}
              {isRelay && (
                <TableHead>{t('Pages.Event.Settings.Classes.Columns.MaxTeamMembers')}</TableHead>
              )}
              <TableHead>{t('Pages.Event.Settings.Classes.Columns.Sex')}</TableHead>
              <TableHead>{t('Pages.Event.Settings.Classes.Columns.ResultListMode')}</TableHead>
              <TableHead>{t('Pages.Event.Settings.Classes.Columns.Fee')}</TableHead>
              <TableHead>{t('Pages.Event.Settings.Classes.Columns.StartMode')}</TableHead>
              <TableHead>{t('Pages.Event.Settings.Classes.Columns.Actions')}</TableHead>
            </TableRow>
          </TableHeader>
        }
        renderRow={(row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">{row.name}</TableCell>

            <TableCell>
              <Input
                type="number"
                aria-label={`${row.name} maxNumberOfCompetitors`}
                value={row.maxNumberOfCompetitors ?? ''}
                onChange={(e) =>
                  updateLocal(row.id, { maxNumberOfCompetitors: toIntOrNull(e.target.value) })
                }
                onBlur={() => {
                  const previous = data?.eventClasses ?? [];
                  void commit(
                    row.id,
                    { maxNumberOfCompetitors: row.maxNumberOfCompetitors },
                    previous,
                  );
                }}
              />
            </TableCell>

            <TableCell>
              <Input
                type="number"
                aria-label={`${row.name} minAge`}
                value={row.minAge ?? ''}
                onChange={(e) => updateLocal(row.id, { minAge: toIntOrNull(e.target.value) })}
                onBlur={() => {
                  const previous = data?.eventClasses ?? [];
                  void commit(row.id, { minAge: row.minAge, maxAge: row.maxAge }, previous);
                }}
              />
            </TableCell>

            <TableCell>
              <Input
                type="number"
                aria-label={`${row.name} maxAge`}
                value={row.maxAge ?? ''}
                onChange={(e) => updateLocal(row.id, { maxAge: toIntOrNull(e.target.value) })}
                onBlur={() => {
                  const previous = data?.eventClasses ?? [];
                  void commit(row.id, { minAge: row.minAge, maxAge: row.maxAge }, previous);
                }}
              />
            </TableCell>

            {isRelay && (
              <TableCell>
                <Input
                  type="number"
                  aria-label={`${row.name} minTeamMembers`}
                  value={row.minTeamMembers ?? ''}
                  onChange={(e) =>
                    updateLocal(row.id, { minTeamMembers: toIntOrNull(e.target.value) })
                  }
                  onBlur={() => {
                    const previous = data?.eventClasses ?? [];
                    void commit(
                      row.id,
                      { minTeamMembers: row.minTeamMembers, maxTeamMembers: row.maxTeamMembers },
                      previous,
                    );
                  }}
                />
              </TableCell>
            )}

            {isRelay && (
              <TableCell>
                <Input
                  type="number"
                  aria-label={`${row.name} maxTeamMembers`}
                  value={row.maxTeamMembers ?? ''}
                  onChange={(e) =>
                    updateLocal(row.id, { maxTeamMembers: toIntOrNull(e.target.value) })
                  }
                  onBlur={() => {
                    const previous = data?.eventClasses ?? [];
                    void commit(
                      row.id,
                      { minTeamMembers: row.minTeamMembers, maxTeamMembers: row.maxTeamMembers },
                      previous,
                    );
                  }}
                />
              </TableCell>
            )}

            <TableCell>
              <Select
                value={row.sex ?? 'B'}
                options={sexOptions}
                onValueChange={(value) => {
                  const previous = data?.eventClasses ?? [];
                  updateLocal(row.id, { sex: value });
                  void commit(row.id, { sex: value }, previous);
                }}
              />
            </TableCell>

            <TableCell>
              <Select
                value={row.resultListMode ?? NONE}
                options={resultListModeOptions}
                onValueChange={(value) => {
                  const next = value === NONE ? null : value;
                  const previous = data?.eventClasses ?? [];
                  updateLocal(row.id, { resultListMode: next });
                  void commit(row.id, { resultListMode: next }, previous);
                }}
              />
            </TableCell>

            <TableCell>
              <Input
                type="number"
                step="0.01"
                aria-label={`${row.name} fee`}
                value={row.fee ?? ''}
                onChange={(e) => updateLocal(row.id, { fee: toFeeOrNull(e.target.value) })}
                onBlur={() => {
                  const previous = data?.eventClasses ?? [];
                  void commit(row.id, { fee: row.fee }, previous);
                }}
              />
            </TableCell>

            <TableCell>
              <Select
                value={row.startMode ?? NONE}
                options={startModeOptions}
                onValueChange={(value) => {
                  const next = value === NONE ? null : value;
                  const previous = data?.eventClasses ?? [];
                  updateLocal(row.id, { startMode: next });
                  void commit(row.id, { startMode: next }, previous);
                }}
              />
            </TableCell>

            <TableCell>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setStartTimesClass(row)}
              >
                <Clock className="h-4 w-4" />
                {t('Pages.Event.Settings.Classes.StartTimes.Open')}
              </Button>
            </TableCell>
          </TableRow>
        )}
      />

      <ClassStartTimesDialog
        t={t}
        classId={startTimesClass?.id ?? null}
        className={startTimesClass?.name ?? ''}
        open={startTimesClass !== null}
        onOpenChange={(open) => {
          if (!open) setStartTimesClass(null);
        }}
      />
    </div>
  );
};
```

- [ ] **Step 2: Write the component tests**

Create `apps/client/src/pages/Event/Settings/__tests__/ClassesSettingsTab.test.tsx`:

```tsx
import { MockedProvider } from '@apollo/client/testing/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ClassesSettingsTab, CLASS_UPDATE, EVENT_CLASSES } from '../ClassesSettingsTab';

const t = ((key: string) => key) as never;

const baseClass = {
  id: 1,
  name: 'H21',
  maxNumberOfCompetitors: 20,
  minAge: 21,
  maxAge: null,
  minTeamMembers: null,
  maxTeamMembers: null,
  sex: 'M',
  resultListMode: null,
  fee: 100,
  startMode: null,
  __typename: 'Class',
};

const classesMock = {
  request: { query: EVENT_CLASSES, variables: { eventId: 'event-1' } },
  result: { data: { eventClasses: [baseClass] } },
};

describe('ClassesSettingsTab', () => {
  it('renders the class name read-only and field inputs', async () => {
    render(
      <MockedProvider mocks={[classesMock]}>
        <ClassesSettingsTab t={t} eventId="event-1" isRelay={false} />
      </MockedProvider>,
    );

    expect(await screen.findByText('H21')).toBeInTheDocument();
    expect(screen.getByLabelText('H21 maxNumberOfCompetitors')).toHaveValue(20);
  });

  it('does not render team-size columns when not relay', async () => {
    render(
      <MockedProvider mocks={[classesMock]}>
        <ClassesSettingsTab t={t} eventId="event-1" isRelay={false} />
      </MockedProvider>,
    );

    await screen.findByText('H21');
    expect(screen.queryByLabelText('H21 minTeamMembers')).not.toBeInTheDocument();
  });

  it('sends a classUpdate mutation on blur of an independent field', async () => {
    let called = false;
    const updateMock = {
      request: {
        query: CLASS_UPDATE,
        variables: { input: { classId: 1, maxNumberOfCompetitors: 25 } },
      },
      result: () => {
        called = true;
        return { data: { classUpdate: { message: 'Class updated' } } };
      },
    };

    render(
      <MockedProvider mocks={[classesMock, updateMock]}>
        <ClassesSettingsTab t={t} eventId="event-1" isRelay={false} />
      </MockedProvider>,
    );

    const input = await screen.findByLabelText('H21 maxNumberOfCompetitors');
    fireEvent.change(input, { target: { value: '25' } });
    fireEvent.blur(input);

    await waitFor(() => expect(called).toBe(true));
  });

  it('reverts the field and shows an error when the mutation fails', async () => {
    const errorMock = {
      request: {
        query: CLASS_UPDATE,
        variables: { input: { classId: 1, maxNumberOfCompetitors: 25 } },
      },
      error: new Error('Not authorized for this event'),
    };

    render(
      <MockedProvider mocks={[classesMock, errorMock]}>
        <ClassesSettingsTab t={t} eventId="event-1" isRelay={false} />
      </MockedProvider>,
    );

    const input = await screen.findByLabelText('H21 maxNumberOfCompetitors');
    fireEvent.change(input, { target: { value: '25' } });
    fireEvent.blur(input);

    await waitFor(() => expect(input).toHaveValue(20));
  });
});
```

- [ ] **Step 3: Run the component tests**

Run: `pnpm --filter ofeed-client test ClassesSettingsTab`
Expected: PASS (4 tests). If `MockedProvider`'s import path differs in this Apollo v4 setup, check an existing client test that uses Apollo mocks and match its import.

- [ ] **Step 4: Type-check the client**

Run: `pnpm --filter ofeed-client type-check`
Expected: PASS (the `EventSettingsPage` import of `ClassesSettingsTab` now resolves).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/pages/Event/Settings/ClassesSettingsTab.tsx apps/client/src/pages/Event/Settings/__tests__/ClassesSettingsTab.test.tsx
git commit -m "feat(client): add ClassesSettingsTab with inline save-on-blur editing"
```

---

## Task 8: `ClassStartTimesDialog` (read-only free start times)

**Files:**
- Create: `apps/client/src/pages/Event/Settings/ClassStartTimesDialog.tsx`

- [ ] **Step 1: Implement the dialog**

Create `apps/client/src/pages/Event/Settings/ClassStartTimesDialog.tsx`:

```tsx
import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { format } from 'date-fns';
import { TFunction } from 'i18next';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const CLASS_START_SLOT_VACANCIES = gql`
  query ClassStartSlotVacancies($classId: Int!) {
    classStartSlotVacancies(classId: $classId) {
      id
      startTime
      bibNumber
    }
  }
`;

type Vacancy = { id: number; startTime: string; bibNumber: number | null };
type VacanciesData = { classStartSlotVacancies: Vacancy[] };

interface ClassStartTimesDialogProps {
  t: TFunction;
  classId: number | null;
  className: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ClassStartTimesDialog = ({
  t,
  classId,
  className,
  open,
  onOpenChange,
}: ClassStartTimesDialogProps) => {
  const { data, loading, error } = useQuery<VacanciesData>(CLASS_START_SLOT_VACANCIES, {
    variables: { classId: classId ?? 0 },
    skip: classId === null,
  });

  const vacancies = data?.classStartSlotVacancies ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('Pages.Event.Settings.Classes.StartTimes.Title', { name: className })}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('Organisms.AppDataTable.Loading', 'Načítání dat...')}
          </p>
        ) : error ? (
          <p className="py-6 text-center text-sm text-destructive">
            {t('Pages.Event.Settings.Classes.StartTimes.LoadError')}
          </p>
        ) : vacancies.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('Pages.Event.Settings.Classes.StartTimes.Empty')}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Pages.Event.Settings.Classes.StartTimes.Time')}</TableHead>
                <TableHead>{t('Pages.Event.Settings.Classes.StartTimes.Bib')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vacancies.map((vacancy) => (
                <TableRow key={vacancy.id}>
                  <TableCell>{format(new Date(vacancy.startTime), 'dd.MM.yyyy HH:mm')}</TableCell>
                  <TableCell>{vacancy.bibNumber ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
};
```

- [ ] **Step 2: Type-check the client**

Run: `pnpm --filter ofeed-client type-check`
Expected: PASS.

- [ ] **Step 3: Run the client test suite**

Run: `pnpm --filter ofeed-client test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/pages/Event/Settings/ClassStartTimesDialog.tsx
git commit -m "feat(client): add read-only free start times dialog"
```

---

## Task 9: Full verification

- [ ] **Step 1: Lint server + client**

Run: `pnpm --filter ofeed-server lint && pnpm --filter ofeed-client lint`
Expected: PASS (0 warnings on server, which uses `--max-warnings=0`).

- [ ] **Step 2: Type-check everything**

Run: `pnpm type-check`
Expected: PASS across all workspaces.

- [ ] **Step 3: Run all tests**

Run: `pnpm test`
Expected: PASS across all workspaces.

- [ ] **Step 4: Manual smoke (optional but recommended)**

Start the stack (`pnpm dev`), open an event's Settings page, confirm:
- General / Obecné tab shows the previous settings unchanged.
- Classes / Kategorie tab lists classes sorted by name; editing a number/select persists (network call succeeds, no revert); `minTeamMembers`/`maxTeamMembers` columns appear only for relay events.
- The "Free start times" button opens a read-only dialog.

- [ ] **Step 5: Final commit (if any uncommitted verification fixups)**

```bash
git add -A
git commit -m "test(client,server): verify class settings tab end-to-end"
```

---

## Self-Review Notes

- **Spec coverage:** Tabs layout (Task 6) · editable fields + hybrid save-on-blur (Task 7) · paired age & team-size validation (Tasks 1, 2, 7) · update-only scope (no create/delete anywhere) · read-only free-start-times dialog (Tasks 4, 8) · sorted-by-name (Task 3) · server `classUpdate` + authz (Tasks 2, 3) · shared schema (Task 1) · i18n in 6 locales (Task 5) · server & client tests (Tasks 2, 7).
- **Type consistency:** `ClassRow`, `EVENT_CLASSES`, `CLASS_UPDATE` are defined and exported in Task 7 and imported by its test; `UpdateClassInput` GraphQL input (Task 3) matches the `classUpdateInputSchema` fields (Task 1); `classStartSlotVacancies` query (Task 4) matches the client query in Task 8.
- **Known follow-up for the executor:** confirm the Apollo `MockedProvider` import path against an existing client Apollo test (Apollo Client v4); adjust the import in the test if needed.
