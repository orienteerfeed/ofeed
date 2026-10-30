import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  userIdentity: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
  user: { findUnique: vi.fn(), create: vi.fn() },
}));
const sessionMock = vi.hoisted(() => ({ createDeviceSession: vi.fn() }));
const emailMock = vi.hoisted(() => ({ sendEmail: vi.fn() }));

vi.mock('../../../utils/context.js', () => ({ default: prismaMock }));
vi.mock('../session.service.js', () => sessionMock);
vi.mock('../../../utils/email.js', () => emailMock);

import env from '../../../config/env.js';
import authRoutes from '../auth.routes.js';
import * as providers from '../sso/providers.js';
import { SsoError } from '../sso/sso.errors.js';
import { safeEqual } from '../sso/sso.state.js';
import { resolveSsoUser } from '../sso/sso.service.js';

const deviceId = '72c0c95c-16f8-4d0d-a4bf-a84681cfab39';
const profile = {
  providerUserId: '5186',
  email: 'runner@example.com',
  emailVerified: true,
  firstname: 'Jan',
  lastname: 'Novak',
};
const verifiedUser = {
  id: 7,
  email: 'runner@example.com',
  active: true,
  deletedAt: null,
  emailVerifiedAt: new Date(),
};

function enableOris(enabled = true) {
  env.ORIS_SSO_ENABLED = enabled;
  env.ORIS_SSO_CLIENT_ID = 'client-id';
  env.ORIS_SSO_CLIENT_SECRET = 'client-secret';
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  enableOris();
});

describe('SSO provider availability', () => {
  it('keeps ORIS unavailable even when enabled with both credentials set', async () => {
    expect(providers.listEnabledSsoProviders()).toEqual([]);
    expect(providers.getSsoProvider('oris')).toBeNull();
    const response = await authRoutes.request('http://localhost/sso/providers');
    expect((await response.json()).results.data.providers).toEqual([]);
    env.ORIS_SSO_CLIENT_SECRET = undefined;
    expect(providers.listEnabledSsoProviders()).toEqual([]);
    enableOris(false);
    expect(providers.listEnabledSsoProviders()).toEqual([]);
  });

  it.each([true, false])(
    'returns 404 for ORIS start and callback with enabled=%s',
    async (enabled) => {
      enableOris(enabled);
      const start = await authRoutes.request(
        `http://localhost/sso/oris/start?deviceId=${deviceId}&deviceName=Web`,
      );
      const callback = await authRoutes.request('http://localhost/sso/oris/callback?uid=x');
      expect(start.status).toBe(404);
      expect(callback.status).toBe(404);
    },
  );
});

describe('SSO start and callback', () => {
  beforeEach(() => {
    // Exercise the shared flow with a test adapter while the real ORIS adapter is unavailable.
    vi.spyOn(providers, 'getSsoProvider').mockReturnValue({
      id: 'ORIS',
      enabled: () => true,
      authorizeUrl(state) {
        return `https://provider.example/ssologin?cid=client-id&uid=${state}`;
      },
      async exchange(query, state) {
        if (!query.uid || !safeEqual(query.uid, state)) throw new SsoError('invalid_state');
        return profile;
      },
    });
  });
  it('sets a scoped state cookie and returns the ORIS login URL with cid and uid', async () => {
    const response = await authRoutes.request(
      `http://localhost/sso/oris/start?deviceId=${deviceId}&deviceName=Web`,
    );
    expect(response.status).toBe(200);
    const url = new URL((await response.json()).results.data.authorizeUrl);
    expect(url.pathname).toBe('/ssologin');
    expect(url.searchParams.get('cid')).toBe('client-id');
    expect(url.searchParams.get('uid')).toMatch(/^[0-9a-f]{32}$/);
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('ofeed-sso-state=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/rest/v1/auth/sso');
  });

  it('requires a bearer token for link mode', async () => {
    const response = await authRoutes.request(
      `http://localhost/sso/oris/start?mode=link&deviceId=${deviceId}&deviceName=Web`,
    );
    expect(response.status).toBe(401);
  });

  it('redirects with invalid_state when uid does not match the stored state', async () => {
    const start = await authRoutes.request(
      `http://localhost/sso/oris/start?deviceId=${deviceId}&deviceName=Web`,
    );
    const cookie = (start.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    const response = await authRoutes.request('http://localhost/sso/oris/callback?uid=forged', {
      headers: { Cookie: cookie },
    });
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.pathname).toBe('/auth/sso/callback');
    expect(location.searchParams.get('reason')).toBe('invalid_state');
    expect(response.headers.get('set-cookie')).not.toContain('ofeed-refresh=');
  });

  it('redirects with invalid_state when the state cookie is missing', async () => {
    const response = await authRoutes.request('http://localhost/sso/oris/callback?uid=abc');
    expect(new URL(response.headers.get('location') ?? '').searchParams.get('reason')).toBe(
      'invalid_state',
    );
  });
});

describe('resolveSsoUser', () => {
  it('signs in an already linked identity', async () => {
    prismaMock.userIdentity.findUnique.mockResolvedValue({ id: 'i1', userId: 3 });
    await expect(resolveSsoUser('ORIS', profile, { mode: 'login' })).resolves.toBe(3);
    expect(prismaMock.userIdentity.update).toHaveBeenCalled();
  });

  it('creates a new account with an unusable password for an unknown identity', async () => {
    prismaMock.userIdentity.findUnique.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: 11 });
    await expect(resolveSsoUser('ORIS', profile, { mode: 'login' })).resolves.toBe(11);
    const data = prismaMock.user.create.mock.calls[0]?.[0].data;
    expect(data.passwordSet).toBe(false);
    expect(data.password).toMatch(/^\$argon2/);
    expect(data.identities.create.providerUserId).toBe('5186');
  });

  it('auto-links a verified email and sends a notice', async () => {
    prismaMock.userIdentity.findUnique.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue(verifiedUser);
    await expect(resolveSsoUser('ORIS', profile, { mode: 'login' })).resolves.toBe(7);
    expect(prismaMock.userIdentity.create).toHaveBeenCalled();
    expect(emailMock.sendEmail).toHaveBeenCalledOnce();
  });

  it.each([
    ['the provider does not verify the email', { ...profile, emailVerified: false }, verifiedUser],
    ['the ofeed email is unverified', profile, { ...verifiedUser, emailVerifiedAt: null }],
    ['the ofeed account is inactive', profile, { ...verifiedUser, active: false }],
  ])('refuses to auto-link when %s', async (_label, ssoProfile, user) => {
    prismaMock.userIdentity.findUnique.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue(user);
    await expect(resolveSsoUser('ORIS', ssoProfile, { mode: 'login' })).rejects.toMatchObject({
      code: 'email_in_use',
    });
    expect(prismaMock.userIdentity.create).not.toHaveBeenCalled();
  });

  it('refuses to link an identity owned by another user', async () => {
    prismaMock.userIdentity.findUnique.mockResolvedValue({ id: 'i1', userId: 99 });
    await expect(
      resolveSsoUser('ORIS', profile, { mode: 'link', userId: 7 }),
    ).rejects.toMatchObject({ code: 'identity_taken' });
  });

  it('requires an email to create an account', async () => {
    prismaMock.userIdentity.findUnique.mockResolvedValue(null);
    await expect(
      resolveSsoUser('ORIS', { ...profile, email: undefined }, { mode: 'login' }),
    ).rejects.toMatchObject({ code: 'email_required' });
  });
});
