import { createHmac, timingSafeEqual } from 'node:crypto';

import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';

import env from '../../config/env.js';

import { MAP_OPENAPI } from './map.openapi.js';

const MAP_TILE_SESSION_VERSION = 1;
const MAP_TILE_SESSION_COOKIE_NAME = 'ofeed_map_tile_session';
const MAP_TILE_SESSION_COOKIE_PATH = `${MAP_OPENAPI.basePath}/tiles`;

interface MapTileSessionPayload {
  exp: number;
  v: number;
}

function getMapTileSessionSecret() {
  return env.MAP_TILE_COOKIE_SECRET?.trim() || env.JWT_TOKEN_SECRET_KEY;
}

function encodePayload(payload: MapTileSessionPayload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodePayload(value: string) {
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    return JSON.parse(decoded) as MapTileSessionPayload;
  } catch {
    return null;
  }
}

function signPayload(encodedPayload: string) {
  return createHmac('sha256', getMapTileSessionSecret()).update(encodedPayload).digest('base64url');
}

function hasMatchingSignature(encodedPayload: string, signature: string) {
  const expectedSignature = signPayload(encodedPayload);
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const providedBuffer = Buffer.from(signature, 'utf8');

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export function createMapTileSessionToken(now = Date.now()) {
  const payload: MapTileSessionPayload = {
    exp: Math.floor(now / 1000) + env.MAP_TILE_SESSION_TTL_SECONDS,
    v: MAP_TILE_SESSION_VERSION,
  };
  const encodedPayload = encodePayload(payload);

  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

export function isMapTileSessionRequired() {
  return env.MAP_TILE_SESSION_REQUIRED;
}

export function setMapTileSessionCookie(c: Context, now = Date.now()) {
  setCookie(c, MAP_TILE_SESSION_COOKIE_NAME, createMapTileSessionToken(now), {
    httpOnly: true,
    maxAge: env.MAP_TILE_SESSION_TTL_SECONDS,
    path: MAP_TILE_SESSION_COOKIE_PATH,
    sameSite: 'Strict',
    secure: env.NODE_ENV === 'production',
  });
}

export function hasValidMapTileSessionCookie(c: Context, now = Date.now()) {
  const token = getCookie(c, MAP_TILE_SESSION_COOKIE_NAME);
  if (!token) {
    return false;
  }

  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature || !hasMatchingSignature(encodedPayload, signature)) {
    return false;
  }

  const payload = decodePayload(encodedPayload);
  if (!payload || payload.v !== MAP_TILE_SESSION_VERSION) {
    return false;
  }

  const nowInSeconds = Math.floor(now / 1000);
  return payload.exp > nowInSeconds;
}

export const MAP_TILE_SESSION_COOKIE = {
  name: MAP_TILE_SESSION_COOKIE_NAME,
  path: MAP_TILE_SESSION_COOKIE_PATH,
} as const;
