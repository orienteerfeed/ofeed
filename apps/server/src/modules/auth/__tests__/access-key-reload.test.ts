import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../../../lib/logging.js', () => ({ logger: { error: vi.fn() } }));
import env from '../../../config/env.js';
import { reloadAccessKeys, signAccessToken, verifyAccessToken } from '../access-token.js';
const directory = mkdtempSync(join(tmpdir(), 'ofeed-g4-keys-'));
const original = { file: env.ACCESS_JWT_KEY_FILE, node: env.NODE_ENV };
afterEach(() => {
  env.ACCESS_JWT_KEY_FILE = original.file;
  env.NODE_ENV = original.node;
  rmSync(directory, { recursive: true, force: true });
});
it('requires initial production keys and retains the last valid bundle after invalid updates', () => {
  env.NODE_ENV = 'production';
  env.ACCESS_JWT_KEY_FILE = undefined;
  expect(() => reloadAccessKeys()).toThrow('No valid access signing key bundle');
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const file = join(directory, 'bundle.json');
  writeFileSync(
    file,
    JSON.stringify({
      activeKid: 'reload-test',
      privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
      publicKeys: { 'reload-test': pair.publicKey.export({ type: 'spki', format: 'pem' }) },
    }),
    { mode: 0o600 },
  );
  env.ACCESS_JWT_KEY_FILE = file;
  reloadAccessKeys();
  const token = signAccessToken(7, randomUUID());
  writeFileSync(file, '{ invalid JSON');
  expect(() => reloadAccessKeys()).not.toThrow();
  expect(verifyAccessToken(token).sub).toBe('7');
  expect(() => signAccessToken(7, randomUUID())).not.toThrow();
});
