import crypto from 'node:crypto';

import env from '../../config/env.js';

const TOKEN_VERSION = 1;
const TOKEN_PURPOSE = 'entry-order-public-access';

type EntryOrderAccessPayload = {
  version: number;
  entryId: string;
  expiresAt: number;
};

function signingKey(): string {
  // Purpose separation ensures these tokens cannot be used as application JWTs.
  return `${env.JWT_TOKEN_SECRET_KEY}:${TOKEN_PURPOSE}:v${TOKEN_VERSION}`;
}

function signature(value: string): Buffer {
  return crypto.createHmac('sha256', signingKey()).update(value).digest();
}

function isValidPayload(value: unknown): value is EntryOrderAccessPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as EntryOrderAccessPayload).version === TOKEN_VERSION &&
    typeof (value as EntryOrderAccessPayload).entryId === 'string' &&
    (value as EntryOrderAccessPayload).entryId.length > 0 &&
    Number.isSafeInteger((value as EntryOrderAccessPayload).expiresAt)
  );
}

/** Creates a read-only, time-limited link token for exactly one entry order. */
export function createEntryOrderAccessToken(entryId: string, expiresAt: Date): string {
  const payload: EntryOrderAccessPayload = {
    version: TOKEN_VERSION,
    entryId,
    expiresAt: Math.floor(expiresAt.getTime() / 1000),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encodedPayload}.${signature(encodedPayload).toString('base64url')}`;
}

/** Validates that a token grants read-only access to the requested entry order. */
export function hasEntryOrderAccess(token: string, entryId: string, now = new Date()): boolean {
  const [encodedPayload, encodedSignature, ...rest] = token.split('.');
  if (!encodedPayload || !encodedSignature || rest.length > 0) return false;

  let payload: unknown;
  let receivedSignature: Buffer;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    receivedSignature = Buffer.from(encodedSignature, 'base64url');
  } catch {
    return false;
  }

  const expectedSignature = signature(encodedPayload);
  if (
    receivedSignature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(receivedSignature, expectedSignature) ||
    !isValidPayload(payload)
  ) {
    return false;
  }

  return payload.entryId === entryId && payload.expiresAt > Math.floor(now.getTime() / 1000);
}
