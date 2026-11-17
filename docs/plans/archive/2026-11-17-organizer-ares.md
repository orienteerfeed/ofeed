# Organizer ARES refinement

- Spec: [entry settlement](../../specs/entry-settlement-pdf.md)
- Issue: pending (GitHub tools denied by repository policy).
- Status: completed.
- Changes: organizer card follows event parameters; remove club code and payment
  hint; country-directory select with localized names; authenticated ARES name/IČO
  lookup and server-owned verification timestamp, preserved in existing JSON.
- Checks: 23 server tests; full client suite (480 tests, two workers) and subsequent
  13-test focused billing/settings run; shared build/type-check, client/server
  TypeScript, strict GraphQL TypeScript, focused lint and whitespace checks.
- Initial unrestricted client run was interrupted after resource-related timeouts;
  the run limited to two workers passed.
- Browser unavailable. Live ARES/UI acceptance remains a manual deployment check.
- Next action: maintainer review and runtime/browser acceptance.
