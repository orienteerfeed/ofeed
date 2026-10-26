import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
const settings = vi.hoisted(() => ({ url: process.env.SESSION_TEST_DATABASE_URL }));
if (settings.url) {
  const url = new URL(settings.url);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !/^\/ofeed_session_test(?:_|$)/.test(url.pathname)
  )
    throw new Error('Session tests require a disposable local ofeed_session_test database');
}
vi.mock('../../../utils/context.js', async () => {
  const { createPrismaClient } = await import('../../../db/prisma-client.js');
  return {
    default: createPrismaClient(settings.url ?? 'mysql://root@127.0.0.1:13383/ofeed_session_test'),
  };
});
import client from '../../../utils/context.js';
import {
  createDeviceSession,
  refreshDeviceSession,
  logoutDeviceSession,
  listDeviceSessions,
  revokeDevice,
  hashRefreshToken,
  lockSessionUser,
  revokeUserSessions,
  ABSOLUTE_MS,
  SLIDING_MS,
  sessionDeadline,
} from '../session.service.js';
import { changeAuthenticatedUserPassword, passwordResetConfirm } from '../auth.service.js';

import authRoutes from '../auth.routes.js';
import { graphQLHttpHandler } from '../../graphql/graphql.handlers.js';
import { verifyAccessToken } from '../access-token.js';
import { anonymizeCurrentUserAccount } from '../../user/user.service.js';

const users: number[] = [];
describe.skipIf(!settings.url)('device sessions on disposable MariaDB', () => {
  let userId: number;
  let passwordHash: string;
  let device: { deviceId: string; deviceName: string };
  beforeEach(async () => {
    passwordHash = await argon2.hash('old-password');
    const user = await client.user.create({
      data: {
        email: `${randomUUID()}@session.invalid`,
        firstname: 'Session',
        lastname: 'Test',
        password: passwordHash,
        active: true,
      },
    });
    userId = user.id;
    users.push(userId);
    device = { deviceId: randomUUID(), deviceName: 'Test device' };
  });
  afterAll(async () => {
    await client.user.deleteMany({ where: { id: { in: users } } });
    await client.$disconnect();
  });
  const issue = () => createDeviceSession(userId, device, passwordHash);
  it('signs in through REST without copying credential fields into session persistence', async () => {
    const user = await client.user.findUniqueOrThrow({ where: { id: userId } });
    const response = await authRoutes.request('http://localhost/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user.email, password: 'old-password', ...device }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()).results.data;
    expect(payload).toMatchObject({ expiresIn: 900, refreshToken: expect.any(String) });
    expect(payload).not.toHaveProperty('token');
    expect(verifyAccessToken(payload.accessToken).sub).toBe(String(userId));
    const [session] = await listDeviceSessions(userId);
    expect(session).toMatchObject(device);
    expect(JSON.stringify(payload)).not.toContain(passwordHash);
  });
  it('sets a browser cookie through GraphQL HTTP and rotates it through REST', async () => {
    const user = await client.user.findUniqueOrThrow({ where: { id: userId } });
    const headers = {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:3000',
      'X-Ofeed-Session': 'web',
    };
    const response = await graphQLHttpHandler({
      req: {
        raw: new Request('http://localhost/graphql', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            query:
              'mutation Signin($input: LoginInput!) { signin(input: $input) { accessToken expiresIn user { id email } } }',
            variables: { input: { username: user.email, password: 'old-password', ...device } },
          }),
        }),
      },
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.errors).toBeUndefined();
    expect(payload.data.signin.user.id).toBe(userId);
    expect(payload.data.signin).not.toHaveProperty('refreshToken');
    const cookie = response.headers.get('set-cookie')!;
    expect(cookie).toContain('HttpOnly');
    const rotated = await authRoutes.request('http://localhost/refresh', {
      method: 'POST',
      headers: { ...headers, Cookie: cookie.split(';')[0]! },
      body: JSON.stringify({ deviceId: device.deviceId }),
    });
    expect(rotated.status).toBe(200);
    expect((await rotated.json()).results.data).not.toHaveProperty('refreshToken');
    expect(rotated.headers.get('set-cookie')).not.toBe(cookie);
  });
  it('revokes device families on account deletion', async () => {
    const first = await issue();
    await anonymizeCurrentUserAccount(
      { isAuthenticated: true, type: 'jwt', userId },
      { currentPassword: 'old-password', deleteEvents: false },
    );
    expect(await listDeviceSessions(userId)).toHaveLength(0);
    await expect(refreshDeviceSession(first.refreshToken, device.deviceId)).rejects.toThrow();
    expect((await client.user.findUniqueOrThrow({ where: { id: userId } })).active).toBe(false);
  });
  it('stores only hashes, rotates once and revokes successors after replay', async () => {
    const first = await issue();
    const row = await client.sessionRefreshToken.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(first.refreshToken) },
      include: { family: true },
    });
    expect(JSON.stringify(row)).not.toContain(first.refreshToken);
    expect(row.family.absoluteExpiresAt.getTime() - row.family.createdAt.getTime()).toBeGreaterThan(
      ABSOLUTE_MS - 1000,
    );
    const next = await refreshDeviceSession(first.refreshToken, device.deviceId);
    expect(next.refreshToken).not.toBe(first.refreshToken);
    expect(next.expiresIn).toBe(900);
    await expect(refreshDeviceSession(first.refreshToken, device.deviceId)).rejects.toThrow();
    await expect(refreshDeviceSession(next.refreshToken, device.deviceId)).rejects.toThrow();
    expect(
      (await client.deviceSession.findUniqueOrThrow({ where: { id: row.familyId } }))
        .revocationReason,
    ).toBe('refresh_reuse');
  });
  it('serializes concurrent refresh and leaves its family revoked on the losing replay', async () => {
    const first = await issue();
    const results = await Promise.allSettled([
      refreshDeviceSession(first.refreshToken, device.deviceId),
      refreshDeviceSession(first.refreshToken, device.deviceId),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await listDeviceSessions(userId)).toHaveLength(0);
  });
  it('rejects device mismatch without consuming the valid credential', async () => {
    const first = await issue();
    await expect(refreshDeviceSession(first.refreshToken, randomUUID())).rejects.toThrow();
    await expect(refreshDeviceSession(first.refreshToken, device.deviceId)).resolves.toBeDefined();
  });
  it('enforces expiry, sliding renewal and the absolute cap', async () => {
    const first = await issue();
    const row = await client.sessionRefreshToken.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(first.refreshToken) },
    });
    const absolute = new Date(Date.now() + 60_000);
    await client.deviceSession.update({
      where: { id: row.familyId },
      data: { absoluteExpiresAt: absolute, expiresAt: new Date(Date.now() + 30_000) },
    });
    const next = await refreshDeviceSession(first.refreshToken, device.deviceId);
    expect(next.refreshExpiresAt).toEqual(absolute);
    await client.deviceSession.update({
      where: { id: row.familyId },
      data: { expiresAt: new Date(0) },
    });
    await expect(refreshDeviceSession(next.refreshToken, device.deviceId)).rejects.toThrow();
    expect(sessionDeadline(new Date(0), new Date(ABSOLUTE_MS)).getTime()).toBe(SLIDING_MS);
  });
  it('limits revocation to the caller and supports logout with spent credentials', async () => {
    const first = await issue();
    const next = await refreshDeviceSession(first.refreshToken, device.deviceId);
    await revokeDevice(userId + 1, device.deviceId);
    expect(await listDeviceSessions(userId)).toHaveLength(1);
    await logoutDeviceSession(first.refreshToken, device.deviceId);
    await logoutDeviceSession(first.refreshToken, device.deviceId);
    await expect(refreshDeviceSession(next.refreshToken, device.deviceId)).rejects.toThrow();
  });
  it('revokes all families on password change and prevents signin with a stale password hash', async () => {
    const first = await issue();
    await createDeviceSession(userId, { ...device, deviceId: randomUUID() }, passwordHash);
    await changeAuthenticatedUserPassword(userId, 'old-password', 'new-password');
    expect(await listDeviceSessions(userId)).toHaveLength(0);
    await expect(refreshDeviceSession(first.refreshToken, device.deviceId)).rejects.toThrow();
    await expect(issue()).rejects.toThrow();
  });
  it('single-use reset revokes families and rejects repeated completion', async () => {
    await issue();
    const raw = randomUUID();
    await client.passwordResetToken.create({
      data: { userId, tokenHash: hashRefreshToken(raw), expiresAt: new Date(Date.now() + 60_000) },
    });
    await expect(passwordResetConfirm(raw, 'new-password')).resolves.toMatchObject({
      success: true,
    });
    expect(await listDeviceSessions(userId)).toHaveLength(0);
    await expect(passwordResetConfirm(raw, 'another-password')).rejects.toThrow();
  });
  it('serializes revocation against refresh without leaving a live successor', async () => {
    const first = await issue();
    await Promise.allSettled([
      refreshDeviceSession(first.refreshToken, device.deviceId),
      client.$transaction(async (tx) => {
        await lockSessionUser(tx, userId);
        await revokeUserSessions(tx, userId, 'password_changed');
      }),
    ]);
    expect(await listDeviceSessions(userId)).toHaveLength(0);
  });
});
