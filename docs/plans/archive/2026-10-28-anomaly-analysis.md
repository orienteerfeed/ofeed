# Anomaly analysis implementation

- Issue: https://github.com/orienteerfeed/ofeed/issues/164
- Spec: [anomaly-analysis](../../specs/anomaly-analysis.md)

## Steps and status

1. Specification and repository exploration: complete.
2. Shared response, pure detection and authorized GraphQL service: complete.
3. Insights UI, locales and exports: complete.
4. Regression tests and focused checks: complete.
5. Reconcile spec/changelog and archive this plan: complete.

## Decisions and open questions

Approved conservative detection, class-derived grid, evidence-backed start-unit
warnings, all start modes for split analysis and no missing-course fallback. No
open product questions. No schema migration or external publication.

## Checks and final state

- Client: 319 tests passed; shared build/types and client types/lint passed.
- Server: 1015 tests passed, 63 opt-in integration tests skipped; focused
  competitor/schema suite 44 passed; server types, strict GraphQL types and lint
  passed.
- Changed-file formatting, whitespace, locale parity and documentation links
  checked. GraphQL snapshot and route tree generated through existing tools.
- Follow-up browser verification: 24 project Playwright tests passed across
  Chromium, Firefox and WebKit at desktop/mobile sizes, covering navigation,
  filters, evidence, pagination, responsive overflow, CSV downloads, print
  popups and refresh recovery. Screenshots inspected. Development fixture uses
  actual pages/hooks with deterministic transport; backend auth and the system
  print dialog are not part of these browser tests. New files pass
  types/lint/format.
- No migrations, deployment or external publication. Implementation complete; no
  remaining action in this plan.
