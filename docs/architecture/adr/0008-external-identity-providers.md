# 0008: External identity providers

- Status: proposed
- Date: 2026-10-30
- Deciders: pending
- Issue / spec: [External sign-in](../../specs/external-sign-in.md); issue pending

## Context

Users sign in only with email and password. We want ORIS SSO first and Google
and GitHub OAuth later. ORIS is not OIDC: the client redirects to
`/ssologin?cid=CLIENT_ID&uid=TOKEN`, ORIS redirects back with `uid`, and the
backend verifies the token with `CLIENT_SECRET`. Device sessions (ADR 0006)
bind session creation to the current password hash, `User.password` is
required, and browser session endpoints require Origin and custom-header
checks that a top-level provider redirect cannot satisfy.

## Considered options

1. A `UserIdentity` table per provider subject, a signed single-use state
   cookie, and an unusable random password hash for accounts created through
   SSO.
2. A nullable `User.password` with a separate session path. This touches
   change-password, reset, account deletion and session invariants.
3. An auth library (Auth.js, better-auth). That would duplicate ADR 0006
   sessions, and ORIS is not a standard protocol.

## Decision

Option 1.

- **Identity table:** `UserIdentity(provider, providerUserId)` is unique, and a
  user has at most one identity per provider. Identities are removed on account
  anonymization.
- **State cookie:** `GET /auth/sso/:provider/start` is a credentialed fetch. It
  sets a 10-minute, HMAC-signed, HttpOnly, SameSite=Lax cookie scoped to
  `/rest/v1/auth/sso`. The cookie holds the state, device metadata and mode, and
  the endpoint returns the authorize URL.
- **Callback:** the callback consumes the cookie (single use), verifies the
  identity server-side and sets the existing refresh cookie. It then redirects
  to the client. Tokens never appear in URLs.
- **Linking:**
  - An unknown identity creates an account.
  - A signed-in user links a provider explicitly (`mode=link`, bearer token).
  - Automatic linking by email happens only when the provider guarantees the
    email is verified and the ofeed account has a verified email. ORIS stays
    unverified until it confirms email verification.
- **Accounts created through SSO:** they get an argon2 hash of 32 random bytes
  and `passwordSet=false`. A password reset sets a usable password. Session
  creation keeps the ADR 0006 password-hash check.
- **Availability:** a provider is enabled only when its credentials are set and
  its kill switch (`ORIS_SSO_ENABLED`) is on. The client renders only providers
  listed by `GET /auth/sso/providers`.

## Consequences

- Positive: no change to session, reset or change-password invariants. Adding a
  provider is one entry in the provider map plus credentials.
- Negative: users created through SSO cannot change their password or delete
  their account until they set a password through reset. A crafted
  `/auth/sso/callback?status=ok&mode=login` link clears a browser's offline
  logout marker. The server-side logout has already revoked the family in the
  normal case.
- Follow-up: implement the ORIS token verification call once its contract is
  available, and confirm whether ORIS verifies email addresses.

## References

- [ADR 0006 device sessions](0006-device-sessions.md)
- [External sign-in spec](../../specs/external-sign-in.md)
