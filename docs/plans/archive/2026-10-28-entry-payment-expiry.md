# Entry payment expiry

Completed 2026-10-28. Spec: ../../specs/entry-payment-expiry.md. Issue not supplied.

- Added optional payment lifetime settings, immutable order deadline, periodic cancellation and checkout/detail notices in six locales.
- Expiry holds the event lock and payment row lock, then rechecks eligibility before using the existing cancellation transition.
- Checks passed: shared build, Prisma generation and validation, server TypeScript and GraphQL type checks, client TypeScript, 114 focused server tests, 28 focused client tests, GraphQL snapshot, git diff --check.
- Not run: database migration execution, live database concurrency test and browser journey. Deployment must apply the included migration before starting the updated API.
- No remaining implementation steps.
