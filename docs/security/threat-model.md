# Threat model

This is an initial STRIDE review map, not a completed audit or a claim that
every mitigation has been tested. Revisit it when adding auth flows, data
publication, imports, integrations or deployment trust boundaries.

## Assets and trust boundaries

Protect account credentials/tokens, event ownership, competitor data, order/fee
integrity, unpublished splits/maps, uploaded files and operational secrets.
Boundaries are browser ↔ API, external producer ↔ import/API, API ↔ database,
API ↔ provider/storage and deployment tooling ↔ runtime secrets. See the
[data flows](../architecture/overview.md).

| STRIDE                 | Flow / scenario                                                    | Existing control or required review                                                                             |
| ---------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Spoofing               | Stolen token or forged event identity mutates another event        | Review token validation, expiry, revocation and event-owner/admin guards on each operation                      |
| Tampering              | Client changes fee, slot, class or XML import identifiers          | Server-side pricing/validation and transactions; test concurrent reservations and malformed imports             |
| Repudiation            | Organizer disputes status/payment/import changes                   | Review protocol/status history and request IDs; do not assume logs form a tamper-proof audit trail              |
| Information disclosure | Private splits, password hashes, reset links or contact names leak | Field-level publication checks, password omission and log redaction review; SPAYD includes contact names        |
| Denial of service      | Large XML, expensive GraphQL or high-cardinality metrics           | Body limits and rate-limiter code exist; verify route coverage, parser limits, query cost and resource ceilings |
| Elevation of privilege | Unauthenticated mutation or cross-event object access              | Check authorization before private reads/writes, including WebSocket initial and later subscription data        |

## Review points

- Validate input at trust boundaries; parameterize queries and restrict uploads.
- Review XML entity handling, compressed payload expansion, provider URL
  fetching and repeated-import semantics before changing import code.
- Check browser-safe runtime variables, CORS/CSP, secret delivery and trust in
  proxy-supplied client-IP headers against the actual deployment.
- Test auth failures, cross-event IDs, restricted publication and duplicate
  races.
- Review telemetry cardinality, access to `/metrics` and sensitive error
  messages.
- Keep production data out of tests, AI prompts, plans and browser artifacts.

Track unresolved findings in issues with an owner and severity. The current map
does not establish residual-risk acceptance or a security response SLA. See
[data protection](data-protection.md) and [operations](../ops/deployment.md).

## Device sessions

User access JWTs expire after 15 minutes and use ES256 with an explicit kid,
issuer, audience and token type. Refresh credentials are opaque, hashed at rest,
rotated on every use and bound to an installation ID. Replay revokes the family.
Device identity alone is not cryptographic sender constraint. Password
changes/reset and account deletion revoke every refresh family. Issued access
tokens remain valid until expiry, subject to the existing active-account check.
Browser refresh is protected by HttpOnly/Secure/SameSite cookies, an exact Origin
allowlist and a required custom header; access credentials stay in memory.
See [G4](../specs/session-longevity.md) for acceptance criteria and limitations.
