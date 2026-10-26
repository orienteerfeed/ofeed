# Session longevity (G4)

Status: implemented; live browser acceptance checks pending availability. Issue: creation blocked by the repository tool policy; maintainer must create/link the G4 issue.

## Goal and acceptance criteria

Signin requires deviceId (UUID) and deviceName (1–100 characters). Access tokens are ES256 JWTs with sub, iat, exp, jti, sid, issuer and audience, valid for 900 seconds. Signing keys come from a Vault Agent JSON file with kid rotation. Legacy non-expiring user JWTs are rejected. OAuth client tokens and event Basic authentication remain separate.

Opaque 256-bit refresh tokens are stored only as SHA-256 hashes. Each refresh consumes its generation and creates one successor. A consumed-token replay revokes the family, including after a lost response. Expiry is 30 days sliding, capped at 90 days from signin. Device IDs identify installations; they are not cryptographic proof of device possession.

REST /rest/v1/auth/signin returns accessToken, expiresIn, refreshToken and user metadata in the existing envelope. POST /refresh accepts refreshToken and deviceId for native clients; browser clients use an HttpOnly cookie and deviceId with Origin/custom-header protection. POST /logout revokes the family even after access expiry. GraphQL signin sets the browser cookie and returns accessToken, expiresIn and user. currentSessions and revokeDevice expose only caller-owned device sessions.

Password changes, password reset and account deletion revoke all families transactionally. Signup, email verification and reset completion direct users to signin rather than issue tokens. Revocation affects refresh immediately; access remains valid at most 15 minutes, subject to existing active-account checks.

## Browser and external clients

Keep access tokens in memory, refresh credentials in Secure HttpOnly SameSite=Lax host-only cookies, and only nonsecret device metadata in localStorage. Refresh two minutes before expiry and after the first authentication failure, single-flight across tabs. Retry each operation once without changing its body/idempotency key. Temporary network/server failures preserve authentication; terminal refresh rejection requires signin. Bootstrap before protected guards; reconnect authenticated subscriptions after rotation and close sockets at JWT expiry.

Electron and Expo are external repositories: main-process safeStorage and expo-secure-store respectively. Queues survive reauthentication, are scoped to their original user, and preserve payloads/idempotency keys. Offline expiry, revocation and a lost refresh response under strict rotation require signin.

## Tests and rollout

Test JWT validation/rotation/cutover, refresh boundary deadlines/concurrency/replay, account-change races, session ownership, cookies/CSRF/CORS/redaction, refresh retries/bootstrap/multi-tab/logout, and WebSocket expiry. Validate migration against MariaDB, regenerate Prisma, rebuild shared contracts, run focused server/client checks and browser flows. Deploy additive migration and Vault keys before coordinated API/web cutover. See ADR 0006 and the session operations runbook.
