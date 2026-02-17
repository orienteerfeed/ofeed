import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import env from '../config/env.js';

type AesGcmAlgorithm = 'aes-128-gcm' | 'aes-192-gcm' | 'aes-256-gcm';
type AesCbcAlgorithm = 'aes-128-cbc' | 'aes-192-cbc' | 'aes-256-cbc';

export type LegacyEncryptedPayload = {
  iv: string;
  content: string;
};

export type ModernEncryptedPayload = {
  v: 2;
  alg: AesGcmAlgorithm;
  iv: string;
  tag: string;
  content: string;
  enc: 'base64';
};

export type EncryptedPayload = LegacyEncryptedPayload | ModernEncryptedPayload;

const GCM_IV_LENGTH_BYTES = 12;
const GCM_TAG_LENGTH_BYTES = 16;

const secretKeyHex = env.ENCRYPTION_SECRET_KEY;

if (!secretKeyHex) {
  throw new Error('ENCRYPTION_SECRET_KEY is not defined');
}

if (!/^[0-9a-fA-F]+$/.test(secretKeyHex) || secretKeyHex.length % 2 !== 0) {
  throw new Error('ENCRYPTION_SECRET_KEY must be a valid even-length hex string');
}

const secretKey = Buffer.from(secretKeyHex, 'hex');

if (![16, 24, 32].includes(secretKey.length)) {
  throw new Error('ENCRYPTION_SECRET_KEY must decode to 16, 24, or 32 bytes');
}

const keySizeBits = (secretKey.length * 8) as 128 | 192 | 256;
const gcmAlgorithm = `aes-${keySizeBits}-gcm` as AesGcmAlgorithm;
const cbcAlgorithm = `aes-${keySizeBits}-cbc` as AesCbcAlgorithm;

function isModernPayload(payload: unknown): payload is ModernEncryptedPayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as Partial<ModernEncryptedPayload>;

  return (
    candidate.v === 2 &&
    typeof candidate.alg === 'string' &&
    typeof candidate.iv === 'string' &&
    typeof candidate.tag === 'string' &&
    typeof candidate.content === 'string'
  );
}

function decryptLegacyPayload(hash: LegacyEncryptedPayload): string {
  const decipher = createDecipheriv(
    cbcAlgorithm,
    secretKey,
    Buffer.from(hash.iv, 'hex'),
  );

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(hash.content, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

function decryptModernPayload(hash: ModernEncryptedPayload): string {
  if (hash.alg !== gcmAlgorithm) {
    throw new Error(`Unsupported encrypted payload algorithm: ${hash.alg}`);
  }

  const decipher = createDecipheriv(
    hash.alg,
    secretKey,
    Buffer.from(hash.iv, 'base64'),
    { authTagLength: GCM_TAG_LENGTH_BYTES },
  );
  decipher.setAuthTag(Buffer.from(hash.tag, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(hash.content, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

export function encrypt(text: string): ModernEncryptedPayload {
  const iv = randomBytes(GCM_IV_LENGTH_BYTES);
  const cipher = createCipheriv(gcmAlgorithm, secretKey, iv, {
    authTagLength: GCM_TAG_LENGTH_BYTES,
  });
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    v: 2,
    alg: gcmAlgorithm,
    iv: iv.toString('base64'),
    tag: authTag.toString('base64'),
    content: encrypted.toString('base64'),
    enc: 'base64',
  };
}

export function decrypt(hash: EncryptedPayload): string {
  if (isModernPayload(hash)) {
    return decryptModernPayload(hash);
  }

  return decryptLegacyPayload(hash);
}

export const encodeBase64 = (data: EncryptedPayload): string => {
  const jsonString = JSON.stringify(data);
  return Buffer.from(jsonString).toString('base64');
};

export const decodeBase64 = (base64String: string): EncryptedPayload => {
  const jsonString = Buffer.from(base64String, 'base64').toString();
  const parsed = JSON.parse(jsonString) as Record<string, unknown>;

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid encrypted payload format: payload is not an object');
  }

  if (
    typeof parsed.iv === 'string' &&
    typeof parsed.content === 'string' &&
    !('tag' in parsed)
  ) {
    return {
      iv: parsed.iv,
      content: parsed.content,
    };
  }

  if (
    parsed.v === 2 &&
    typeof parsed.alg === 'string' &&
    typeof parsed.iv === 'string' &&
    typeof parsed.tag === 'string' &&
    typeof parsed.content === 'string'
  ) {
    return {
      v: parsed.v,
      alg: parsed.alg as AesGcmAlgorithm,
      iv: parsed.iv,
      tag: parsed.tag,
      content: parsed.content,
      enc: 'base64',
    };
  }

  throw new Error('Invalid encrypted payload format');
};
