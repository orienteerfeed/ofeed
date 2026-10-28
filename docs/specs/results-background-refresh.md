# Results background refresh

- Status: implemented
- Issue: https://github.com/orienteerfeed/ofeed/issues/630
- Related ADRs: none; existing client data flow is unchanged

## Goal

Refresh results and splits without replacing their scroll containers or moving
numeric container/page scroll offsets. Continue applying the selected sort and
inserting new runners at their correct position. A runner may consequently move
within the viewport; the UI does not follow a particular runner.

## Acceptance criteria

- Result and split table headers remain visible immediately below the navbar
  while scrolling through their table, including horizontal scrolling on mobile.
  Headers retain working sorting controls and stop at the end of their table.
  The offset follows the actual navbar height after resizing. Nested scroll
  containers keep headers within their visible area. No API changes are needed.
- Background polling, subscription updates and transient refresh errors retain
  existing data, table DOM, category, tab, filter and sorting choices.
- Horizontal/vertical scroll offsets stay within one CSS pixel across refreshes.
- Column widths and row heights do not depend on incoming names/times. Changing
  the leader alone does not change the split column sequence.
- Loading/error placeholders are used only before initial data is available.
  Confirmed publication restrictions still hide splits and clear their data.
- Existing ranking and result-list rules remain authoritative; rows reorder
  immediately without movement animations.
- Result rows retain their original compact padding and content-driven height,
  including on mobile. Scroll preservation must not impose oversized minimum
  row heights on results or splits.

## Edge cases and interfaces

No API, schema or database changes. Saved data is scoped to the current event,
category or club. Empty successful snapshots replace old data. Removed rows may
shorten the scroll range; clamp to the nearest valid position. User navigation,
resizing, changed course definitions and confirmed access revocation can change
layout. Preserve repeated control occurrences in course order. If course metadata
is absent, use the longest available split sequence and retain it while it is
at least as complete as incoming sequences. Compute leg times, ranks, losses,
best-time highlights and cumulative ranks by split index, so repeated control
codes remain independent occurrences.

## Test plan

Browser checks also cover pinned headers on desktop/mobile, horizontal column
alignment, sorting, navbar resizing and releasing the header at the table end.

Vitest component regressions cover polling/loading/error transitions, stable DOM,
sorting, publication revocation and independent rankings for repeated controls.
Browser regressions use controlled GraphQL
responses to check scroll offsets and geometry on desktop/mobile across polling,
insertions, new leaders and long names; exercise Chromium, Firefox and WebKit.
Run client tests, type-check and focused lint. Record unavailable checks honestly.
Browser specs and fixtures under `e2e` must be included in the client TypeScript
project so normal type-check, build and typed ESLint checks cover their TS/TSX
entry points with browser libraries, a modern target and React JSX support.
Node types remain available for Playwright specs that read test environment variables.
The referenced Node TypeScript project covers tooling configuration files only;
it must not pull browser fixtures and their React imports into its composite build.
Verify both the client type-check and the root `pnpm build` after changing this
boundary. No runtime or API behavior changes are required.

## Implementation and validation

Polling keeps the existing view mounted, with scoped snapshots retained across
transient errors. A local `ResultsViewport` captures scroll offsets immediately
before DOM updates and restores them before paint, with browser anchoring disabled
inside the result view. Fixed table geometry prevents incoming values from
changing column widths. Compatible course metadata supplies the split sequence;
otherwise the longest recorded sequence is retained for the active category.

Table headers stay in their original table and receive a vertical translation
on scroll, bounded by the table end and any ancestor clipping area. This keeps
horizontal alignment and sorting handlers intact despite overflow wrappers.
The navbar is measured directly; a resize observer updates the offset when its
height changes. Scroll events are batched with animation frames.

Validation completed on 2026-10-27:

- Client Vitest: 28 files, 208 tests passed; the focused four refresh regressions
  passed again after final code cleanup.
- Client TypeScript and focused ESLint passed. Browser fixtures and tests also
  passed an additional TypeScript check.
- Playwright: 36 tests passed across Chromium, Firefox and WebKit at 1280px and
  390px. Real feature components use a deterministic Apollo transport; no live
  timing service is required. Checks cover pending/success/error polling states,
  live sorting, insertions, long names, user scrolling during a pending request,
  retained DOM/geometry and confirmed publication revocation. Scroll tolerance:
  one CSS pixel. The fixture suite uses a 60-second per-test limit for large split
  tables under parallel Firefox execution.

Commands: `pnpm --filter ./apps/client test`,
`pnpm --filter ./apps/client type-check`, and
`pnpm --filter ./apps/client exec playwright test e2e/results-refresh.spec.ts`.
In this checkout the commands used `--config.verify-deps-before-run=false` to use
installed dependencies without pnpm's automatic dependency reinstall.

Sticky-header validation on 2026-10-27: all 279 client tests (33 files), client
type-check and focused ESLint passed. Both `e2e/results-sticky-header.spec.ts`
and `e2e/results-refresh.spec.ts` passed together: 66 browser checks across
Chromium, Firefox and WebKit at 1280px and 390px. Header checks cover category,
club, relay, live and split views, nested club scrolling, horizontal alignment,
interactive split sorting, navbar height changes and the table end.

## Compact mobile results (2026-10-27)

Restore viewport-fitting result tables after the fixed 32rem minimum introduced
in b23286ab (#631). At 390px and 402px viewport widths, including page padding,
category results must show all existing mobile columns (rank, name/club, time,
loss and ranking points when enabled) without horizontal scrolling. Preserve
existing responsive column visibility, all desktop columns and wide split tables.

Use content-independent widths for numeric columns and the remaining width for
names. Scale text and horizontal padding within readable bounds using the table
container width. Truncate long names/clubs with full-name titles, never ordinary
race times or ranks. On genuinely narrow containers below 320px, allow local
horizontal scrolling rather than shrinking text indefinitely. Club, relay and
live result views follow the same compact policy, with their own column budgets.
Keep sticky headers, sorting and scroll preservation across polling intact.
No API, database or dependency changes. This is a correction under issue #630.

Validate actual table/client/scroll geometry at 320, 390 and 402px, ranking
on/off, long names and hour-long times; include a small-width scrolling fallback,
responsive resizing and desktop/mobile polling and sticky-header regressions in
Chromium, Firefox and WebKit. Run client Vitest, types, lint and formatting.


Compact mobile validation: 105 Playwright checks passed across Chromium,
Firefox and WebKit using `results-mobile.spec.ts`, `results-refresh.spec.ts`
and `results-sticky-header.spec.ts` (two workers). Checks cover 320/390/402px,
page padding, ranking on/off, long names, times and losses over one hour,
non-clipped numeric cells, local small-screen scrolling, resizing, polling,
sticky headers and desktop results. Screenshots at 402px were visually inspected
in Chromium and WebKit; this is browser emulation, not a physical iPhone test.
Client Vitest: 302 passed. Client type-check and lint passed.
