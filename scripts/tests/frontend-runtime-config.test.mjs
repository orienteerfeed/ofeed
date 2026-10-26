import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const clientNames = {
  OFEED_PUBLIC_API_URL: 'VITE_BASE_API_URL',
  OFEED_PUBLIC_URL: 'VITE_PUBLIC_URL',
  OFEED_BOARD_APP_URL: 'VITE_BOARD_APP_URL',
  OFEED_DEFAULT_LANGUAGE: 'VITE_DEFAULT_LANGUAGE',
  OFEED_DOCS_URL: 'VITE_DOCS_URL',
  OFEED_DISCORD_INVITE_URL: 'VITE_DISCORD_INVITE_URL',
  OFEED_GITHUB_REPO_URL: 'VITE_GITHUB_REPO_URL',
  OFEED_ENABLE_MAP_VIEW: 'VITE_ENABLE_MAP_VIEW',
  OFEED_DEBUG_LOGGING: 'VITE_DEBUG_LOGGING',
};
const boardNames = {
  OFEED_BOARD_API_URL: 'VITE_OFEED_API_URL',
  OFEED_BOARD_GQL_WS_URL: 'VITE_OFEED_GQL_WS_URL',
  OFEED_BOARD_PROVIDERS: 'VITE_PROVIDERS',
};

function generate(app, overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'ofeed-runtime-config-'));
  try {
    const output = join(directory, 'runtime-config.js');
    const appDirectory = new URL(`../../apps/${app}/`, import.meta.url);
    const dockerfile = readFileSync(new URL('Dockerfile', appDirectory), 'utf8');
    // Include image defaults: a non-empty OFEED_* default can mask legacy values.
    const imageDefaults = Object.fromEntries(
      [...dockerfile.matchAll(/\b(OFEED_\w+)=([^\s\\]*)/g)].map(match => [match[1], match[2]])
    );
    const source = readFileSync(
      new URL('docker-entrypoint-runtime-config.sh', appDirectory),
      'utf8'
    ).replace('/usr/share/nginx/html/runtime-config.js', output);
    const result = spawnSync('/bin/sh', ['-s'], {
      input: source,
      encoding: 'utf8',
      env: { PATH: process.env.PATH, ...imageDefaults, ...overrides },
    });
    assert.equal(result.status, 0, result.stderr);
    const context = { window: {} };
    runInNewContext(readFileSync(output, 'utf8'), context);
    const config = Object.values(context.window)[0];
    assert.equal(Object.isFrozen(config), true);
    return { ...config };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

for (const [app, names] of Object.entries({ client: clientNames, board: boardNames })) {
  test(`${app}: existing VITE_* env files work with image defaults`, () => {
    const legacy = Object.fromEntries(Object.values(names).map(name => [name, `legacy-${name}`]));
    assert.deepEqual(generate(app, legacy), legacy);
  });

  test(`${app}: OFEED_* runtime values take precedence`, () => {
    const environment = {};
    const expected = {};
    for (const [runtime, legacy] of Object.entries(names)) {
      environment[runtime] = `runtime-${runtime}`;
      environment[legacy] = `legacy-${legacy}`;
      expected[legacy] = environment[runtime];
    }
    assert.deepEqual(generate(app, environment), expected);
  });

  test(`${app}: only allowlisted public values are exported`, () => {
    const result = generate(app, {
      DATABASE_URL: 'private-database',
      JWT_SECRET: 'private-token',
      OFEED_PRIVATE_KEY: 'private-key',
      VITE_UNDOCUMENTED: 'not-allowlisted',
    });
    assert.deepEqual(Object.keys(result).sort(), Object.values(names).sort());
    assert.doesNotMatch(JSON.stringify(result), /private-|not-allowlisted/);
  });
}

test('client: legacy production Board URL and false flags survive startup', () => {
  const result = generate('client', {
    VITE_BOARD_APP_URL: 'https://board.orienteerfeed.com',
    VITE_ENABLE_MAP_VIEW: 'false',
    VITE_DEBUG_LOGGING: 'true',
  });
  assert.equal(result.VITE_BOARD_APP_URL, 'https://board.orienteerfeed.com');
  assert.equal(result.VITE_ENABLE_MAP_VIEW, 'false');
  assert.equal(result.VITE_DEBUG_LOGGING, 'true');
});

test('client: defaults preserve same-origin API and public URL behavior', () => {
  const result = generate('client');
  assert.equal(result.VITE_BASE_API_URL, '');
  assert.equal(result.VITE_PUBLIC_URL, '');
  assert.equal(result.VITE_DEFAULT_LANGUAGE, 'en');
  assert.equal(result.VITE_ENABLE_MAP_VIEW, 'true');
  assert.equal(result.VITE_DEBUG_LOGGING, 'false');
});

test('board: defaults preserve the same-origin API and provider list', () => {
  assert.deepEqual(generate('board'), {
    VITE_OFEED_API_URL: '/api/ofeed',
    VITE_OFEED_GQL_WS_URL: '',
    VITE_PROVIDERS: 'ofeed,liveResultat',
  });
});

test('both entrypoints escape quotes and backslashes in public values', () => {
  const value = 'https://example.com/path?query="quoted"&slash=\\';
  assert.equal(generate('client', { OFEED_DOCS_URL: value }).VITE_DOCS_URL, value);
  assert.equal(generate('board', { OFEED_BOARD_API_URL: value }).VITE_OFEED_API_URL, value);
});
