import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createAccessTokenCodec } from '../access-token.js';

function keys(kid = 'one') {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  return { activeKid: kid, privateKey, publicKeys: { [kid]: publicKey } };
}
const now = Date.parse('2026-10-26T12:00:00Z');
describe('device access JWTs', () => {
  it('signs bounded, uniquely identified ES256 access tokens', () => {
    const codec = createAccessTokenCodec(keys(), 'issuer', 'audience');
    const family = randomUUID();
    const token = codec.sign(7, family, now);
    expect(JSON.parse(Buffer.from(token.split('.')[0]!, 'base64url').toString())).toEqual({
      alg: 'ES256',
      typ: 'at+jwt',
      kid: 'one',
    });
    expect(codec.verify(token, now)).toMatchObject({
      sub: '7',
      sid: family,
      iat: now / 1000,
      exp: now / 1000 + 900,
    });
    expect(codec.verify(codec.sign(7, family, now), now).jti).not.toEqual(
      codec.verify(token, now).jti,
    );
    expect(() => codec.verify(token, now + 899_999)).not.toThrow();
    expect(() => codec.verify(token, now + 900_000)).toThrow();
  });
  it('supports staged rotation and rejects removed or unknown kids', () => {
    const old = keys('old');
    const next = keys('next');
    const oldCodec = createAccessTokenCodec(old, 'issuer', 'audience');
    const nextCodec = createAccessTokenCodec(
      { ...next, publicKeys: { ...old.publicKeys, ...next.publicKeys } },
      'issuer',
      'audience',
    );
    const token = oldCodec.sign(7, randomUUID(), now);
    expect(nextCodec.verify(token, now).sub).toBe('7');
    expect(() => oldCodec.verify(nextCodec.sign(7, randomUUID(), now), now)).toThrow();
    expect(() => createAccessTokenCodec(next, 'issuer', 'audience').verify(token, now)).toThrow();
  });
  it('rejects tampered signatures, issuer, audience, type, algorithm, and missing claims', () => {
    const bundle = keys();
    const codec = createAccessTokenCodec(bundle, 'issuer', 'audience');
    const token = codec.sign(7, randomUUID(), now);
    const [header, body] = token.split('.');
    const reSign = (h: object, b: object) => {
      const input = `${Buffer.from(JSON.stringify(h)).toString('base64url')}.${Buffer.from(JSON.stringify(b)).toString('base64url')}`;
      return `${input}.${sign('sha256', Buffer.from(input), { key: bundle.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
    };
    const h = JSON.parse(Buffer.from(header!, 'base64url').toString());
    const b = JSON.parse(Buffer.from(body!, 'base64url').toString());
    for (const [changedH, changedB] of [
      [{ ...h, alg: 'HS256' }, b],
      [{ ...h, typ: 'JWT' }, b],
      [h, { ...b, iss: 'other' }],
      [h, { ...b, aud: 'other' }],
      [h, { ...b, exp: undefined }],
      [h, { ...b, exp: b.exp + 1 }],
      [h, { ...b, jti: undefined }],
    ]) {
      expect(() => codec.verify(reSign(changedH, changedB), now)).toThrow();
    }
    expect(() => codec.verify(`${header}.${body}.${'A'.repeat(86)}`, now)).toThrow();
  });
  it('rejects mismatched signing keys', () => {
    expect(() =>
      createAccessTokenCodec({ ...keys(), publicKeys: keys().publicKeys }, 'issuer', 'audience'),
    ).toThrow();
  });
});
