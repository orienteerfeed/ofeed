# Feature specifications

Write or update the feature spec before implementation and include it in the
same change as the code. A spec defines intent and acceptance criteria; the
[API sources](../api/README.md) define the executable contract.

- Copy [template.md](template.md) to `<feature>.md` using lowercase kebab-case.
- Link the GitHub Issue, relevant ADRs and dependencies.
- Record acceptance criteria, edge cases, API/data changes and a test plan.
- Mark whether behavior is proposed, implemented or partially implemented.
- After implementation, reconcile the spec with actual behavior and record any
  deliberate differences. Link an ADR for architecture changes.

## Current specs

- [Results background refresh](results-background-refresh.md): stable scroll and layout during live result updates.

- [Start slot integrity](start-slot-integrity.md): exclusive StartList reservations and atomic vacancy exchange.

- [Create idempotency](create-idempotency.md): 24-hour REST create replay.

- [Event insights](event-insights.md): extensible insights catalog and received payments.

- [Entry payment records](entry-payments.md): auditable CASH/QR receipts and closing reports.
- [Punch ingestion](punch-ingestion.md): SRR/readout ledger and split projection.

- [Entry checkout](entry-checkout.md): baseline of existing checkout behavior.

## Historical designs

Existing [designs](../superpowers/specs/) remain at their original paths, with
[historical plans](../superpowers/plans/) linked separately. They are context,
not proof every planned step shipped. New specs go in this directory; when
superseding an old design, link both records and explain the changed behavior.

- [Session longevity](session-longevity.md): rotating device sessions and automatic browser renewal.
