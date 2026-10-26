import { keyReloadFailures } from './session.metrics.js';
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import env from '../../config/env.js';
import { logger } from '../../lib/logging.js';

export const ACCESS_TTL_SECONDS = 900;
const bundleSchema = z.object({
  activeKid: z.string().min(1).max(100),
  privateKey: z.string().min(1),
  publicKeys: z.record(z.string(), z.string()),
});
const claimsSchema = z.object({
  sub: z.string().regex(/^[1-9][0-9]*$/),
  sid: z.uuid(),
  jti: z.uuid(),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
  iss: z.string(),
  aud: z.string(),
});
export type AccessClaims = z.infer<typeof claimsSchema>;
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

function assertP256(key: KeyObject) {
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
    throw new Error('Access signing keys must use P-256');
  }
}

export function createAccessTokenCodec(rawBundle: unknown, issuer: string, audience: string) {
  const bundle = bundleSchema.parse(rawBundle);
  const privateKey = createPrivateKey(bundle.privateKey);
  assertP256(privateKey);
  const publicKeys = new Map(
    Object.entries(bundle.publicKeys).map(([kid, pem]) => {
      const key = createPublicKey(pem);
      assertP256(key);
      return [kid, key] as const;
    }),
  );
  const activePublic = publicKeys.get(bundle.activeKid);
  if (
    !activePublic ||
    !createPublicKey(privateKey)
      .export({ type: 'spki', format: 'der' })
      .equals(activePublic.export({ type: 'spki', format: 'der' }))
  ) {
    throw new Error('Active access signing key does not match its public key');
  }
  return {
    sign(userId: number, familyId: string, now = Date.now()) {
      const iat = Math.floor(now / 1000);
      const claims = claimsSchema.parse({
        sub: String(userId),
        sid: familyId,
        jti: randomUUID(),
        iat,
        exp: iat + ACCESS_TTL_SECONDS,
        iss: issuer,
        aud: audience,
      });
      const input = `${encode({ alg: 'ES256', typ: 'at+jwt', kid: bundle.activeKid })}.${encode(claims)}`;
      const signature = sign('sha256', Buffer.from(input), {
        key: privateKey,
        dsaEncoding: 'ieee-p1363',
      });
      return `${input}.${signature.toString('base64url')}`;
    },
    verify(token: string, now = Date.now()): AccessClaims {
      if (token.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))
        throw new Error('Invalid access token');
      const [headerPart, body, signature] = token.split('.');
      const header = z
        .object({ alg: z.literal('ES256'), typ: z.literal('at+jwt'), kid: z.string() })
        .parse(JSON.parse(Buffer.from(headerPart!, 'base64url').toString()));
      const key = publicKeys.get(header.kid);
      if (
        !key ||
        Buffer.from(signature!, 'base64url').length !== 64 ||
        !verify(
          'sha256',
          Buffer.from(`${headerPart}.${body}`),
          { key, dsaEncoding: 'ieee-p1363' },
          Buffer.from(signature!, 'base64url'),
        )
      )
        throw new Error('Invalid access signature');
      const claims = claimsSchema.parse(JSON.parse(Buffer.from(body!, 'base64url').toString()));
      const seconds = Math.floor(now / 1000);
      if (
        claims.iss !== issuer ||
        claims.aud !== audience ||
        claims.exp <= seconds ||
        claims.iat > seconds + 30 ||
        claims.exp !== claims.iat + ACCESS_TTL_SECONDS ||
        !Number.isSafeInteger(Number(claims.sub))
      )
        throw new Error('Invalid or expired access token');
      return claims;
    },
  };
}

let codec: ReturnType<typeof createAccessTokenCodec> | undefined;
export function reloadAccessKeys() {
  try {
    const keyFile = env.ACCESS_JWT_KEY_FILE;
    if (!keyFile) {
      if (env.NODE_ENV === 'production')
        throw new Error('ACCESS_JWT_KEY_FILE is required in production');
      if (codec) return;
      const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      codec = createAccessTokenCodec(
        {
          activeKid: 'ephemeral',
          privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
          publicKeys: { ephemeral: pair.publicKey.export({ type: 'spki', format: 'pem' }) },
        },
        env.ACCESS_JWT_ISSUER,
        env.ACCESS_JWT_AUDIENCE,
      );
    } else {
      const raw = readFileSync(keyFile, 'utf8');
      if (raw.length > 1_048_576) throw new Error('Access key bundle too large');
      codec = createAccessTokenCodec(
        JSON.parse(raw),
        env.ACCESS_JWT_ISSUER,
        env.ACCESS_JWT_AUDIENCE,
      );
    }
  } catch {
    // Never include parser errors: Zod diagnostics can contain secret input.
    keyReloadFailures.inc();
    logger.error('Access signing key reload failed');
    if (!codec) throw new Error('No valid access signing key bundle');
  }
}
function getCodec() {
  if (!codec) reloadAccessKeys();
  return codec!;
}
export const signAccessToken = (userId: number, familyId: string) =>
  getCodec().sign(userId, familyId);
export const verifyAccessToken = (token: string) => getCodec().verify(token);
