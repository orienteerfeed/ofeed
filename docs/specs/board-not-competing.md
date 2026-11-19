# Not-competing athletes on the board

Status: implemented. Scope: PR #657 (https://github.com/orienteerfeed/ofeed/pull/657).
This is a focused regression fix; no separate planning issue is required.

## Goal and acceptance criteria

- MS/NC athletes without a positive result time remain in the start list.
- Completed MS/NC athletes appear after running athletes and before DNS, without
  rank or loss, even when the start list/running display is disabled.
- Default mode orders completed MS/NC by time. Unordered modes order them by
  surname and first name. UnorderedNoTimes hides their result times.
- Header completion counts include completed MS/NC regardless of visibility.

## Edge cases and API

A zero result time continues to mean pending. DNS visibility and pending start
list behavior are unchanged. No transport, persistence or public API changes.

## Test plan

Component regressions cover hidden start lists, default ordering, both unordered
modes, hidden times and a live result-mode change. Run board unit tests and type
checking.
