import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { parse } from 'yaml';

import { analyzeCommits } from '../release/analyzer.mjs';
import { GitHub } from '../release/github.mjs';
import { environmentFiles, managedApplication, updateGitops } from '../release/gitops.mjs';
import { COMPONENTS, IMAGES, command, digest, validateCandidate } from '../release/lib.mjs';
import { Registry } from '../release/registry.mjs';
import { openApiBreaks } from '../release/stack.mjs';

const sha = 'a'.repeat(40);
const sha256 = `sha256:${'b'.repeat(64)}`;
test('command supports inherited output without requiring a captured string', () => {
  assert.equal(command(process.execPath, ['-e', ''], { stdio: 'inherit' }), '');
});
function candidate() {
  return {
    schemaVersion: 1,
    policy: 1,
    repository: 'orienteerfeed/ofeed',
    sourceCommit: sha,
    sourceTree: 'c'.repeat(40),
    runId: 123,
    tag: `develop-${sha}`,
    images: Object.fromEntries(
      COMPONENTS.map(name => [
        name,
        { repository: IMAGES[name], digest: sha256, platforms: { amd64: sha256, arm64: sha256 } },
      ])
    ),
    chart: {
      repository: 'ghcr.io/orienteerfeed/charts/ofeed',
      version: '0.2.0-candidate.123',
      digest: sha256,
      packageDigest: digest(Buffer.from('qualified chart bytes')),
    },
  };
}

const logger = { log() {} };
const analyze = (messages, env = {}) =>
  analyzeCommits(
    {},
    {
      commits: messages.map((message, i) => ({ message, hash: `${i}` })),
      logger,
      cwd: process.cwd(),
      env,
    }
  );

test('automatic semantic version intent: patch, minor, major and no release', async () => {
  assert.equal(await analyze(['fix(auth): handle expiry']), 'patch');
  assert.equal(await analyze(['feat(events): support registrations']), 'minor');
  assert.equal(await analyze(['feat(api)!: change response envelope']), 'major');
  assert.equal(await analyze(['docs: explain deployment', 'ci: configure delivery']), null);
});

test('Release-Type is optional, validated, and cannot downgrade automatic intent', async () => {
  assert.equal(await analyze(['chore: emergency repair\n\nRelease-Type: patch']), 'patch');
  assert.equal(await analyze(['fix: bug\n\nRelease-Type: minor']), 'minor');
  await assert.rejects(analyze(['feat: API\n\nRelease-Type: patch']), /downgrade/);
  await assert.rejects(analyze(['fix: API\n\nRelease-Type: banana']), /Invalid/);
  assert.equal(await analyze(['fix: bug'], { SEMANTIC_RELEASE_FORCE_LEVEL: 'major' }), 'major');
});

test('candidate rejects substituted repositories, incomplete architectures and malformed pins', () => {
  assert.equal(validateCandidate(candidate()).sourceCommit, sha);
  const changed = candidate();
  changed.images.api.repository = 'ghcr.io/attacker/api';
  assert.throws(() => validateCandidate(changed));
  const missing = candidate();
  delete missing.images.web.platforms.arm64;
  assert.throws(() => validateCandidate(missing));
  const moving = candidate();
  moving.images.ops.digest = 'latest';
  assert.throws(() => validateCandidate(moving));
});

test('production refuses stale qualification before registry access and safely retries an applied release', async () => {
  const envelope = {
    value: candidate(),
    digest: sha256,
    qualification: { candidateDigest: sha256, productionDigest: null },
  };
  const client = {
    content: async () =>
      JSON.stringify({ candidateDigest: `sha256:${'d'.repeat(64)}`, version: '1.7.0' }),
  };
  const dependencies = { client, registry: {}, source: {} };
  await assert.rejects(updateGitops('prod', envelope, '1.8.0', dependencies), /baseline changed/);
  client.content = async () => JSON.stringify({ candidateDigest: sha256, version: '1.8.0' });
  assert.equal(await updateGitops('prod', envelope, '1.8.0', dependencies), undefined);
  await assert.rejects(
    updateGitops('prod', { ...envelope, qualification: null }, '1.8.0', dependencies),
    /requires qualification/
  );
});

test('GitHub artifact download handles redirects manually without forwarding credentials', async () => {
  const requests = [];
  const client = new GitHub('test-token', async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).startsWith('https://api.github.com/'))
      return new Response(null, {
        status: 302,
        headers: { location: 'https://artifacts.example.test/signed.zip' },
      });
    return new Response('archive');
  });
  assert.equal(
    (await client.request('/repos/example/repo/actions/artifacts/1/zip', { raw: true })).toString(),
    'archive'
  );
  assert.equal(requests[0].options.redirect, 'manual');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer test-token');
  assert.equal(requests[1].options.headers, undefined);
});

test('GitOps updates preserve runtime settings while pinning the complete image/chart set', () => {
  const previous =
    'api:\n  env:\n    S3_BUCKET_PUBLIC: existing-bucket\n  envFrom:\n    - secretRef: {name: existing-secret}\nweb:\n  env:\n    OFEED_ENABLE_MAP_VIEW: "false"\n';
  const files = environmentFiles(
    'prod',
    { value: candidate(), digest: sha256 },
    previous,
    Buffer.from('qualified chart bytes'),
    '1.8.0'
  );
  const values = parse(files.find(file => file.path.endsWith('.values.yaml')).content).ofeed;
  assert.equal(values.api.env.S3_BUCKET_PUBLIC, 'existing-bucket');
  assert.equal(values.api.envFrom[0].secretRef.name, 'existing-secret');
  assert.equal(values.web.env.OFEED_ENABLE_MAP_VIEW, 'false');
  assert.equal(values.web.env.OFEED_PUBLIC_URL, 'https://ofeed.live');
  for (const name of COMPONENTS) {
    assert.equal(values[name].image.digest, sha256);
    assert.equal(values[name].image.tag, '1.8.0');
  }
  const wrapper = parse(files.find(file => file.path.endsWith('Chart.yaml')).content);
  assert.equal(wrapper.version, '1.8.0');
  assert.equal(wrapper.appVersion, '1.8.0');
  assert.equal(wrapper.dependencies[0].version, candidate().chart.version);
  assert.equal(
    files.find(file => file.path.endsWith('.tgz')).bytes.toString(),
    'qualified chart bytes'
  );
  const dev = environmentFiles(
    'dev',
    { value: candidate(), digest: sha256 },
    '',
    Buffer.from('qualified chart bytes')
  );
  assert.equal(parse(dev[0].content).ofeed.api.env.CLIENT_APP_URL, 'https://dev.ofeed.live');
});

test('managed Application preserves project, destination and sync controls', () => {
  const old =
    'apiVersion: argoproj.io/v1alpha1\nkind: Application\nmetadata: {name: ofeed}\nspec:\n  project: ofeed-prod\n  destination: {namespace: ofeed}\n  syncPolicy: {automated: {prune: true}}\n  source: {repoURL: old, targetRevision: main}\n';
  const app = parse(managedApplication(old, 'prod'));
  assert.equal(app.spec.project, 'ofeed-prod');
  assert.equal(app.spec.destination.namespace, 'ofeed');
  assert.equal(app.spec.syncPolicy.automated.prune, true);
  assert.equal(app.spec.sources[0].path, 'apps/office-lab/_apps/prod/ofeed/chart');
  assert.equal(app.spec.sources[0].targetRevision, 'main');
  assert(!app.spec.source);
});

test('promotion preserves original OCI manifest bytes and rejects an overwritten stable tag', async () => {
  const bytes = Buffer.from(
    '{ "schemaVersion": 2, "mediaType": "application/vnd.oci.image.index.v1+json", "manifests": [] }'
  );
  const registry = new Registry();
  let uploaded;
  registry.manifest = async (_repo, ref) =>
    ref === '1.8.0' && !uploaded
      ? null
      : { bytes, digest: digest(bytes), document: JSON.parse(bytes) };
  registry.request = async (_repo, _path, options) => {
    uploaded = options.body;
    return new Response(null, { status: 201 });
  };
  assert.equal(
    await registry.promote('orienteerfeed/ofeed/server', digest(bytes), '1.8.0'),
    digest(bytes)
  );
  assert.equal(uploaded, bytes);
  registry.manifest = async () => ({ digest: sha256 });
  await assert.rejects(
    registry.putManifest('orienteerfeed/ofeed/server', '1.8.0', bytes, 'application/json'),
    /already differs/
  );
});

test('registry checks content digests and does not forward bearer tokens to blob storage', async () => {
  const bytes = Buffer.from('registry data');
  const calls = [];
  const registry = new Registry({
    password: 'test-only-token',
    username: 'test',
    fetcher: async (url, options) => {
      calls.push({ url: String(url), headers: options.headers });
      if (String(url).includes('/token?')) return Response.json({ token: 'registry-only-token' });
      if (String(url).startsWith('https://storage.example/')) return new Response(bytes);
      return new Response(null, {
        status: 307,
        headers: { location: 'https://storage.example/blob' },
      });
    },
  });
  assert.deepEqual(await registry.blob('orienteerfeed/ofeed/server', digest(bytes)), bytes);
  assert.equal(calls.at(-1).headers, undefined);
  await assert.rejects(registry.blob('orienteerfeed/ofeed/server', sha256), /digest mismatch/);
});

test('REST compatibility rejects removed operations and newly required parameters', () => {
  const before = { paths: { '/events': { get: { responses: { 200: {} } } } } };
  assert.equal(openApiBreaks(before, { paths: {} }).length, 1);
  const next = structuredClone(before);
  next.paths['/events'].get.parameters = [{ in: 'query', name: 'new', required: true }];
  assert.equal(openApiBreaks(before, next).length, 1);
  assert.deepEqual(openApiBreaks(before, before), []);
});

test('Helm renders pinned digests and enforces migration prerequisite ordering', () => {
  const args = COMPONENTS.flatMap(name => [
    '--set',
    `${name}.image.tag=1.8.0`,
    '--set',
    `${name}.image.digest=${sha256}`,
  ]);
  const rendered = command('helm', [
    'template',
    'delivery',
    'deploy/helm/ofeed',
    '--set',
    'requireImageDigests=true',
    ...args,
  ]);
  assert(rendered.includes(`ghcr.io/orienteerfeed/ofeed/server:1.8.0@${sha256}`));
  assert(rendered.includes('argocd.argoproj.io/hook: Sync'));
  assert(rendered.includes('argocd.argoproj.io/sync-wave: "-20"'));
  assert(rendered.includes('argocd.argoproj.io/sync-wave: "-10"'));
  assert.throws(() =>
    command(
      'helm',
      [
        'template',
        'delivery',
        'deploy/helm/ofeed',
        '-f',
        'deploy/helm/ofeed/values-production.yaml',
        '--set',
        'requireImageDigests=true',
      ],
      { stdio: 'pipe' }
    )
  );
  assert.throws(() =>
    command(
      'helm',
      [
        'template',
        'delivery',
        'deploy/helm/ofeed',
        '-f',
        'deploy/helm/ofeed/values-production.yaml',
        '--set',
        'api.image.tag=latest',
      ],
      { stdio: 'pipe' }
    )
  );
});

test('workflow definitions parse and keep production publishing dependent on verification', () => {
  const release = parse(readFileSync('.github/workflows/release.yaml', 'utf8'));
  assert.equal(release.jobs.release.needs, 'verify');
  assert.equal(release.concurrency['cancel-in-progress'], false);
  const candidate = parse(readFileSync('.github/workflows/publish-images-ghcr.yaml', 'utf8'));
  assert(candidate.on.push.branches.includes('develop'));
  assert(!candidate.on.push.tags);
  assert.equal(candidate.jobs['update-dev'].if, "github.ref == 'refs/heads/develop'");
});
