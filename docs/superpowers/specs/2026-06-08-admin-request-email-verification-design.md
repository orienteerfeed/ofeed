# Admin: Request Email Verification

**Date:** 2026-06-08
**Status:** Approved (design)

## Summary

Add an admin action that re-sends the email-verification message to a user. The
email is identical to the one sent automatically after signup (same
`welcome.ejs` template, same subject, same 48h verification link). The action is
exposed in the admin users table, available only for users whose email is not
yet verified.

## Motivation

After signup, OFeed sends a verification email containing a 48h link. If the
user never receives it, lets it expire, or loses it, there is currently no way
for an administrator to trigger a fresh verification email. This adds that
capability.

## Scope

In scope:

- New REST endpoint to trigger a verification email for a specific user.
- Reuse of the existing verification email template, subject, and link/token
  generation.
- Admin users table UI: move the per-row actions into a dropdown menu and add a
  "Request verification" item, shown only for unverified users.
- OpenAPI spec, Postman collection, i18n, and tests.

Out of scope:

- Changing the verification email template or subject.
- Rate limiting (admin-only endpoint behind `requireAdminAccess`).
- Self-service "resend verification" for end users (e.g. from the profile page).
- Refactoring the signup path (optional, see "Optional follow-up").

## Background (existing behavior)

- `apps/server/src/modules/auth/auth.service.ts`
  - `sendVerificationEmailHelper(firstname, lastname, email, verificationLink)`
    renders `views/emails/welcome.ejs` and sends via `utils/email.sendEmail`
    with subject `OFeed - verify your email`. Sending is fire-and-forget
    (`onSuccess` / `onError` callbacks; not awaited).
  - `signupUser(...)` builds the link as `${app_base_url}/${verificationToken}`
    where `verificationToken = generateJwtTokenForLink(user.id)` (48h) and
    `app_base_url` comes from the request.
- `apps/server/src/utils/jwtToken.ts` → `generateJwtTokenForLink(userId)`.
- The base URL is provided by the client via the
  `x-orienteerfeed-app-activate-user-url` header. The client computes it as
  `window.location.origin + PATHNAMES.getVerifyEmail().to`. The server appends
  `/${token}`. Signup falls back to `"localhost"` when the header is absent.
- Admin user actions follow `admin.routes.ts → admin.handlers.ts →
  admin.service.ts`. Existing per-user actions: `PATCH /users/:userId`
  (active toggle), `DELETE /users/:userId`.
- Admin errors use `AdminUserActionError` (carries an HTTP status code); handlers
  translate it into clean error envelopes, falling back to a generic 500 only
  for unexpected errors.
- Client admin users table: `apps/client/src/pages/Admin/AdminUsersPage.tsx`
  currently renders inline Activate/Deactivate and Delete buttons per row and
  shows an `EmailVerifiedBadge` (`verifiedAt={user.emailVerifiedAt}`).

## Design

### Server

**`auth.service.ts` — new exported helper**

```ts
export async function sendVerificationEmailForUser(params: {
  userId: number;
  firstname: string;
  lastname: string;
  email: string;
  appBaseUrl: string;
}): Promise<void> {
  const token = generateJwtTokenForLink(params.userId);
  const verificationLink = `${params.appBaseUrl}/${token}`;
  await sendVerificationEmailHelper(
    params.firstname,
    params.lastname,
    params.email,
    verificationLink,
  );
}
```

This isolates "how to build and send a verification email for a user" in the
auth domain. It mirrors exactly what `signupUser` does today.

**`admin.service.ts` — new function**

```ts
export async function requestAdminUserEmailVerification(
  prisma,
  params: { targetUserId: number; appBaseUrl: string },
) {
  const user = await prisma.user.findUnique({
    where: { id: params.targetUserId },
    select: {
      id: true,
      email: true,
      firstname: true,
      lastname: true,
      role: true,
      organisation: true,
      active: true,
      emailVerifiedAt: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new AdminUserActionError('Admin user target not found', 404);
  }
  if (user.emailVerifiedAt) {
    throw new AdminUserActionError('User email is already verified.', 409);
  }

  await sendVerificationEmailForUser({
    userId: user.id,
    firstname: user.firstname,
    lastname: user.lastname,
    email: user.email,
    appBaseUrl: params.appBaseUrl,
  });

  return adminUserMutationResultSchema.parse({ user: mapUserListItem(user) });
}
```

- Guard (not-found / already-verified) lives here, producing clean status codes
  via `AdminUserActionError`.
- The user `select` includes `emailVerifiedAt` (note: the existing
  `loadAdminUserForMutation` does **not** select it; this function uses its own
  select rather than reusing that helper).
- Email sending is delegated to the auth helper (cross-module import
  `admin.service → auth.service`, which is permitted; only GraphQL root
  registration cross-imports are disallowed).

**`admin.handlers.ts` — new handler**

```ts
export async function requestAdminUserEmailVerificationHandler(c) {
  const adminUserId = getAdminUserId(c);
  const logContext = buildAdminLogContext(c, adminUserId);

  try {
    const targetUserId = parseAdminUserId(c.req.param('userId'));
    const appBaseUrl =
      c.req.header('x-orienteerfeed-app-activate-user-url') ?? 'localhost';

    const result = await requestAdminUserEmailVerification(prisma, {
      targetUserId,
      appBaseUrl,
    });

    logger.info('Admin requested user email verification', {
      ...logContext,
      results: { targetUserId, email: result.user.email },
    });

    return c.json(
      successResponse('Verification email requested', result, HTTP_STATUS.OK),
      HTTP_STATUS.OK,
    );
  } catch (error) {
    // 'Invalid admin user id' → 422; AdminUserActionError → its status code;
    // otherwise log + generic 500. Identical shape to deleteAdminUserHandler.
  }
}
```

The catch block mirrors `deleteAdminUserHandler` exactly (invalid id → 422,
`isAdminUserActionError` → `error.statusCode`, otherwise `logger.error` +
generic 500).

**`admin.routes.ts`**

```ts
router.post(
  '/users/:userId/request-email-verification',
  requestAdminUserEmailVerificationHandler,
);
```

**`admin.openapi.ts`** — add the endpoint spec: path param `userId`, optional
`x-orienteerfeed-app-activate-user-url` header, `200` success envelope
(`adminUserMutationResultSchema`), `404`, `409`, `422` error responses.

### Client

**`endpoints.ts`**

```ts
adminUserRequestEmailVerification: (userId: string | number): string =>
  `${apiPrefix}/admin/users/${userId}/request-email-verification`,
```

**`AdminUsersPage.tsx`**

- Replace the inline actions cell with a `DropdownMenu` (`⋯` trigger) using the
  existing `src/components/ui/dropdown-menu.tsx` primitive. Items:
  1. Activate / Deactivate (opens existing `activeToggleTarget` ConfirmDialog),
     disabled for the current user.
  2. **Request verification** — rendered only when `user.emailVerifiedAt == null`.
     Fires the mutation directly (no confirm dialog).
  3. Delete (opens existing `deleteTarget` ConfirmDialog), disabled for current
     user.
- New TanStack Query mutation: `POST` to
  `adminUserRequestEmailVerification(userId)` with header
  `x-orienteerfeed-app-activate-user-url = window.location.origin +
  PATHNAMES.getVerifyEmail().to`. On success: success toast + invalidate the
  admin users query. On error: error toast.

### Data flow

```
Admin clicks "Request verification"
  → client POST /admin/users/:id/request-email-verification
      header: x-orienteerfeed-app-activate-user-url
  → requireAdminAccess
  → requestAdminUserEmailVerificationHandler
  → requestAdminUserEmailVerification (guards: 404 / 409)
  → sendVerificationEmailForUser → generateJwtTokenForLink + sendVerificationEmailHelper
  → welcome.ejs email queued (fire-and-forget)
  → 200 { user } → toast + users-list refetch
```

## Error handling

| Condition                         | Status | Source                          |
| --------------------------------- | ------ | ------------------------------- |
| Invalid `userId` param            | 422    | `parseAdminUserId`              |
| User not found                    | 404    | `AdminUserActionError`          |
| Email already verified            | 409    | `AdminUserActionError`          |
| Unexpected (e.g. token gen) error | 500    | generic fallback + `logger.error` |
| Email transport failure           | n/a    | logged via `onError`; endpoint still returns 200 |

**Important semantic:** because email sending is fire-and-forget (consistent
with signup), a `200` means the email was *queued*, not *delivered*. The
client toast wording should reflect "verification email sent" without promising
delivery. The UI does not change `emailVerifiedAt`; the badge stays "unverified"
until the user actually clicks the link.

## Testing

**Server (`admin.service.test.ts`)** — add cases for
`requestAdminUserEmailVerification`:

- user not found → throws `AdminUserActionError` with status 404;
- already verified (`emailVerifiedAt` set) → throws with status 409;
- success (unverified) → calls the email helper with the expected link
  (`${appBaseUrl}/${token}`); the email helper / `sendEmail` is mocked.

Mock strategy mirrors the existing admin tests' hand-rolled `tx`/prisma mock;
stub `sendVerificationEmailForUser` (or `sendVerificationEmailHelper`) so no real
email is sent and assert invocation arguments.

**Client** — if the users table has a testable seam, add a test asserting the
"Request verification" item appears only when `emailVerifiedAt == null`.
Otherwise rely on the server tests and keep the UI change minimal.

**Also update:** `postman/collection.json` — add a request for the new endpoint
with assertions on the 200 envelope, plus a negative request (already-verified
or missing user) asserting the error status.

## i18n

Add keys under `Pages.Admin.Users.Actions` and a toast namespace, in all six
locales (`en, cs, es, de, sv, fr`):

- `Pages.Admin.Users.Actions.RequestVerification` — menu item label.
- Success toast (e.g. `Pages.Admin.Users.Toasts.VerificationSent`).
- Error toast (e.g. `Pages.Admin.Users.Toasts.VerificationFailed`).

(Exact key paths to match existing structure in `AdminUsersPage.tsx`.)

## Optional follow-up (not in this change)

`signupUser` could be refactored to call the new
`sendVerificationEmailForUser` helper to remove the duplicated token/link
construction. Deferred to avoid touching the working signup path in this change.

## Files touched

Server:

- `apps/server/src/modules/auth/auth.service.ts` (new helper)
- `apps/server/src/modules/admin/admin.service.ts` (new function)
- `apps/server/src/modules/admin/admin.handlers.ts` (new handler)
- `apps/server/src/modules/admin/admin.routes.ts` (new route)
- `apps/server/src/modules/admin/admin.openapi.ts` (spec)
- `apps/server/src/modules/admin/__tests__/admin.service.test.ts` (tests)
- `apps/server/postman/collection.json`

Client:

- `apps/client/src/lib/api/endpoints.ts`
- `apps/client/src/pages/Admin/AdminUsersPage.tsx`
- `apps/client/src/i18n/locales/{en,cs,es,de,sv,fr}/...`
