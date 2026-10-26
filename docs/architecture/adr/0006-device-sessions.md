# ADR 0006: Rotating device sessions

Status: proposed. Decision participants: maintainer review pending.

## Context

Non-expiring signin JWTs cannot support bounded access or automatic renewal for race clients. Device sessions need revocation without per-request family lookups.

## Decision

Use 15-minute ES256 access JWTs and hashed opaque refresh-token generations, rotated transactionally with strict family reuse detection. Refresh lasts 30 days sliding and at most 90 days absolute. Vault Agent renders signing-key bundles; the API validates and reloads them while preserving its last valid bundle. Native clients receive refresh credentials in response bodies; the browser uses protected HttpOnly cookies and memory-only access tokens. Keep the existing active-account check and separate OAuth/event credential validation.

## Consequences

Revoking a family does not invalidate issued access JWTs before expiry. Lost refresh responses can require signin. Browser tabs must serialize refresh. Key rotation requires distributing new verification keys before signing. Deployment invalidates legacy user tokens. Signup/verification/reset completion no longer implicitly signs in.
