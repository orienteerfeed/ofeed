import { beforeEach, describe, expect, it, vi } from 'vitest';
const service = vi.hoisted(() => ({ refreshDeviceSession: vi.fn(), logoutDeviceSession: vi.fn() }));
vi.mock('../session.service.js', () => service);
import authRoutes from '../auth.routes.js';
import { AuthenticationError } from '../../../exceptions/index.js';
const deviceId = '72c0c95c-16f8-4d0d-a4bf-a84681cfab39';
const refreshToken = 'a'.repeat(43);
const browserHeaders = {
  'Content-Type': 'application/json',
  Origin: 'http://localhost:3000',
  'X-Ofeed-Session': 'web',
  Cookie: `ofeed-refresh=${refreshToken}`,
};
const post = (
  action: string,
  body: unknown,
  headers: Record<string, string> = { 'Content-Type': 'application/json' },
) =>
  authRoutes.request(`http://localhost/${action}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  service.refreshDeviceSession.mockResolvedValue({
    accessToken: 'access',
    expiresIn: 900,
    refreshToken: 'b'.repeat(43),
    refreshExpiresAt: new Date(Date.now() + 60_000),
  });
});
describe('session REST transport', () => {
  it('returns opaque refresh credentials to native clients in the existing envelope', async () => {
    const response = await post('refresh', { deviceId, refreshToken });
    expect(response.status).toBe(200);
    expect((await response.json()).results.data).toEqual({
      accessToken: 'access',
      expiresIn: 900,
      refreshToken: 'b'.repeat(43),
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toBeNull();
  });
  it('rotates HttpOnly cookies without exposing browser refresh credentials', async () => {
    const response = await post('refresh', { deviceId }, browserHeaders);
    expect(response.status).toBe(200);
    expect((await response.json()).results.data).toEqual({ accessToken: 'access', expiresIn: 900 });
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).toContain('SameSite=Lax');
    expect(response.headers.get('set-cookie')).not.toContain('Domain=');
  });
  it('rejects cross-origin, missing-header and ambiguous credential requests before service execution', async () => {
    for (const headers of [
      { ...browserHeaders, Origin: 'https://evil.invalid' },
      { ...browserHeaders, 'X-Ofeed-Session': '' },
      { ...browserHeaders, 'Content-Type': 'text/plain' },
    ]) {
      expect((await post('refresh', { deviceId }, headers)).status).toBe(403);
    }
    expect((await post('refresh', { deviceId, refreshToken }, browserHeaders)).status).toBe(422);
    expect(service.refreshDeviceSession).not.toHaveBeenCalled();
  });
  it('returns 401 for missing or rejected refresh credentials', async () => {
    expect((await post('refresh', { deviceId })).status).toBe(401);
    service.refreshDeviceSession.mockRejectedValue(new AuthenticationError('rejected'));
    expect((await post('refresh', { deviceId, refreshToken })).status).toBe(401);
  });
  it('logs out without requiring an access token and expires its cookie', async () => {
    const response = await post('logout', { deviceId }, browserHeaders);
    expect(response.status).toBe(200);
    expect(service.logoutDeviceSession).toHaveBeenCalledWith(refreshToken, deviceId);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await post('logout', { deviceId })).status).toBe(200);
  });
});
