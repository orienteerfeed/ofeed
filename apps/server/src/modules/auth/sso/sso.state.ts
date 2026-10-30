import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

import env from '../../../config/env.js';

export const SSO_STATE_COOKIE = 'ofeed-sso-state';
const SSO_STATE_TTL_SECONDS = 600;

export type SsoMode = 'login' | 'link';

export interface SsoState {
  provider: string;
  state: string;
  deviceId: string;
  deviceName: string;
  mode: SsoMode;
  userId?: number;
  exp: number;
}

function sign(encodedPayload: string) {
  return createHmac('sha256', env.JWT_TOKEN_SECRET_KEY)
    .update(`sso:${encodedPayload}`)
    .digest('base64url');
}

export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

export function newSsoStateValue() {
  return randomBytes(16).toString('hex');
}

// The cookie is scoped to the SSO routes so it is only sent back to the callback.
export function setSsoStateCookie(
  c: Context,
  path: string,
  state: Omit<SsoState, 'exp'>,
  now = Date.now(),
) {
  const payload: SsoState = { ...state, exp: Math.floor(now / 1000) + SSO_STATE_TTL_SECONDS };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  setCookie(c, SSO_STATE_COOKIE, `${encoded}.${sign(encoded)}`, {
    httpOnly: true,
    maxAge: SSO_STATE_TTL_SECONDS,
    path,
    sameSite: 'Lax',
    secure: env.NODE_ENV === 'production',
  });
}

/** Reads and clears the state cookie; a state can be used only once. */
export function consumeSsoStateCookie(c: Context, path: string, now = Date.now()): SsoState | null {
  const token = getCookie(c, SSO_STATE_COOKIE);
  if (token === undefined) return null;
  deleteCookie(c, SSO_STATE_COOKIE, { path });

  const [encoded, signature] = token.split('.');
  if (!encoded || !signature || !safeEqual(sign(encoded), signature)) return null;

  let payload: SsoState;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SsoState;
  } catch {
    return null;
  }
  return payload.exp > Math.floor(now / 1000) ? payload : null;
}
