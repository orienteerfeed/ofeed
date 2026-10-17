import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import {
  COMPONENTS,
  command,
  digest,
  isMain,
  readJson,
  validateCandidate,
  writeJson,
} from './lib.mjs';
import { Registry } from './registry.mjs';

export const DATABASE_IMAGE =
  'mariadb:11.4.10@sha256:3b4dfcc32247eb07adbebec0793afae2a8eafa6860ec523ee56af4d3dec42f7f';
const STATE = '.delivery/stack.json';
const EMAIL = 'qualification@example.test';
const PASSWORD = 'ofeed-qualification-only';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function docker(...args) {
  return command('docker', args);
}
function image(record, name) {
  return `${record.images[name].repository}@${record.images[name].digest}`;
}

async function waitFor(check, description) {
  let last;
  for (let i = 0; i < 120; i++) {
    try {
      if (await check()) return;
    } catch (error) {
      last = error;
    }
    await pause(1000);
  }
  throw new Error(`Timed out: ${description}`, { cause: last });
}

async function json(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15_000) });
  assert(response.ok, `HTTP ${response.status}: ${new URL(url).pathname}`);
  return response.json();
}

function envArgs(environment) {
  return Object.entries(environment).flatMap(([key, value]) => ['-e', `${key}=${value}`]);
}
function port(name, target) {
  return `http://${docker('port', name, String(target)).split('\n')[0]}`;
}

export async function startStack(candidatePath, baselinePath, { imageReference = image } = {}) {
  const envelope = readJson(candidatePath);
  const record = validateCandidate(envelope.value);
  const baseline = readJson(baselinePath)?.candidate ?? null;
  if (baseline) validateCandidate(baseline);
  mkdirSync('.delivery/logs', { recursive: true });
  const prefix = `ofeed-qual-${process.env.GITHUB_RUN_ID ?? process.pid}-${randomBytes(4).toString('hex')}`;
  const state = { prefix, containers: [], network: prefix };
  writeJson(STATE, state);
  docker('network', 'create', prefix);
  const password = randomBytes(24).toString('hex');
  const rootPassword = randomBytes(24).toString('hex');
  const environment = {
    NODE_ENV: 'production',
    DATABASE_URL: `mysql://ofeed:${password}@database:3306/ofeed`,
    JWT_TOKEN_SECRET_KEY: randomBytes(32).toString('hex'),
    ENCRYPTION_SECRET_KEY: randomBytes(32).toString('hex'),
    CLIENT_APP_URL: 'http://localhost:3000',
    CORS_ORIGIN: '*',
    LOG_LEVEL: 'warn',
    ENABLE_ACCESS_LOG: 'false',
    ENABLE_APP_LOG: 'false',
    RATE_LIMIT_MAX: '10000',
    MAP_TILE_SESSION_REQUIRED: 'false',
    RESEND_API_KEY: '',
    VAULT_ENV_FILE: '',
  };
  const run = (name, reference, args = [], extraEnv = {}, publish) => {
    const container = `${prefix}-${name}`;
    state.containers.push(container);
    writeJson(STATE, state);
    const flags = [
      'run',
      '-d',
      '--name',
      container,
      '--network',
      prefix,
      '--network-alias',
      name,
      ...envArgs({ ...environment, ...extraEnv }),
    ];
    if (publish) flags.push('-p', `127.0.0.1::${publish}`);
    docker(...flags, reference, ...args);
    return container;
  };
  const db = run('database', DATABASE_IMAGE, [], {
    MARIADB_ROOT_PASSWORD: rootPassword,
    MARIADB_DATABASE: 'ofeed',
    MARIADB_USER: 'ofeed',
    MARIADB_PASSWORD: password,
  });
  await waitFor(() => {
    docker('exec', db, 'healthcheck.sh', '--connect', '--innodb_initialized');
    return true;
  }, 'MariaDB initialization');
  const migrate = candidate =>
    docker(
      'run',
      '--rm',
      '--network',
      prefix,
      ...envArgs(environment),
      imageReference(candidate, 'ops')
    );
  migrate(baseline ?? record);
  // A real active account is available for both API and browser tests. No email
  // provider, production credentials or live external datasets are needed.
  const hash = docker(
    'run',
    '--rm',
    '--entrypoint',
    'node',
    imageReference(record, 'api'),
    '--input-type=module',
    '-e',
    `import argon2 from 'argon2'; console.log(await argon2.hash(${JSON.stringify(PASSWORD)}));`
  );
  assert.match(hash, /^\$argon2[a-z0-9$=,+/]+$/i);
  docker(
    'exec',
    '-e',
    `MYSQL_PWD=${password}`,
    db,
    'mariadb',
    '-uofeed',
    'ofeed',
    '-e',
    `INSERT INTO User (email, firstname, lastname, password, active, createdAt, updatedAt) VALUES ('${EMAIL}', 'Delivery', 'Qualification', '${hash}', 1, NOW(), NOW());`
  );
  let oldUrl;
  if (baseline) {
    const old = run('previous-api', imageReference(baseline, 'api'), [], {}, 3001);
    oldUrl = port(old, 3001);
    await waitFor(async () => (await fetch(`${oldUrl}/readyz`)).ok, 'previous API');
    writeJson('.delivery/previous-openapi.json', await json(`${oldUrl}/doc`));
    const require = createRequire(new URL('../../apps/server/package.json', import.meta.url));
    const { getIntrospectionQuery } = require('graphql');
    const schema = await json(`${oldUrl}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: getIntrospectionQuery() }),
    });
    assert(!schema.errors, 'Cannot capture previous GraphQL contract');
    writeJson('.delivery/previous-graphql.json', schema.data);
  }
  // Upgrade while the previous application still runs, then verify its read
  // and write/auth paths and the old migration runner against the new history.
  migrate(record);
  if (baseline) {
    await checkApi(oldUrl);
    migrate(baseline);
  }
  const api = run('api', imageReference(record, 'api'), [], {}, 3001);
  const apiUrl = port(api, 3001);
  await waitFor(async () => (await fetch(`${apiUrl}/readyz`)).ok, 'candidate API');
  const web = run(
    'web',
    imageReference(record, 'web'),
    [],
    {
      PORT: '8080',
      API_UPSTREAM: 'http://api:3001',
      OFEED_PUBLIC_URL: '',
      OFEED_PUBLIC_API_URL: '',
      OFEED_DEFAULT_LANGUAGE: 'en',
    },
    8080
  );
  const board = run(
    'board',
    imageReference(record, 'board'),
    [],
    { PORT: '8080', BOARD_API_UPSTREAM: 'http://api:3001', OFEED_BOARD_API_URL: '/api/ofeed' },
    8080
  );
  state.apiUrl = apiUrl;
  state.webUrl = port(web, 8080);
  state.boardUrl = port(board, 8080);
  writeJson(STATE, state);
  await waitFor(async () => (await fetch(`${state.webUrl}/healthz`)).ok, 'web');
  await waitFor(async () => (await fetch(`${state.boardUrl}/healthz`)).ok, 'board');
  await checkApi(apiUrl);
  for (const [key, value] of Object.entries({
    E2E_BASE_URL: state.webUrl,
    E2E_BOARD_URL: state.boardUrl,
    E2E_USER_EMAIL: EMAIL,
    E2E_USER_PASSWORD: PASSWORD,
  })) {
    if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `${key}=${value}\n`);
  }
}

export async function checkApi(url) {
  const response = await json(`${url}/rest/v1/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: EMAIL, password: PASSWORD }),
  });
  assert.match(
    JSON.stringify(response),
    /"token":"[a-zA-Z0-9_.-]+"/,
    'Authentication response contract failed'
  );
  const query = await json(`${url}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '{ __typename }' }),
  });
  assert(!query.errors && query.data?.__typename, 'GraphQL execution failed');
}

export function openApiBreaks(previous, next) {
  const issues = [];
  for (const [path, methods] of Object.entries(previous.paths ?? {})) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method)) continue;
      const updated = next.paths?.[path]?.[method];
      if (!updated) {
        issues.push(`Removed ${method.toUpperCase()} ${path}`);
        continue;
      }
      for (const parameter of updated.parameters ?? []) {
        const before = operation.parameters?.find(
          item => item.name === parameter.name && item.in === parameter.in
        );
        if (parameter.required && !before?.required)
          issues.push(`New required parameter ${parameter.name} on ${method} ${path}`);
      }
      for (const code of Object.keys(operation.responses ?? {}))
        if (!updated.responses?.[code])
          issues.push(`Removed response ${code} on ${method} ${path}`);
    }
  }
  return issues;
}

async function websocket(url) {
  await new Promise((resolve, reject) => {
    const socket = new WebSocket(url.replace(/^http/, 'ws') + '/graphql', 'graphql-transport-ws');
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('GraphQL WebSocket timeout'));
    }, 15_000);
    socket.addEventListener('error', () => {
      clearTimeout(timeout);
      reject(new Error('GraphQL WebSocket transport failed'));
    });
    socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'connection_init' })));
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(String(data));
      if (message.type === 'connection_ack') {
        socket.send(
          JSON.stringify({
            id: 'winner',
            type: 'subscribe',
            payload: {
              query: 'subscription { winnerUpdated(eventId: "delivery-test") { __typename } }',
            },
          })
        );
        socket.send(JSON.stringify({ type: 'ping' }));
      } else if (message.type === 'error') {
        clearTimeout(timeout);
        socket.close();
        reject(new Error('GraphQL subscription rejected'));
      } else if (message.type === 'pong') {
        clearTimeout(timeout);
        socket.send(JSON.stringify({ id: 'winner', type: 'complete' }));
        socket.close();
        resolve();
      }
    });
  });
}

export async function contracts(candidatePath, { registry = new Registry() } = {}) {
  const state = readJson(STATE);
  await websocket(state.webUrl);
  await websocket(state.boardUrl);
  const require = createRequire(new URL('../../apps/server/package.json', import.meta.url));
  const { getIntrospectionQuery, buildClientSchema, findBreakingChanges } = require('graphql');
  const schema = await json(`${state.apiUrl}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: getIntrospectionQuery() }),
  });
  assert(!schema.errors);
  const openapi = await json(`${state.apiUrl}/doc`);
  if (existsSync('.delivery/previous-openapi.json')) {
    assert.deepEqual(
      openApiBreaks(readJson('.delivery/previous-openapi.json'), openapi),
      [],
      'REST compatibility failed'
    );
    assert.deepEqual(
      findBreakingChanges(
        buildClientSchema(readJson('.delivery/previous-graphql.json')),
        buildClientSchema(schema.data)
      ),
      [],
      'GraphQL compatibility failed'
    );
  }
  const candidate = validateCandidate(readJson(candidatePath).value);
  const manifest = await registry.manifest('orienteerfeed/charts/ofeed', candidate.chart.digest);
  const layer = manifest.document.layers.find(
    item => item.mediaType === 'application/vnd.cncf.helm.chart.content.v1.tar+gzip'
  );
  assert(layer);
  const packagePath = '.delivery/qualified-chart.tgz';
  const chartBytes = await registry.blob('orienteerfeed/charts/ofeed', layer.digest);
  assert.equal(
    digest(chartBytes),
    candidate.chart.packageDigest,
    'Qualified chart package differs from candidate record'
  );
  writeFileSync(packagePath, chartBytes);
  const args = [];
  for (const name of COMPONENTS)
    args.push(
      '--set',
      `${name}.image.tag=${candidate.tag}`,
      '--set',
      `${name}.image.digest=${candidate.images[name].digest}`
    );
  args.push('--set', 'requireImageDigests=true');
  command('helm', ['lint', packagePath, ...args], { stdio: 'inherit' });
  const rendered = command('helm', ['template', 'qualification', packagePath, ...args]);
  for (const name of COMPONENTS) assert(rendered.includes(candidate.images[name].digest));
  writeFileSync('.delivery/logs/rendered.yaml', rendered);
}

export function cleanup() {
  if (!existsSync(STATE)) return;
  const state = readJson(STATE);
  assert.match(state.prefix, /^ofeed-qual-[0-9]+-[a-f0-9]{8}$/);
  mkdirSync('.delivery/logs', { recursive: true });
  for (const name of state.containers) {
    assert(name.startsWith(`${state.prefix}-`));
    try {
      writeFileSync(
        `.delivery/logs/${name}.log`,
        command('docker', ['logs', name], { stdio: ['ignore', 'pipe', 'pipe'] })
      );
    } catch {
      /* Container may have failed to start. */
    }
    try {
      docker('rm', '-f', '-v', name);
    } catch {
      /* Cleanup is retryable. */
    }
  }
  try {
    docker('network', 'rm', state.network);
  } catch {
    /* Already removed. */
  }
}

if (isMain(import.meta)) {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === 'start') await startStack(...args);
  else if (mode === 'contracts') await contracts(...args);
  else if (mode === 'cleanup') cleanup();
  else throw new Error(`Unknown qualification command ${mode}`);
}
