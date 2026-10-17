# Documentation Index

Start with the repository [README](../README.md) for a project overview,
requirements, local setup, and commands. Coding agents must first read the root
[AGENTS.md](../AGENTS.md), then the guidelines for the directories they change.

## Repository and Contribution Guides

- [Agent entry point](../AGENTS.md): stack, commands, conventions, validation,
  and links to scoped rules.
- [Contributing](../CONTRIBUTING.md): issue planning, branching, Conventional
  Commits, pull requests, review, and release requests.
- [Changelog](../CHANGELOG.md): manually maintained Keep a Changelog history.
- [Contributor License Agreement](../CLA.md) and
  [Code of Conduct](../CODE_OF_CONDUCT.md).

## Applications and Shared Contracts

| Area                            | Agent guidelines                                 | Human documentation                                           |
| ------------------------------- | ------------------------------------------------ | ------------------------------------------------------------- |
| React client                    | [Client AGENTS.md](../apps/client/AGENTS.md)     | [Client README](../apps/client/README.md)                     |
| Hono API                        | [Server AGENTS.md](../apps/server/AGENTS.md)     | [Server README](../apps/server/README.md)                     |
| Vue event board                 | [Board AGENTS.md](../apps/board/AGENTS.md)       | [Board README](../apps/board/README.md)                       |
| Shared TypeScript/Zod contracts | [Shared AGENTS.md](../packages/shared/AGENTS.md) | [Source and exports](../packages/shared/src/index.ts)         |
| GitHub automation               | [GitHub AGENTS.md](../.github/AGENTS.md)         | [CI/CD and versioning](../README.md#cicd-and-versioning-flow) |

## Architecture and Features

- [GraphQL architecture](./GRAPHQL_ARCHITECTURE.md): module ownership, services,
  validation, Prisma integration, subscriptions, and testing.
- [IOF CourseData import](./COURSE_DATA_IMPORT.md): course data, radio controls,
  authorization, and import status.
- [Winner notifications](./winner-notifications.md): winner announcements and
  XML start windows.
- [IOF XML schema](./agent-context/IOF.xsd): reference schema for import work.

## Configuration and Deployment

- [Delivery pipeline](./DELIVERY_MODEL.md): build once, promote verified
  GHCR digests, automatic dev delivery, production GitOps approval, and
  rollback, including one-time activation requirements.
- [Frontend configuration](./FRONTEND_CONFIGURATION.md): Vite variables, public
  runtime settings, Docker Compose, and Kubernetes configuration.
- [Argo CD deployment](./DEPLOYMENT_ARGOCD.md): release images, Helm,
  migrations, and secret delivery.
- [k3s deployment reference](./DEPLOYMENT_K3S.md).
- [Helm chart reference](../deploy/helm/ofeed/README.md).
- [API integration collection](../apps/server/postman/README.md).

## Design History

[Design specifications](./superpowers/specs/) and
[implementation plans](./superpowers/plans/) capture dated decisions and planned
work. Check the current code and maintained guides before treating a historical
plan as implemented behavior or current policy.
