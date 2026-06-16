# Admin Request Email Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin action that re-sends the signup verification email to an unverified user.

**Architecture:** New REST endpoint `POST /rest/v1/admin/users/:userId/request-email-verification`. Guard logic (user exists, still unverified) lives in `admin.service` using the existing `AdminUserActionError` pattern; the email itself is built and sent by a small extracted helper in `auth.service` that reuses the exact signup template, subject, and 48h link/token. The admin users table moves its per-row buttons into a dropdown menu and adds a "Request verification" item shown only for unverified users.

**Tech Stack:** Hono, Prisma 7, Zod OpenAPI, Pino (server); React 19, TanStack Query, shadcn dropdown-menu, i18next, sonner (client); Vitest.

**Spec:** `docs/superpowers/specs/2026-06-08-admin-request-email-verification-design.md`

---

## File Structure

Server:
- `apps/server/src/modules/auth/auth.service.ts` — add `sendVerificationEmailForUser` (extracted, reused).
- `apps/server/src/modules/admin/admin.service.ts` — add `requestAdminUserEmailVerification` (guards + delegation; injectable email sender for testability).
- `apps/server/src/modules/admin/admin.handlers.ts` — add `requestAdminUserEmailVerificationHandler`.
- `apps/server/src/modules/admin/admin.routes.ts` — register the POST route.
- `apps/server/src/modules/admin/admin.openapi.ts` — add the endpoint spec.
- `apps/server/src/modules/admin/__tests__/admin.service.test.ts` — tests for the new service function.
- `apps/server/postman/collection.json` — add a request for the new endpoint.

Client:
- `apps/client/src/lib/api/endpoints.ts` — add endpoint URL builder.
- `apps/client/src/hooks/useApi.ts` — allow optional per-request headers on `post`.
- `apps/client/src/pages/Admin/admin.hooks.ts` — add `useAdminUserRequestVerificationMutation`.
- `apps/client/src/pages/Admin/AdminUsersPage.tsx` — dropdown-menu actions + handler.
- `apps/client/src/i18n/locales/{en,cs,es,de,sv}/translation.json` — new keys (fr has no Admin section; skip).

Notes for the implementer:
- Run all server commands from `apps/server`, all client commands from `apps/client`.
- Cross-module import `admin.service → auth.service` is allowed (only GraphQL root-registration cross-imports are disallowed).
- `HTTP_STATUS` (in `apps/server/src/constants/http.ts`) has no `CONFLICT` member; `AdminUserActionError` carries a numeric status, and the handler returns `error.statusCode` directly, so `409` works via the literal number.

---

## Task 1: Server — extract `sendVerificationEmailForUser` in auth.service

**Files:**
- Modify: `apps/server/src/modules/auth/auth.service.ts`

This is a pure extraction of logic that already exists inside `signupUser` (token generation + link build + `sendVerificationEmailHelper`). No isolated unit test: it only wires together `generateJwtTokenForLink` (already imported at the top of the file) and the existing, already-used `sendVerificationEmailHelper`, both of which carry heavy module dependencies (ejs, email transport). Its behavior is covered through the admin.service tests in Task 2 (via the injected default) and by the unchanged signup path.

- [ ] **Step 1: Add the helper directly after `sendVerificationEmailHelper`**

Insert immediately after the closing brace of `sendVerificationEmailHelper` (currently ends at line 56, before the `__filename`/`__dirname` block):

```ts
export async function sendVerificationEmailForUser(params: {
  userId: number;
  firstname: string;
  lastname: string;
  email: string;
  appBaseUrl: string;
}): Promise<void> {
  const verificationToken = generateJwtTokenForLink(params.userId);
  const verificationLink = `${params.appBaseUrl}/${verificationToken}`;
  await sendVerificationEmailHelper(
    params.firstname,
    params.lastname,
    params.email,
    verificationLink,
  );
}
```

- [ ] **Step 2: (Optional, no behavior change) reuse the helper in `signupUser`**

Skip this step unless you want to remove the duplication now. If you do it, replace these lines in `signupUser` (currently lines 151-153):

```ts
    const verificationToken = generateJwtTokenForLink(user.id);
    const verificationLink = `${app_base_url}/${verificationToken}`;
    await sendVerificationEmailHelper(firstname, lastname, email, verificationLink);
```

with:

```ts
    await sendVerificationEmailForUser({
      userId: user.id,
      firstname,
      lastname,
      email,
      appBaseUrl: app_base_url,
    });
```

- [ ] **Step 3: Type-check**

Run: `pnpm type-check`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/modules/auth/auth.service.ts
git commit -m "refactor(auth): extract sendVerificationEmailForUser helper"
```

---

## Task 2: Server — `requestAdminUserEmailVerification` (TDD)

**Files:**
- Modify: `apps/server/src/modules/admin/admin.service.ts`
- Test: `apps/server/src/modules/admin/__tests__/admin.service.test.ts`

The new function loads the target user, throws `AdminUserActionError` for not-found (404) and already-verified (409), then delegates to the email sender. The sender is injectable via a `deps` argument (default = the real `sendVerificationEmailForUser`) so the test can assert arguments without sending email or mocking modules.

- [ ] **Step 1: Write the failing tests**

Add the import at the top of the test file (extend the existing import block from `../admin.service.js`):

```ts
import {
  __adminServiceInternals,
  deleteAdminUser,
  getAdminDashboard,
  getAdminEvents,
  getAdminUsers,
  requestAdminUserEmailVerification,
  updateAdminUserActive,
} from '../admin.service.js';
```

Add these tests inside the `describe('admin service', ...)` block, immediately after the existing `it('deletes admin user account and related auth data', ...)` test (before the closing `});` of the describe):

```ts
  it('sends a verification email for an unverified user', async () => {
    const sent: unknown[] = [];
    const prisma = {
      user: {
        findUnique: async ({ where }: { where: { id: number } }) => ({
          id: where.id,
          email: 'user@example.com',
          firstname: 'Uma',
          lastname: 'User',
          role: 'USER' as const,
          organisation: null,
          active: true,
          emailVerifiedAt: null,
          createdAt: new Date('2026-02-10T10:00:00.000Z'),
        }),
      },
    };

    const result = await requestAdminUserEmailVerification(
      prisma,
      { targetUserId: 2, appBaseUrl: 'https://app.test/auth/verify-email' },
      {
        sendVerificationEmail: async (payload) => {
          sent.push(payload);
        },
      },
    );

    expect(result.user.id).toBe(2);
    expect(sent).toEqual([
      {
        userId: 2,
        firstname: 'Uma',
        lastname: 'User',
        email: 'user@example.com',
        appBaseUrl: 'https://app.test/auth/verify-email',
      },
    ]);
  });

  it('rejects verification request for a missing user', async () => {
    const prisma = {
      user: {
        findUnique: async () => null,
      },
    };

    await expect(
      requestAdminUserEmailVerification(
        prisma,
        { targetUserId: 999, appBaseUrl: 'https://app.test/auth/verify-email' },
        { sendVerificationEmail: async () => undefined },
      ),
    ).rejects.toMatchObject({
      message: 'Admin user target not found',
      statusCode: 404,
    });
  });

  it('rejects verification request when email already verified', async () => {
    const sent: unknown[] = [];
    const prisma = {
      user: {
        findUnique: async ({ where }: { where: { id: number } }) => ({
          id: where.id,
          email: 'user@example.com',
          firstname: 'Uma',
          lastname: 'User',
          role: 'USER' as const,
          organisation: null,
          active: true,
          emailVerifiedAt: new Date('2026-05-01T10:00:00.000Z'),
          createdAt: new Date('2026-02-10T10:00:00.000Z'),
        }),
      },
    };

    await expect(
      requestAdminUserEmailVerification(
        prisma,
        { targetUserId: 2, appBaseUrl: 'https://app.test/auth/verify-email' },
        {
          sendVerificationEmail: async (payload) => {
            sent.push(payload);
          },
        },
      ),
    ).rejects.toMatchObject({
      message: 'User email is already verified.',
      statusCode: 409,
    });
    expect(sent).toEqual([]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/modules/admin/__tests__/admin.service.test.ts`
Expected: FAIL — `requestAdminUserEmailVerification` is not exported (import error / not a function).

- [ ] **Step 3: Implement the service function**

In `apps/server/src/modules/admin/admin.service.ts`, add the import near the top imports (after the existing `@repo/shared` import block):

```ts
import { sendVerificationEmailForUser } from '../auth/auth.service.js';
```

Add the function immediately after `deleteAdminUser` (after its closing `}` at line 474, before `getAdminEvents`):

```ts
export async function requestAdminUserEmailVerification(
  prisma,
  params: {
    targetUserId: number;
    appBaseUrl: string;
  },
  deps: {
    sendVerificationEmail?: typeof sendVerificationEmailForUser;
  } = {},
) {
  const sendVerificationEmail = deps.sendVerificationEmail ?? sendVerificationEmailForUser;

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

  await sendVerificationEmail({
    userId: user.id,
    firstname: user.firstname,
    lastname: user.lastname,
    email: user.email,
    appBaseUrl: params.appBaseUrl,
  });

  return adminUserMutationResultSchema.parse({
    user: mapUserListItem(user),
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/modules/admin/__tests__/admin.service.test.ts`
Expected: PASS (all tests, including the three new ones).

- [ ] **Step 5: Type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/modules/admin/admin.service.ts apps/server/src/modules/admin/__tests__/admin.service.test.ts
git commit -m "feat(admin): add requestAdminUserEmailVerification service"
```

---

## Task 3: Server — handler + route

**Files:**
- Modify: `apps/server/src/modules/admin/admin.handlers.ts`
- Modify: `apps/server/src/modules/admin/admin.routes.ts`

The handler mirrors `deleteAdminUserHandler` exactly (same catch structure) and reads the verification base URL from the `x-orienteerfeed-app-activate-user-url` header with the same `'localhost'` fallback as signup. Handlers in this module have no isolated unit tests (consistent with existing handlers); they are exercised by Postman in Task 5.

- [ ] **Step 1: Import the new service function**

In `apps/server/src/modules/admin/admin.handlers.ts`, extend the import from `./admin.service.js` (currently lines 14-21) to include `requestAdminUserEmailVerification`:

```ts
import {
  deleteAdminUser,
  getAdminDashboard,
  getAdminEvents,
  getAdminUsers,
  isAdminUserActionError,
  requestAdminUserEmailVerification,
  updateAdminUserActive,
} from './admin.service.js';
```

- [ ] **Step 2: Add the handler**

Add immediately after `deleteAdminUserHandler` (after its closing `}` at line 296):

```ts
export async function requestAdminUserEmailVerificationHandler(c) {
  const adminUserId = getAdminUserId(c);
  const logContext = buildAdminLogContext(c, adminUserId);

  try {
    const targetUserId = parseAdminUserId(c.req.param('userId'));
    const appBaseUrl = c.req.header('x-orienteerfeed-app-activate-user-url') ?? 'localhost';

    const result = await requestAdminUserEmailVerification(prisma, {
      targetUserId,
      appBaseUrl,
    });

    logger.info('Admin requested user email verification', {
      ...logContext,
      results: {
        targetUserId,
        email: result.user.email,
      },
    });

    return c.json(
      successResponse('Verification email requested', result, HTTP_STATUS.OK),
      HTTP_STATUS.OK,
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid admin user id') {
      return c.json(
        errorResponse('Invalid admin user request', HTTP_STATUS.UNPROCESSABLE_CONTENT),
        HTTP_STATUS.UNPROCESSABLE_CONTENT,
      );
    }

    if (isAdminUserActionError(error)) {
      logger.warn('Admin user email verification request rejected', {
        ...logContext,
        error: error.message,
      });

      return c.json(errorResponse(error.message, error.statusCode), error.statusCode);
    }

    logger.error('Failed to request admin user email verification', {
      ...logContext,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return c.json(
      errorResponse('Failed to request admin user email verification', HTTP_STATUS.INTERNAL_SERVER_ERROR),
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}
```

- [ ] **Step 3: Register the route**

In `apps/server/src/modules/admin/admin.routes.ts`, add `requestAdminUserEmailVerificationHandler` to the import block from `./admin.handlers.js`, then add the route immediately after the existing `router.delete('/users/:userId', deleteAdminUserHandler);` (line 30):

```ts
router.post('/users/:userId/request-email-verification', requestAdminUserEmailVerificationHandler);
```

- [ ] **Step 4: Type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 5: Lint the changed files**

Run: `pnpm exec eslint src/modules/admin/admin.handlers.ts src/modules/admin/admin.routes.ts --max-warnings=0 --no-inline-config`
Expected: no errors (a `[WARN] Failed to replace env in config: ${GITLAB_NPM_TOKEN}` line is unrelated noise).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/modules/admin/admin.handlers.ts apps/server/src/modules/admin/admin.routes.ts
git commit -m "feat(admin): add request-email-verification endpoint"
```

---

## Task 4: Server — OpenAPI spec

**Files:**
- Modify: `apps/server/src/modules/admin/admin.openapi.ts`

- [ ] **Step 1: Add the path entry**

In `ADMIN_OPENAPI_PATHS`, add a new key immediately after the `[adminUserPath]: { ... }` block (which ends around line 280, after the `delete:` operation). Reuse the existing `userMutationOkResponse` and `okJson` helpers and the `bearerSecurity` constant already used in the file:

```ts
  [`${adminUserPath}/request-email-verification`]: {
    post: {
      tags: [ADMIN_OPENAPI.tag],
      operationId: 'adminRequestUserEmailVerification',
      summary: 'Send a verification email to a user',
      security: bearerSecurity,
      parameters: [
        {
          name: 'userId',
          in: 'path',
          required: true,
          schema: { type: 'integer', minimum: 1 },
        },
        {
          name: 'x-orienteerfeed-app-activate-user-url',
          in: 'header',
          required: false,
          schema: { type: 'string' },
          description: 'Base URL for the verification link; the 48h token is appended as /{token}.',
        },
      ],
      responses: {
        200: userMutationOkResponse,
        401: okJson('Unauthorized'),
        403: okJson('Forbidden'),
        404: okJson('User not found'),
        409: okJson('Email already verified'),
        422: okJson('Invalid admin user request'),
      },
    },
  },
```

- [ ] **Step 2: Type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/modules/admin/admin.openapi.ts
git commit -m "docs(admin): document request-email-verification endpoint"
```

---

## Task 5: Server — Postman collection

**Files:**
- Modify: `apps/server/postman/collection.json`

Mirror the existing optional admin-user scenario requests (skip guard via `runAdminScenarios` + `adminBearerToken`). Because the target user's verification state is not guaranteed in CI, the test accepts either 200 (sent) or 409 (already verified).

- [ ] **Step 1: Add a new request item**

Insert this object into the same `item` array that holds the `[PATCH] ... Reactivate target user` request, immediately after that request's object (i.e. after the closing `}` of the Reactivate item near line 10380; add a trailing comma on the previous item if needed):

```json
{
  "name": "[POST] /rest/v1/admin/users/{{adminTargetUserId}}/request-email-verification - Resend verification (optional)",
  "request": {
    "method": "POST",
    "header": [
      {
        "key": "x-orienteerfeed-app-activate-user-url",
        "value": "http://localhost:3000/auth/verify-email",
        "type": "text"
      }
    ],
    "url": {
      "raw": "{{baseUrl}}/rest/v1/admin/users/{{adminTargetUserId}}/request-email-verification",
      "host": ["{{baseUrl}}"],
      "path": ["rest", "v1", "admin", "users", "{{adminTargetUserId}}", "request-email-verification"]
    },
    "auth": {
      "type": "bearer",
      "bearer": [
        {
          "key": "token",
          "value": "{{adminBearerToken}}",
          "type": "string"
        }
      ]
    }
  },
  "response": [],
  "event": [
    {
      "listen": "prerequest",
      "script": {
        "type": "text/javascript",
        "exec": [
          "const shouldRun = (pm.environment.get('runAdminScenarios') || 'false').toLowerCase() === 'true';",
          "const token = (pm.environment.get('adminBearerToken') || '').trim();",
          "if (!shouldRun || !token) {",
          "  if (pm.execution && typeof pm.execution.skipRequest === 'function') {",
          "    pm.execution.skipRequest();",
          "  }",
          "}",
          "",
          ""
        ]
      }
    },
    {
      "listen": "test",
      "script": {
        "type": "text/javascript",
        "exec": [
          "pm.test('Status is 200 or 409', function () { pm.expect([200, 409]).to.include(pm.response.code); });",
          "pm.test('Response is JSON', function () { pm.expect(pm.response.headers.get('Content-Type') || '').to.include('application/json'); });",
          "if (pm.response.code === 200) {",
          "  const body = pm.response.json();",
          "  pm.test('Returns target user', function () { pm.expect(body.results && body.results.user && body.results.user.id).to.exist; });",
          "}",
          ""
        ]
      }
    }
  ]
}
```

- [ ] **Step 2: Validate JSON**

Run: `node -e "JSON.parse(require('node:fs').readFileSync('postman/collection.json','utf8')); console.log('valid')"`
Expected: prints `valid`.

- [ ] **Step 3: Commit**

```bash
git add apps/server/postman/collection.json
git commit -m "test(admin): add postman request for resend verification"
```

---

## Task 6: Client — endpoint, useApi headers, mutation hook

**Files:**
- Modify: `apps/client/src/lib/api/endpoints.ts`
- Modify: `apps/client/src/hooks/useApi.ts`
- Modify: `apps/client/src/pages/Admin/admin.hooks.ts`

- [ ] **Step 1: Add the endpoint builder**

In `apps/client/src/lib/api/endpoints.ts`, add after the existing `adminUser` entry (line 49-50):

```ts
  adminUserRequestEmailVerification: (userId: string | number): string =>
    `${apiPrefix}/admin/users/${userId}/request-email-verification`,
```

- [ ] **Step 2: Allow optional headers on `useApi.post`**

In `apps/client/src/hooks/useApi.ts`, update `createHeaders` to merge extra headers:

```ts
  const createHeaders = (
    skipAuth: boolean = false,
    extraHeaders?: Record<string, string>
  ): Record<string, string> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (!skipAuth && token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return { ...headers, ...extraHeaders };
  };
```

Then update `post` to accept and forward headers:

```ts
  const post = async <T>(
    endpoint: string,
    data?: unknown,
    options?: { skipAuth?: boolean; headers?: Record<string, string> }
  ): Promise<T> => {
    const url = `${config.BASE_API_URL}${endpoint}`;
    log(`POST ${url}`, data);

    const response = await fetch(url, {
      method: 'POST',
      headers: createHeaders(options?.skipAuth, options?.headers),
      body: JSON.stringify(data),
    });

    const result = await handleResponse<T>(response);
    log(`POST ${url} success`, result);
    return result;
  };
```

- [ ] **Step 3: Add the mutation hook**

In `apps/client/src/pages/Admin/admin.hooks.ts`, add the import for `PATHNAMES` near the other `@/` imports:

```ts
import { PATHNAMES } from '@/lib/paths/pathnames';
```

Add the hook immediately after `useAdminUserDeleteMutation`:

```ts
export function useAdminUserRequestVerificationMutation() {
  const api = useApi();

  return useMutation({
    mutationFn: async (userId: number) =>
      adminUserMutationResultSchema.parse(
        await api.post(
          ENDPOINTS.adminUserRequestEmailVerification(userId),
          undefined,
          {
            headers: {
              'x-orienteerfeed-app-activate-user-url':
                window.location.origin + PATHNAMES.getVerifyEmail().to,
            },
          }
        )
      ),
  });
}
```

- [ ] **Step 4: Type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/lib/api/endpoints.ts apps/client/src/hooks/useApi.ts apps/client/src/pages/Admin/admin.hooks.ts
git commit -m "feat(client): add admin resend-verification mutation"
```

---

## Task 7: Client — dropdown actions in AdminUsersPage

**Files:**
- Modify: `apps/client/src/pages/Admin/AdminUsersPage.tsx`

Move the inline Activate/Delete buttons into a dropdown menu and add a "Request verification" item shown only when `user.emailVerifiedAt` is null. Request verification fires directly (no confirm dialog); Activate/Deactivate and Delete keep their existing ConfirmDialogs.

- [ ] **Step 1: Update imports**

Replace the lucide-react import (line 4) to add the icons used by the menu:

```ts
import { Mail, MoreHorizontal, Power, PowerOff, Trash2 } from 'lucide-react';
```

Add the dropdown-menu UI import after the existing `@/components/ui/table` import block (after line 21):

```ts
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
```

Update the hooks import (lines 26-30) to include the new mutation:

```ts
import {
  useAdminUserActiveMutation,
  useAdminUserDeleteMutation,
  useAdminUserRequestVerificationMutation,
  useAdminUsersQuery,
} from './admin.hooks';
```

- [ ] **Step 2: Wire the mutation and handler**

After `const deleteUserMutation = useAdminUserDeleteMutation();` (line 54), add:

```ts
  const requestVerificationMutation = useAdminUserRequestVerificationMutation();
```

After the `handleDeleteUser` function (ends around line 137), add:

```ts
  const handleRequestVerification = async (user: AdminUserListItem) => {
    try {
      await requestVerificationMutation.mutateAsync(user.id);

      toast({
        title: t('Pages.Admin.Users.Toast.RequestVerificationSuccessTitle'),
        description: t('Pages.Admin.Users.Toast.RequestVerificationSuccessDescription', {
          name: `${user.firstname} ${user.lastname}`,
        }),
        variant: 'success',
      });

      await invalidateAdminQueries();
    } catch (mutationError) {
      toast({
        title: t('Pages.Admin.Users.Toast.RequestVerificationErrorTitle'),
        description:
          mutationError instanceof Error
            ? mutationError.message
            : t('Pages.Admin.Users.Toast.UnknownError'),
        variant: 'error',
      });
    }
  };
```

- [ ] **Step 3: Replace the actions cell**

Replace the entire actions `<TableCell>` block (currently lines 225-259, the `<TableCell><div className="flex flex-wrap items-center gap-2">...</div></TableCell>`) with:

```tsx
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-2">
                          <MoreHorizontal className="h-4 w-4" />
                          {t('Pages.Admin.Users.Actions.Menu')}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          disabled={isCurrentUser}
                          onSelect={() =>
                            setActiveToggleTarget({
                              user,
                              nextActive: !user.active,
                            })
                          }
                        >
                          {user.active ? (
                            <PowerOff className="mr-2 h-4 w-4" />
                          ) : (
                            <Power className="mr-2 h-4 w-4" />
                          )}
                          {user.active
                            ? t('Pages.Admin.Users.Actions.Deactivate')
                            : t('Pages.Admin.Users.Actions.Activate')}
                        </DropdownMenuItem>
                        {!user.emailVerifiedAt && (
                          <DropdownMenuItem
                            onSelect={() => handleRequestVerification(user)}
                          >
                            <Mail className="mr-2 h-4 w-4" />
                            {t('Pages.Admin.Users.Actions.RequestVerification')}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={isCurrentUser}
                          onSelect={() => setDeleteTarget(user)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t('Pages.Admin.Users.Actions.Delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
```

Note: if `DropdownMenuItem` does not accept a `variant` prop in this codebase's shadcn version, drop `variant="destructive"` and instead add `className="text-destructive focus:text-destructive"`. Verify with: `grep -n "variant" apps/client/src/components/ui/dropdown-menu.tsx`.

- [ ] **Step 4: Type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 5: Lint the changed file**

Run: `pnpm exec eslint src/pages/Admin/AdminUsersPage.tsx`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/pages/Admin/AdminUsersPage.tsx
git commit -m "feat(client): admin users actions dropdown with resend verification"
```

---

## Task 8: Client — i18n keys

**Files:**
- Modify: `apps/client/src/i18n/locales/en/translation.json`
- Modify: `apps/client/src/i18n/locales/cs/translation.json`
- Modify: `apps/client/src/i18n/locales/es/translation.json`
- Modify: `apps/client/src/i18n/locales/de/translation.json`
- Modify: `apps/client/src/i18n/locales/sv/translation.json`

Each of these five files has `Pages.Admin.Users.Actions` (with `Activate`/`Deactivate`/`Delete`) and `Pages.Admin.Users.Toast`. The `fr` locale has no `Admin` section, so it falls back to English — do not edit `fr`.

Add to `Pages.Admin.Users.Actions`: `Menu` and `RequestVerification`.
Add to `Pages.Admin.Users.Toast`: `RequestVerificationSuccessTitle`, `RequestVerificationSuccessDescription`, `RequestVerificationErrorTitle`.

- [ ] **Step 1: en** — set `Actions` and `Toast` (the `Actions` object currently ends after `"Delete": "Delete"`; add the new keys; remember to add a comma after `"Delete": "Delete"`):

`Actions`:
```json
          "Activate": "Activate",
          "Deactivate": "Deactivate",
          "Delete": "Delete",
          "Menu": "Actions",
          "RequestVerification": "Resend verification email"
```
`Toast` (add before the closing brace, after `"UnknownError"`; add a comma after `UnknownError`):
```json
          "UnknownError": "An unexpected error occurred.",
          "RequestVerificationSuccessTitle": "Verification email sent",
          "RequestVerificationSuccessDescription": "A verification email was sent to {{name}}.",
          "RequestVerificationErrorTitle": "Failed to send verification email"
```

- [ ] **Step 2: cs** — same keys, Czech values:

`Actions`:
```json
          "Menu": "Akce",
          "RequestVerification": "Znovu odeslat ověřovací e-mail"
```
`Toast`:
```json
          "RequestVerificationSuccessTitle": "Ověřovací e-mail odeslán",
          "RequestVerificationSuccessDescription": "Ověřovací e-mail byl odeslán uživateli {{name}}.",
          "RequestVerificationErrorTitle": "Nepodařilo se odeslat ověřovací e-mail"
```

- [ ] **Step 3: es** — Spanish values:

`Actions`:
```json
          "Menu": "Acciones",
          "RequestVerification": "Reenviar correo de verificación"
```
`Toast`:
```json
          "RequestVerificationSuccessTitle": "Correo de verificación enviado",
          "RequestVerificationSuccessDescription": "Se envió un correo de verificación a {{name}}.",
          "RequestVerificationErrorTitle": "No se pudo enviar el correo de verificación"
```

- [ ] **Step 4: de** — German values:

`Actions`:
```json
          "Menu": "Aktionen",
          "RequestVerification": "Bestätigungs-E-Mail erneut senden"
```
`Toast`:
```json
          "RequestVerificationSuccessTitle": "Bestätigungs-E-Mail gesendet",
          "RequestVerificationSuccessDescription": "Eine Bestätigungs-E-Mail wurde an {{name}} gesendet.",
          "RequestVerificationErrorTitle": "Bestätigungs-E-Mail konnte nicht gesendet werden"
```

- [ ] **Step 5: sv** — Swedish values:

`Actions`:
```json
          "Menu": "Åtgärder",
          "RequestVerification": "Skicka verifieringsmejl igen"
```
`Toast`:
```json
          "RequestVerificationSuccessTitle": "Verifieringsmejl skickat",
          "RequestVerificationSuccessDescription": "Ett verifieringsmejl skickades till {{name}}.",
          "RequestVerificationErrorTitle": "Det gick inte att skicka verifieringsmejlet"
```

- [ ] **Step 6: Validate all five JSON files**

Run:
```bash
for L in en cs es de sv; do node -e "JSON.parse(require('node:fs').readFileSync('src/i18n/locales/$L/translation.json','utf8')); console.log('$L valid')"; done
```
Expected: prints `<lang> valid` for each.

- [ ] **Step 7: Commit**

```bash
git add apps/client/src/i18n/locales/en/translation.json apps/client/src/i18n/locales/cs/translation.json apps/client/src/i18n/locales/es/translation.json apps/client/src/i18n/locales/de/translation.json apps/client/src/i18n/locales/sv/translation.json
git commit -m "i18n: add admin resend-verification strings"
```

---

## Task 9: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Server tests**

Run (from `apps/server`): `pnpm test`
Expected: PASS.

- [ ] **Step 2: Server type-check + GraphQL profile**

Run (from `apps/server`): `pnpm type-check` then `pnpm type-check:graphql`
Expected: PASS.

- [ ] **Step 3: Client type-check + tests**

Run (from `apps/client`): `pnpm type-check` then `pnpm test`
Expected: PASS.

- [ ] **Step 4: Lint both apps**

Run (from repo root): `pnpm lint`
Expected: PASS.

- [ ] **Step 5: Manual smoke (optional, requires running stack)**

Start the stack, open the admin users page, find an unverified user (the `EmailVerifiedBadge` shows unverified), open the `⋯` menu, click "Resend verification email", confirm the success toast. Confirm the menu item is absent for a verified user. Confirm the email arrives using the same template/subject as signup.

- [ ] **Step 6: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "chore(admin): finalize request email verification feature"
```

---

## Self-Review notes

- **Spec coverage:** endpoint (Tasks 3-4), reuse of signup email (Task 1), unverified-only availability (Task 2 guard + Task 7 conditional item), dropdown UI (Task 7), OpenAPI (Task 4), Postman (Task 5), i18n (Task 8), tests (Task 2, Task 9) — all covered.
- **Fire-and-forget semantic:** `sendVerificationEmailHelper` does not await transport; the endpoint returns 200 on "queued". Toast copy says "sent", not "delivered".
- **Type consistency:** `sendVerificationEmailForUser` param shape `{ userId, firstname, lastname, email, appBaseUrl }` is identical in Task 1 (definition), Task 2 (injected default + assertion), and is the type referenced by `deps.sendVerificationEmail`.
- **Deviation from spec:** none in behavior. The base URL travels via the `x-orienteerfeed-app-activate-user-url` header (as specified); Task 6 adds a backward-compatible optional `headers` option to `useApi.post` to carry it.
- **fr locale:** intentionally not edited (no `Admin` section; falls back to English).
