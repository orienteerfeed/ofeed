import assert from 'node:assert/strict';

import { Document, parse } from 'yaml';

import { GitHub, gitopsClient } from './github.mjs';
import {
  APP_REPOSITORY,
  COMPONENTS,
  GITOPS,
  RECORDS,
  digest,
  isMain,
  readJson,
  validateCandidate,
} from './lib.mjs';
import { Registry } from './registry.mjs';

export const ENVIRONMENTS = {
  dev: {
    branch: 'deploy/dev',
    path: 'apps/office-lab/_apps/test/ofeed',
    values: 'ofeed-test.values.yaml',
    host: 'dev.ofeed.live',
  },
  prod: {
    branch: 'main',
    path: 'apps/office-lab/_apps/prod/ofeed',
    values: 'ofeed.values.yaml',
    host: 'ofeed.live',
  },
};

export function environmentFiles(environment, envelope, previousValues, chartBytes, version) {
  const candidate = validateCandidate(envelope.value);
  assert.equal(
    digest(chartBytes),
    candidate.chart.packageDigest,
    'Vendored chart differs from qualified package'
  );
  const config = ENVIRONMENTS[environment];
  assert(config);
  const previous = previousValues ? parse(previousValues) : {};
  const values = previous.ofeed ?? previous;
  values.requireImageDigests = true;
  values.releaseVersion = version ?? candidate.tag;
  for (const name of COMPONENTS) {
    values[name] ??= {};
    values[name].image = {
      repository: candidate.images[name].repository,
      tag: version ?? candidate.tag,
      digest: candidate.images[name].digest,
      pullPolicy: 'IfNotPresent',
    };
  }
  values.api.env ??= {};
  values.api.env.CLIENT_APP_URL = `https://${config.host}`;
  values.api.env.CORS_ORIGIN = `https://${config.host}`;
  values.web.env ??= {};
  values.web.env.OFEED_PUBLIC_URL = `https://${config.host}`;
  values.web.env.OFEED_PUBLIC_API_URL = `https://${config.host}`;
  const chart = {
    apiVersion: 'v2',
    name: `ofeed-${environment}`,
    // Wrapper chart tracks the release; the vendored dependency stays the immutable qualified candidate.
    version: version ?? '1.0.0',
    ...(version && { appVersion: version }),
    type: 'application',
    dependencies: [
      {
        name: 'ofeed',
        version: candidate.chart.version,
        repository: 'oci://ghcr.io/orienteerfeed/charts',
      },
    ],
  };
  return [
    { path: `${config.path}/${config.values}`, content: String(new Document({ ofeed: values })) },
    { path: `${config.path}/chart/Chart.yaml`, content: String(new Document(chart)) },
    // Fixed filename prevents stale versions accumulating in Helm's charts directory.
    { path: `${config.path}/chart/charts/ofeed.tgz`, bytes: chartBytes },
    {
      path: `${config.path}/delivery.json`,
      content: `${JSON.stringify({ schemaVersion: 1, candidateDigest: envelope.digest, version: version ?? candidate.tag, candidate, qualification: envelope.qualification ?? null }, null, 2)}\n`,
    },
  ];
}

export function managedApplication(source, environment) {
  const document = parse(source);
  const config = ENVIRONMENTS[environment];
  document.spec.sources = [
    {
      repoURL: `git@github.com:${GITOPS}.git`,
      targetRevision: config.branch,
      path: `${config.path}/chart`,
      helm: { valueFiles: [`../${config.values}`] },
    },
    {
      repoURL: `git@github.com:${GITOPS}.git`,
      targetRevision: config.branch,
      path: `${config.path}/manifests`,
    },
  ];
  delete document.spec.source;
  return String(new Document(document));
}

export async function commitFiles(client, branch, message, buildFiles) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const ref = await client.request(`/repos/${GITOPS}/git/ref/heads/${branch}`);
    const parent = await client.request(`/repos/${GITOPS}/git/commits/${ref.object.sha}`);
    const files = await buildFiles(ref.object.sha);
    if (!files.length) return ref.object.sha;
    const tree = [];
    for (const file of files) {
      assert(
        file.path.startsWith('apps/office-lab/_apps/'),
        'GitOps write outside application paths'
      );
      const blob = await client.request(`/repos/${GITOPS}/git/blobs`, {
        method: 'POST',
        body: {
          content: file.bytes ? file.bytes.toString('base64') : file.content,
          encoding: file.bytes ? 'base64' : 'utf-8',
        },
      });
      tree.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const nextTree = await client.request(`/repos/${GITOPS}/git/trees`, {
      method: 'POST',
      body: { base_tree: parent.tree.sha, tree },
    });
    if (nextTree.sha === parent.tree.sha) return ref.object.sha;
    const commit = await client.request(`/repos/${GITOPS}/git/commits`, {
      method: 'POST',
      body: { message, tree: nextTree.sha, parents: [ref.object.sha] },
    });
    try {
      await client.request(`/repos/${GITOPS}/git/refs/heads/${branch}`, {
        method: 'PATCH',
        body: { sha: commit.sha, force: false },
      });
      return commit.sha;
    } catch (error) {
      const current = await client.request(`/repos/${GITOPS}/git/ref/heads/${branch}`);
      if (current.object.sha === ref.object.sha || attempt === 3) throw error;
    }
  }
}

async function ensureBranch(client, branch) {
  if (await client.request(`/repos/${GITOPS}/git/ref/heads/${branch}`, { missing: true })) return;
  const main = await client.request(`/repos/${GITOPS}/git/ref/heads/main`);
  await client.request(`/repos/${GITOPS}/git/refs`, {
    method: 'POST',
    body: { ref: `refs/heads/${branch}`, sha: main.object.sha },
  });
}

export async function updateGitops(
  environment,
  envelope,
  version,
  { client, registry = new Registry(), source = new GitHub() } = {}
) {
  client ??= await gitopsClient();
  const candidate = validateCandidate(envelope.value);
  const config = ENVIRONMENTS[environment];
  assert(config);
  if (environment === 'prod') {
    assert.match(version ?? '', /^\d+\.\d+\.\d+$/);
    assert(envelope.qualification, 'Production requires qualification evidence');
    assert.equal(
      envelope.qualification.candidateDigest,
      envelope.digest,
      'Qualification is bound to another candidate'
    );
    const current = await client.content(GITOPS, `${config.path}/delivery.json`, 'main');
    const baseline = current ? JSON.parse(current) : null;
    // A completed transaction is safe to retry, but never reopen its deployment.
    if (baseline?.candidateDigest === envelope.digest && baseline.version === version) return;
    assert.equal(
      baseline?.candidateDigest ?? null,
      envelope.qualification.productionDigest,
      'Production baseline changed; do not resume a stale promotion'
    );
  }
  const manifest = await registry.manifest('orienteerfeed/charts/ofeed', candidate.chart.digest);
  const layer = manifest.document.layers.find(
    item => item.mediaType === 'application/vnd.cncf.helm.chart.content.v1.tar+gzip'
  );
  assert(layer, 'Chart package not found in OCI artifact');
  const bytes = await registry.blob('orienteerfeed/charts/ofeed', layer.digest);
  const branch = environment === 'dev' ? config.branch : `deploy/ofeed-${version}`;
  await ensureBranch(client, branch);
  await commitFiles(
    client,
    branch,
    `chore(ofeed): deploy ${environment} ${version ?? candidate.tag}`,
    async ref => {
      if (environment === 'prod') {
        const existing = await client.content(GITOPS, `${config.path}/delivery.json`, ref);
        if (existing) {
          const record = JSON.parse(existing);
          if (record.version === version) {
            assert.equal(
              record.candidateDigest,
              envelope.digest,
              'Release branch contains another candidate'
            );
            return []; // Preserve human review edits on a retried production PR.
          }
        }
      }
      if (environment === 'dev') {
        const previous = await client.content(GITOPS, `${config.path}/delivery.json`, ref);
        if (previous) {
          const current = JSON.parse(previous);
          if (current.candidateDigest === envelope.digest) return [];
          const comparison = await source.request(
            `/repos/${APP_REPOSITORY}/compare/${current.candidate.sourceCommit}...${candidate.sourceCommit}`
          );
          if (comparison.status === 'behind') return [];
          assert.equal(comparison.status, 'ahead', 'Dev delivery must advance source ancestry');
        }
      }
      const previousValues = await client.content(GITOPS, `${config.path}/${config.values}`, ref);
      assert(
        previousValues,
        `Bootstrap the ${environment} GitOps configuration before enabling delivery`
      );
      const files = environmentFiles(environment, envelope, previousValues, bytes, version);
      if (environment === 'prod') {
        const path = `${config.path}/ofeed.yaml`;
        const application = await client.content(GITOPS, path, ref);
        assert(application, 'Missing production Application');
        files.push({ path, content: managedApplication(application, environment) });
      }
      return files;
    }
  );
  if (environment === 'prod') {
    const existing = await client.request(
      `/repos/${GITOPS}/pulls?state=open&head=martinkrivda:${encodeURIComponent(branch)}&base=main`
    );
    if (existing.length) return existing[0].html_url;
    const pr = await client.request(`/repos/${GITOPS}/pulls`, {
      method: 'POST',
      body: {
        title: `chore(ofeed): deploy ${version} to production`,
        head: branch,
        base: 'main',
        body: [
          `Deploy OFeed ${version} to https://ofeed.live.`,
          '',
          `Source: https://github.com/${APP_REPOSITORY}/commit/${candidate.sourceCommit}`,
          `Candidate: \`ghcr.io/${RECORDS}@${envelope.digest}\``,
          `Chart: \`${candidate.chart.version}@${candidate.chart.digest}\``,
          '',
          'All four application images are promoted by digest without rebuilding.',
          'Review database compatibility and the complete values/chart diff before merging.',
          ...(envelope.qualification.productionDigest === null
            ? [
                '**Bootstrap:** no managed production baseline was available. Fresh-database tests passed, but upgrading the legacy production schema still requires explicit operator verification and a backup.',
              ]
            : []),
          'Merge approves deployment. Roll back by reverting this PR within the supported schema compatibility window.',
        ].join('\n'),
      },
    });
    return pr.html_url;
  }
}

if (isMain(import.meta)) {
  const [environment, path = 'candidate.json', version] = process.argv.slice(2);
  const url = await updateGitops(environment, readJson(path), version);
  if (url) console.log(url);
}
