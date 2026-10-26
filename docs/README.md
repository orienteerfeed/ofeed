# Documentation

Start here for project documentation. Agents first read the root
[AGENTS.md](../AGENTS.md), then the applicable workspace instructions and the
pages relevant to their task. The root [README](../README.md) is the
human-facing project overview and quick start.

## Documentation map

| Area           | Read when                                        | Pages                                                                                                                                        |
| -------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Product        | Understanding scope and domain language          | [Vision](product/vision.md), [requirements](product/requirements.md), [CZ–EN glossary](product/glossary.md)                                  |
| Architecture   | Changing boundaries, persistence or data flows   | [Overview and C4 diagrams](architecture/overview.md), [data model](architecture/data-model.md), [integrations](architecture/integrations.md) |
| Decisions      | Before changing architecture                     | [ADR index](architecture/adr/README.md), [MADR-lite template](architecture/adr/0000-template.md)                                             |
| Specifications | Before implementing a feature                    | [Spec workflow](specs/README.md), [template](specs/template.md), [entry checkout](specs/entry-checkout.md)                                   |
| API            | Changing a public contract                       | [Contract sources](api/README.md), [entry integration contract](entry-api-integration.md)                                                    |
| Development    | Setting up, coding or validating changes         | [Setup](dev/setup.md), [conventions](dev/conventions.md), [testing](dev/testing.md)                                                          |
| Operations     | Deploying or diagnosing an incident              | [Deployment](ops/deployment.md), [observability](ops/observability.md), [readiness runbook](ops/runbooks/api-not-ready.md)                   |
| Security       | Changing auth, imports or personal data handling | [Threat model](security/threat-model.md), [data protection](security/data-protection.md)                                                     |
| Plans          | Resuming work across agent sessions              | [Active plans directory](plans/)                                                                                                             |

## Agent workflow

1. Read [AGENTS.md](../AGENTS.md) and the relevant workspace `AGENTS.md`.
2. Read the glossary, affected spec and accepted ADRs. For non-trivial work,
   link the GitHub Issue that defines the scope; never invent an issue number.
3. Write or update a feature spec before code. Record acceptance criteria, edge
   cases, API changes and a test plan; include it with the implementation.
4. For longer work create `plans/yyyy-mm-dd-task.md` with status, issue/spec
   links, steps, validation results, open questions and a concrete next action.
5. Update the plan as work progresses. On completion remove it or move durable
   history under `plans/archive/`; keep lasting decisions in ADRs and specs.
6. Run the narrowest meaningful checks, update affected documentation and report
   limitations. Preserve unrelated working-tree changes.

## Existing detailed references

Existing paths remain valid; new pages link to these references rather than
moving them and breaking external links.

- [GraphQL architecture](GRAPHQL_ARCHITECTURE.md)
- [Course data import](COURSE_DATA_IMPORT.md)
- [Frontend runtime configuration](FRONTEND_CONFIGURATION.md)
- [Argo CD deployment](DEPLOYMENT_ARGOCD.md)
- [Helm / k3s deployment](DEPLOYMENT_K3S.md)
- [Winner notifications](winner-notifications.md)
- [Historical feature designs](superpowers/specs/) and
  [working plans](superpowers/plans/)
- [IOF XML schema reference](agent-context/IOF.xsd)

New documentation filenames use lowercase kebab-case, with `README.md` as the
index convention. Existing uppercase reference filenames are retained for
compatibility. Use `.yaml` for YAML and `.gitkeep` for otherwise empty
directories.

## Documentation conventions and sources

Document observed behavior separately from proposals. Unknown SLOs, retention
periods or ownership must stay explicitly unresolved, not become promises.
Update code-owned contracts at their [source](api/README.md).

- [AGENTS.md standard](https://agents.md)
- [ADR](https://adr.github.io/) and [MADR](https://adr.github.io/madr/)
- [Original ADR article](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
- [C4 model](https://c4model.com/) and [arc42](https://arc42.org/)
- [Keep a Changelog](https://keepachangelog.com/)
- [Diátaxis](https://diataxis.fr/)
