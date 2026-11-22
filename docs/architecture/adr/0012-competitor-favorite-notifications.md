# 0012: Transactional notifications for competitor favorites

Status: proposed

Issue: [#293](https://github.com/orienteerfeed/orienteerfeed/issues/293).

Store account favorites by competitor, scoped to the competitor's event. Keep
guest favorites in browser storage. Use the existing event row lock to serialize
favorite changes with result writes. Capture watched competitors before and after
the event write operation, and persist meaningful change notifications before
commit. This covers existing IOF, MeOS, direct edit and punch writers without
depending on best-effort post-commit publication.

Extend the durable inbox rather than deriving history in the browser. Public
radio flags define which intermediate times may be included; scheduled starts
and final result statuses are insufficient evidence of actual starts/readout.
Preserve the previous owner-only policy for order/payment message kinds, with a
separate spectator visibility predicate for competitor kinds.

Alternatives: periodic snapshot polling can miss intermediate changes; relying
only on result subscriptions loses messages while clients are offline; per-writer
fan-out risks divergent coverage. Event-scoped favorites avoid guessing athlete
identity from ambiguous registration strings across federations.
