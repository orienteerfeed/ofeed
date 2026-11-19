# Class deletion

- Status: complete.
- Spec: ../../specs/class-deletion.md.
- Implemented: authorised event-scoped classDelete service/mutation, atomic
  dependency cleanup under event/class locks, localized Actions button,
  destructive confirmation, pending guard, Apollo refresh and subscriptions.
- Data boundaries: preserve parent orders/receipts and shared event entities.
- Checks: 14 client tests, 31 server tests, both TypeScript profiles, focused
  ESLint, formatting, GraphQL snapshot and mocked browser UI passed.
- MariaDB: dependency deletion and shared/financial data preservation verified
  using synthetic fixtures, all rolled back. Durable opt-in DB test added;
  default test run skips it without CLASS_DELETE_TEST_DATABASE_URL.
- Issue: external issue creation is restricted; no issue number invented.
- Remaining work: none; no migration needed or real local category removed.
