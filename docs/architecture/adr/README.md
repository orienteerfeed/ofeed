# Architecture decision records

Read accepted ADRs before changing architecture. Record a new architectural
decision as an ADR and link it from the implementation spec and pull request. Do
not reopen an accepted decision without new context and a superseding ADR.

| ADR                                             | Status   | Decision                                                     |
| ----------------------------------------------- | -------- | ------------------------------------------------------------ |
| [0001](0001-record-architecture-decisions.md)   | accepted | Record architecture decisions using MADR-lite                |
| [0002](0002-contracts-and-module-boundaries.md) | accepted | Preserve code-owned contracts and feature service boundaries |

Copy [0000-template.md](0000-template.md) to the next unused four-digit sequence
with a lowercase kebab-case title. Keep numbers stable. Statuses are `proposed`,
`accepted`, `deprecated`, or `superseded by NNNN`. A proposal becomes accepted
through maintainer review; record the actual decision participants rather than
inventing approvers. Link replacement records in both directions.
