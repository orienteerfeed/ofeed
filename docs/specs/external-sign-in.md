# External sign-in (ORIS SSO; Google and GitHub later)

Status: partially implemented. The ORIS token verification call is pending its
contract from ORIS. Issue: pending; link the GitHub issue here. ADR:
[0008](../architecture/adr/0008-external-identity-providers.md).

## Goal

Users can sign in or sign up with an external identity provider in addition to
email and password. ORIS SSO comes first. The design accepts Google and GitHub
OAuth without schema or route changes.

## Acceptance criteria

- **Availability**
  - A provider is enabled only when `<PROVIDER>_SSO_ENABLED` is on (default on)
    and both the client ID and client secret are set, and server-side identity
    exchange/profile mapping is implemented. ORIS remains unavailable even with
    credentials configured until its verification contract is implemented.
  - Missing credentials are not a startup error.
  - When disabled, the provider is absent from `GET /rest/v1/auth/sso/providers`
    and its start and callback routes return 404.
  - The sign-in and sign-up pages and the profile "Linked accounts" card show
    nothing for disabled providers.
- **Start:** `GET /sso/:provider/start?deviceId&deviceName&mode` sets a signed,
  single-use, 10-minute state cookie and returns `authorizeUrl`. For ORIS that
  is `${ORIS_SSO_BASE_URL}/ssologin?cid=<ORIS_SSO_CLIENT_ID>&uid=<state>`.
  `mode=link` requires a bearer access token.
- **Callback:** `GET /sso/:provider/callback` (the URL registered at ORIS is
  `https://<api-host>/rest/v1/auth/sso/oris/callback`).
  - Rejects a missing, expired, forged or mismatched state (`uid`).
  - Verifies the identity server-side. The client secret is sent only in a POST
    body, never in a URL or log.
  - Redirects to `CLIENT_APP_URL/auth/sso/callback?status=ok|error&mode=login|link&reason=<code>`.
  - A successful sign-in sets the `ofeed-refresh` cookie, and the client adopts
    it on bootstrap. Tokens never appear in URLs.
- **Account resolution**
  - A linked identity signs in its user.
  - An unknown identity with an unused email creates an active account with an
    unusable password (`passwordSet=false`).
  - An unknown identity whose email matches an existing account is linked
    automatically only when the provider verifies the email AND the account
    has `emailVerifiedAt`, is active and is not deleted. The user then gets a
    notice email. Otherwise the result is `email_in_use`.
  - ORIS emails count as unverified until ORIS confirms that it verifies them.
- **Linking:** a signed-in user links and unlinks providers in their profile.
  Unlinking the last identity of an account without a password returns 409
  `last_sign_in_method`.
- **Deletion:** account anonymization deletes linked identities.

## Edge cases and error codes

| Code | Cause |
| --- | --- |
| `invalid_state` | Cookie missing, expired, forged, or used in another browser; `uid` mismatch |
| `provider_unavailable` | Provider timeout, 5xx, or an unexpected error |
| `email_in_use` | Email belongs to an account that cannot be auto-linked |
| `email_required` | Provider returned no email for a new account |
| `identity_taken` | Identity already linked to another user, or a second identity of the same provider |
| `account_inactive` | User is inactive or deleted |
| `last_sign_in_method` | Unlink would leave no way to sign in |

## API and data

- REST under `/rest/v1/auth/sso`:
  - `GET /providers`
  - `GET /identities` (bearer)
  - `GET /:provider/start`
  - `GET /:provider/callback`
  - `DELETE /:provider/link` (bearer)

  See `auth.openapi.ts`.
- Prisma: the `UserIdentity` model and the `IdentityProvider` enum
  (`ORIS`, `GOOGLE`, `GITHUB`), plus `User.passwordSet` (default true; a reset
  sets it to true). Migration `20261030150000_user_identity`.
- Env (server):
  - `ORIS_SSO_ENABLED`
  - `ORIS_SSO_BASE_URL` (default `https://oris.ceskyorientak.cz`)
  - `ORIS_SSO_CLIENT_ID`
  - `ORIS_SSO_CLIENT_SECRET` (from Vault)
- Data protection: the identity stores the provider subject ID, the provider
  email and timestamps. See [data protection](../security/data-protection.md).

## Test plan

- **Server** (`apps/server/src/modules/auth/__tests__/sso.test.ts`):
  - configured ORIS remains absent from discovery and returns 404 for start and
    callback until identity exchange is implemented
  - provider availability, and 404 when a provider is disabled
  - the start cookie and authorize URL
  - link mode without a bearer token
  - forged or missing state
  - linked sign-in
  - account creation with an unusable password
  - verified auto-link with a notice email
  - refused auto-link for each unmet condition
  - `identity_taken` and `email_required`
- **Client:**
  - SSO buttons are hidden with no provider and render per provider
  - the session manager adopts the cookie after an external sign-in redirect
    despite an earlier logout marker, and keeps the marker on error redirects
- **Manual:** an ORIS test account against a dev API once ORIS has registered
  the callback URL and the verification call is implemented.

## Open

- ORIS token verification contract: method, parameters and response fields,
  including the person ID and email.
- Does ORIS verify user email addresses? Only then can `ORIS_EMAIL_VERIFIED` be
  set to true.
