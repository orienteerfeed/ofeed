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

- Background polling, subscription updates and transient refresh errors retain
  existing data, table DOM, category, tab, filter and sorting choices.
- Horizontal/vertical scroll offsets stay within one CSS pixel across refreshes.
- Column widths and row heights do not depend on incoming names/times. Changing
  the leader alone does not change the split column sequence.
- Loading/error placeholders are used only before initial data is available.
  Confirmed publication restrictions still hide splits and clear their data.
- Existing ranking and result-list rules remain authoritative; rows reorder
  immediately without movement animations.

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
