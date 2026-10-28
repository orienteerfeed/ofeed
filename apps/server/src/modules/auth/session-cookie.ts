import env from '../../config/env.js';
import { AuthzError } from '../../utils/authz.js';

export const REFRESH_COOKIE = 'ofeed-refresh';
export function requireBrowserSessionRequest(request: Request) {
  const origin = request.headers.get('origin');
  const allowed = env.CORS_ORIGIN.split(',').map((value) => value.trim());
  if (
    !origin ||
    !allowed.includes(origin) ||
    request.headers.get('x-ofeed-session') !== 'web' ||
    request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
  ) {
    throw new AuthzError('Invalid browser session request', 403);
  }
}
export function readRefreshCookie(request: Request) {
  const cookies = (request.headers.get('cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${REFRESH_COOKIE}=`));
  if (cookies.length > 1) throw new AuthzError('Ambiguous session credentials', 422);
  return cookies[0]?.slice(REFRESH_COOKIE.length + 1);
}
export function refreshCookie(value: string, expiresAt: Date) {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  return `${REFRESH_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}
export function clearRefreshCookie() {
  return refreshCookie('', new Date(0));
}
