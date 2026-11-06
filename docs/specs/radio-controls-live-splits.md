# Radio controls and live splits in results

- Status: implemented
- Issue: pending
- Owner: pending
- Related ADRs: none

## Goal and non-goals

Organisers mark course controls as radio (online split) controls. The individual
class results table then shows each competitor's time at those controls and
ranks runners still on course by their last known radio split.

Non-goals:

- changing which punches produce splits (decided by the timing system);
- relay results, club view and the split table.

## Current behavior and proposed behavior

Before: the radio settings UI was hidden. Results showed Active runners as one
🏃 block after all finishers, ordered by start time. Splits were not available
in the results subscription and stayed behind split publication.

After:

- Settings › Files lists the course controls with a checkbox each. Toggling one
  calls `updateControlRadioFlag`.
- Results get one column per radio control between Start and Finish. Each cell
  shows the split time with its rank in subdued small text on the same line, and
  its loss to the best time at that control on a second line on mobile. On
  desktop, time, rank and loss stay on one line. Desktop radio columns reserve
  enough width for the complete time, rank and loss, including hour-long values,
  without clipping the loss.
- An Active or Finished runner with a radio time at control R (the furthest
  radio control passed, in course order) is placed among the OK finishers. The
  runner goes right after every finisher whose time at R is less than or equal
  to theirs. Active and Finished runners always show their status emoji in the
  rank cell until readout changes their status to OK. When a newer radio split
  arrives, the runner moves. A Finished runner with a valid finish time is
  placed by that time instead, even without radio splits; ties go after the
  confirmed finisher. Pending runners never consume official ranks. For
  Finished, use the recorded duration or derive it from finish minus start when
  the duration is absent. Finished without a usable duration stays after timed
  results but before Active. Without radios, Active runners follow all Finished
  runners in ascending start-time order (unknown start times last).
- Runners without a radio time keep the existing behavior.

## Acceptance criteria

- [x] AC-01: the owner or an admin can mark and unmark radio controls. Without
      course data, a hint is shown instead of the checkboxes.
- [x] AC-02: the results table shows one column per radio control, in course
      order, with the time and rank at that control (OK, Active and Finished
      runners; ties share a rank). The rank is secondary visual information next
      to the time, and a second line shows the positive loss to the best time as
      `+MM:SS`; the best time and ties show `+0:00`. On desktop these three
      values remain on one line.
- [x] AC-03: Active and Finished runners with a radio split are slotted among OK
      finishers by their time at the last known radio control.
- [x] AC-04: radio split times are public regardless of `splitPublicationMode`,
      including `DISABLED` (confirmed 2026-10-30). Non-radio splits stay gated.
- [x] AC-05: radio columns are hidden in `UnorderedNoTimes` mode. Unordered
      modes do not use provisional placement.

## Edge cases

- Non-numeric control codes never match `Split.controlCode` (an Int), so they
  are ignored.
- Finishers without a time at the compared control (missing punch, a different
  fork) are not compared when slotting. Insert after the actual position of the
  last finisher whose split is at least as fast, preserving finisher order even
  when earlier finishers have missing splits or radio times are non-monotonic.
- A class without a course, or without radio controls, behaves as before and the
  split query is skipped.
- If no finisher has a time at the compared control (for example, results
  imported without splits), the runner stays after the OK block.
- A course that passes the same radio control twice (butterfly or loop) gets one
  column for that code.
- Codes are matched numerically, so `031` matches split control code 31.
- Radio flag changes reach split data within the 5 s server-side cache of radio
  codes per class. Open results pages poll the list of radio controls every 60
  s.

## API and data changes

- Query `classRadioControlCodes(classId: Int!): [String!]!`: public, returns
  codes only (no coordinates).
- `Competitor.radioSplits: [Split!]!`: splits at the class radio controls, not
  gated by split publication.
- No schema migration. `Control.radio` already exists and is preserved on course
  reimport.

Personal data: radio split times are competitor performance data. Marking a
control as radio is the organiser's explicit decision to publish those times
live, which is the same publication basis as results.

## Test plan

- Server: `competitor.service.test.ts` (`findCompetitorRadioSplits`) and the
  schema snapshot, run with `pnpm --filter ./apps/server test`.
- Client: `tests/pages/Event/radio-ranking.utils.test.ts` (ranks, best time,
  last control, slotting, ties, missing times before qualifying finishers and
  non-monotonic radio times) and `FilesSettingsTab.test.tsx` (visibility,
  no-course hint, toggle, refetch), run with `pnpm --filter ./apps/client test`.

## Rollout and open questions

- `radioSplits` runs one split query per competitor per push (same as `splits`).
  Batch it with a dataloader if large classes make that measurable.

## Running clock at the next radio control

For Active competitors whose valid start timestamp is in the past, show the
elapsed race time at the first radio control in course order without a valid
positive split. Leave subsequent unpassed radios and the finish time empty.
When a split arrives, display its recorded time/rank/loss and move the running
clock to the next missing radio, or Finish/Time when all radios are recorded.
The clock remains total elapsed time since start; it is never a leg prediction,
recorded split, provisional radio rank or input to ranking. Existing 1-second
ticks continue without requiring a new feed update.

No-radio classes retain the finish clock. Future starts retain the existing
countdown in Finish/Time; missing/invalid starts retain the existing placeholder.
Non-Active competitors never show a running radio clock. Zero/null/nonpositive
splits count as missing, numeric code matching stays unchanged, and missing
earlier punches take priority even if a later radio is recorded. UnorderedNoTimes
still hides all times. Radio flag changes and feed corrections recalculate the
clock column. No API/schema changes.

Validation: helper tests cover ordered progression, gaps, invalid splits, code
normalization, statuses and start timestamps. Browser regression covers one
clock ticking and moving across two radios into Finish on live updates, recorded
values replacing it, no-radio fallback, mobile/desktop and all three browsers.
