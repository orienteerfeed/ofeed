# G19 start slot integrity — completed

- Spec: [start slot integrity](../../specs/start-slot-integrity.md).
- Issue: maintainer-supplied G19/B9; no GitHub URL supplied.
- Implemented: event-lock protection for reservations, atomic order processing,
  StartList-only exclusivity, preserved PUT semantics and 409 SLOT_TAKEN.
- Checks: server 913 passed; G19 MariaDB 14 passed; client 229 passed;
  server/GraphQL/client TypeScript passed.
- No new schema migration. G16 change APIs and broader G21 errors remain separate.
- Next action: maintainer review; attach the real GitHub issue when available.
