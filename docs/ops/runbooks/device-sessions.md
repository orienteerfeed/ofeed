# Device sessions and access signing keys

See [G4](../../specs/session-longevity.md) and [ADR 0006](../../architecture/adr/0006-device-sessions.md).
This is a breaking user-authentication cutover; OAuth client credentials and event Basic
credentials retain their separate lifecycle.

## Deployment

1. Apply the additive device-session migration before the API/web cutover.
2. Generate a P-256 key outside source control and store its bundle in Vault KV.
   The secret's `bundle` field is a JSON **string**, with this structure:

   ```json
   {
     "activeKid": "unique-key-id",
     "privateKey": "<PKCS8 PEM private key>",
     "publicKeys": { "unique-key-id": "<SPKI PEM public key>" }
   }
   ```

3. For Vault Agent delivery configure `vault.enabled`, `vault.role`, the existing
   `vault.secretPath`, and `vault.accessKeysSecretPath` for the key bundle. Give the
   application's Vault role read access to the latter path. The API pod renders
   `/vault/secrets/access-keys.json`, mode `0400`, owned by UID 1000. The file is
   separate from the shell-exported runtime environment. Existing externally
   managed secret delivery can mount an equivalent file and set
   `ACCESS_JWT_KEY_FILE` instead; never pass a private key to the browser.
4. Configure stable `ACCESS_JWT_ISSUER` and `ACCESS_JWT_AUDIENCE` values across
   replicas. Defaults are `ofeed` and `ofeed-user`. Keep `JWT_TOKEN_SECRET_KEY` for
   existing OAuth/link tokens; it no longer signs user access JWTs.
5. Deploy API and web together and require users/integrations to sign in again.
   Legacy user JWTs are rejected immediately. Missing/invalid initial access keys
   prevent the API from starting. Schema rollback is unnecessary for the additive
   tables; rolling back to old auth would restore acceptance of legacy tokens and
   must be treated as an explicit security decision.

The API reloads its bundle every five seconds. Vault Agent polls static KV secrets
every 30 seconds. A missing or invalid update keeps the last valid in-memory
bundle and increments `auth_key_reload_failures_total`. Alert on this metric and
`Access signing key reload failed`; avoid restarting otherwise healthy replicas
during a Vault outage. A fresh replica requires successful key delivery.

## Rotation

1. Generate a new P-256 key with a unique `kid`.
2. Add its public key to the existing bundle without changing `activeKid` or the
   current private key. Wait for **every** API replica to load and verify a
   synthetic new-key-signed token before switching issuance. Do not treat the
   Agent polling interval alone as proof of propagation.
3. Replace the active private key and `activeKid`, retaining both public keys.
   Confirm issuance and verification through each replica using synthetic accounts.
4. Retain the former public key for at least 15 minutes after the last replica
   stopped issuing with it, plus clock/deployment allowance. Then remove it.
   Restrict access to old private-key versions according to Vault policy.

Monitor `auth_refresh_total{outcome="success|invalid|rejected|reuse"}` and signing
key reload failures. Labels contain no account/device/token identifiers. A reuse
result invalidates the whole family; do not recover it by editing database rows.
Use device-session UI controls for lost devices. Refresh revocation is immediate;
issued access JWTs remain valid until expiry, at most 15 minutes, while deleted
or inactive accounts still fail the existing account check.

## Local development

Without `ACCESS_JWT_KEY_FILE`, non-production processes generate ephemeral keys
in memory. Restarts invalidate outstanding access JWTs; refresh credentials can
obtain replacements. For stable keys across local processes run:

```sh
node apps/server/scripts/create-access-key-bundle.ts /private/tmp/ofeed-access-keys.json
```

Set the API's `ACCESS_JWT_KEY_FILE` to that destination. The script refuses
repository paths and existing files, writes mode `0600`, and never prints keys.
Use generated ephemeral fixtures in tests. Never commit private key fixtures.

## Browser and native integration

Browser signin is GraphQL; refresh/logout are REST. All cookie-setting/consuming
browser auth requests require JSON, `X-Ofeed-Session: web`, and an exact allowed
`Origin` from `CORS_ORIGIN`. Refresh credentials use host-only HttpOnly cookies,
`Secure` in production, `SameSite=Lax`, and a lifetime capped by the family's
current deadline. API and web must be same-site; credentialed CORS must list their
exact origins. Local HTTP development is supported without `Secure`.

Access tokens stay in memory. Web Locks serialize credential operations across
same-origin tabs; BroadcastChannel distributes access updates and logout.
Supported browsers must provide Web Locks in a secure context (HTTPS or localhost).
Only installation UUID and nonsecret session-state markers persist locally.
Authenticated sockets expire with retryable close code `4403`; reconnection
awaits the shared refresh coordinator and resubscribes with the new access token.
Temporary renewal failures retain the credential and use bounded reconnect backoff.
Offline logout sets a persistent signed-out marker, reports unconfirmed server
revocation, and retries revocation on reconnect without silently restoring login.

REST native signin returns the access/refresh pair in `results.data`. Send
`{ refreshToken, deviceId }` to refresh/logout; atomically replace stored refresh
credentials after success. Electron stores credentials using main-process
`safeStorage`, with no renderer/localStorage exposure. Expo uses
`expo-secure-store`. Those clients are maintained outside this repository.

Refresh proactively two minutes before access expiry and on the first auth
failure; share one refresh among concurrent operations and retry each operation
once with the original payload and idempotency key. Do not refresh for 403s.
Temporary network/server failures preserve credentials and use bounded backoff.

Strict rotation means a successful refresh with a lost response can strand the
client: repeating the consumed credential revokes the family. Thirty-day
inactivity, the 90-day absolute limit, revocation and reuse rejection all require
signin. Preserve local outboxes across this transition and resume only for their
original authenticated user. Queues, Electron storage and Expo storage require
acceptance checks in those applications; the API cannot guarantee their durability.

## Verification

`SESSION_TEST_DATABASE_URL` opts into destructive-fixture tests only for a local
database named `ofeed_session_test` (or with an underscore suffix). Apply repository
migrations to that disposable database, then run the server session integration
suite. Shared contract build, server/client type checks and Vitest suites cover
normal validation. Browser checks cover reload, simultaneous tabs, session/device
revocation and subscription reconnect; never clone a saved rotating refresh
credential into independent test contexts.
