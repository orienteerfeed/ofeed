# 0001: Record architecture decisions

- Status: accepted
- Date: 2026-10-24
- Deciders: repository owner, by requesting this documentation workflow

## Context

Agents need one entry point and durable decisions so later sessions can resume
without repeatedly reopening settled architectural choices. Existing designs and
plans are useful history but do not provide a single decision index.

## Considered options

1. Keep decisions only in conversations and pull requests.
2. Maintain one large architecture document.
3. Keep short, numbered MADR-lite records alongside specs and source code.

## Decision

Use `docs/architecture/adr/` with a template and stable numeric IDs. Root
`AGENTS.md` directs agents here before architectural changes. Capture context,
options, the decision and consequences. New proposals require maintainer review.
Existing decisions may be documented retrospectively if clearly identified.

## Consequences

- Positive: decisions are versioned, discoverable and reviewable with code.
- Negative: architectural changes require updating the ADR index and references.
- Follow-up: preserve historical specs; add records when decisions are made, not
  fictional approvals or undocumented historical deliberations.

## References

- [MADR-lite template](0000-template.md)
- [Documentation workflow](../../README.md)
- [ADR project](https://adr.github.io/)
