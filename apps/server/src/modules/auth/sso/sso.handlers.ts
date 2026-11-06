import { deviceMetadataSchema } from '@repo/shared';
import { z } from '@hono/zod-openapi';

import env from '../../../config/env.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { getErrorDetails, logEndpoint } from '../../../lib/http/endpoint-logger.js';
import { getJwtNumericUserId, requireJwtAuth } from '../../../middlewares/require-jwt.js';
import type { AppOpenAPI } from '../../../types/index.js';
import {
  error as errorResponse,
  success as successResponse,
  validation as validationResponse,
} from '../../../utils/responseApi.js';
import { AUTH_OPENAPI } from '../auth.openapi.js';
import { refreshCookie } from '../session-cookie.js';

import { getSsoProvider, listEnabledSsoProviders } from './providers.js';
import { SsoError } from './sso.errors.js';
import {
  createSsoSession,
  listUserIdentities,
  resolveSsoUser,
  unlinkUserIdentity,
} from './sso.service.js';
import { consumeSsoStateCookie, newSsoStateValue, setSsoStateCookie } from './sso.state.js';

const SSO_COOKIE_PATH = `${AUTH_OPENAPI.basePath}/sso`;

const startQuerySchema = deviceMetadataSchema.extend({
  mode: z.enum(['login', 'link']).default('login'),
});

function clientCallbackUrl(params: Record<string, string>) {
  const url = new URL('/auth/sso/callback', env.CLIENT_APP_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

function toSsoError(error: unknown): SsoError | null {
  if (error instanceof SsoError) return error;
  // Concurrent create or a second identity of the same provider for one user.
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return new SsoError('identity_taken');
  }
  return null;
}

export function registerSsoRoutes(router: AppOpenAPI) {
  router.get('/sso/providers', (c) =>
    c.json(successResponse('OK', { data: { providers: listEnabledSsoProviders() } }, 200), 200),
  );

  router.get('/sso/identities', requireJwtAuth, async (c) => {
    const userId = getJwtNumericUserId(c) as number;
    const identities = await listUserIdentities(userId);
    return c.json(successResponse('OK', { data: { identities } }, 200), 200);
  });

  router.get('/sso/:provider/start', async (c) => {
    const provider = getSsoProvider(c.req.param('provider'));
    if (!provider) return c.json(errorResponse('Not Found', 404), 404);

    const parsed = startQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return c.json(validationResponse('Invalid SSO start parameters'), 422);

    const { mode, deviceId, deviceName } = parsed.data;
    const userId = getJwtNumericUserId(c);
    if (mode === 'link' && !userId) {
      return c.json(errorResponse('Unauthorized: Invalid or missing credentials.', 401), 401);
    }

    const state = newSsoStateValue();
    setSsoStateCookie(c, SSO_COOKIE_PATH, {
      provider: provider.id,
      state,
      deviceId,
      deviceName,
      mode,
      ...(mode === 'link' && userId ? { userId } : {}),
    });
    return c.json(
      successResponse('OK', { data: { authorizeUrl: provider.authorizeUrl(state) } }, 200),
      200,
    );
  });

  // Top-level redirect from the provider: no Origin/x-ofeed-session headers, the signed
  // single-use state cookie is what ties the callback to the browser that started it.
  router.get('/sso/:provider/callback', async (c) => {
    const provider = getSsoProvider(c.req.param('provider'));
    if (!provider) return c.json(errorResponse('Not Found', 404), 404);

    const state = consumeSsoStateCookie(c, SSO_COOKIE_PATH);
    const mode = state?.mode ?? 'login';
    try {
      if (!state || state.provider !== provider.id) throw new SsoError('invalid_state');

      const profile = await provider.exchange(c.req.query(), state.state);
      const userId = await resolveSsoUser(provider.id, profile, state);

      if (mode === 'login') {
        const session = await createSsoSession(userId, {
          deviceId: state.deviceId,
          deviceName: state.deviceName,
        });
        c.header('Set-Cookie', refreshCookie(session.refreshToken, session.refreshExpiresAt), {
          append: true,
        });
      }

      logEndpoint(c, 'info', 'SSO sign-in completed', { provider: provider.id, mode });
      return c.redirect(clientCallbackUrl({ status: 'ok', mode }), 302);
    } catch (error) {
      const ssoError = toSsoError(error);
      const reason = ssoError?.code ?? 'provider_unavailable';
      logEndpoint(c, ssoError ? 'warn' : 'error', 'SSO sign-in failed', {
        provider: provider.id,
        reason,
        ...(ssoError ? {} : getErrorDetails(error)),
      });
      return c.redirect(clientCallbackUrl({ status: 'error', mode, reason }), 302);
    }
  });

  router.delete('/sso/:provider/link', requireJwtAuth, async (c) => {
    const provider = getSsoProvider(c.req.param('provider'));
    if (!provider) return c.json(errorResponse('Not Found', 404), 404);
    const userId = getJwtNumericUserId(c) as number;
    try {
      await unlinkUserIdentity(userId, provider.id);
      return c.json(successResponse('OK', { data: { success: true } }, 200), 200);
    } catch (error) {
      if (error instanceof SsoError) return c.json(errorResponse(error.code, 409), 409);
      logEndpoint(c, 'error', 'SSO unlink failed', getErrorDetails(error));
      return c.json(errorResponse('Internal Server Error', 500), 500);
    }
  });
}
