import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { analyzeCommits } from './analyzer.mjs';
import { GitHub, gitopsClient } from './github.mjs';
import { ENVIRONMENTS } from './gitops.mjs';
import {
  APP_REPOSITORY,
  GITOPS,
  POLICY,
  RECORDS,
  checkSha,
  command,
  digest,
  git,
  isMain,
  validateCandidate,
  writeJson,
} from './lib.mjs';
import { Registry } from './registry.mjs';

export async function selectQualification(number) {
  assert.match(String(number), /^\d+$/);
  const client = new GitHub();
  const pr = await client.request(`/repos/${APP_REPOSITORY}/pulls/${number}`);
  assert.equal(pr.state, 'open');
  assert.equal(pr.base.ref, 'main');
  assert.equal(pr.head.repo.full_name, APP_REPOSITORY);
  assert.match(pr.head.ref, /^(release|hotfix)\//);
  const registry = new Registry();
  const envelope = await registry.record(RECORDS, `candidate-${checkSha(pr.head.sha)}`);
  const candidate = validateCandidate(envelope.value);
  assert.equal(candidate.sourceCommit, pr.head.sha);
  assert.equal(git('rev-parse', 'HEAD'), pr.head.sha);
  assert.equal(git('rev-parse', 'HEAD^{tree}'), candidate.sourceTree);
  const mergeTree = git(
    'merge-tree',
    '--write-tree',
    checkSha(pr.base.sha),
    checkSha(pr.head.sha)
  ).split('\n')[0];
  assert.equal(
    mergeTree,
    candidate.sourceTree,
    'Update the release branch: merge result differs from the candidate'
  );
  const gitops = await gitopsClient();
  const prod = await gitops.content(GITOPS, `${ENVIRONMENTS.prod.path}/delivery.json`, 'main');
  const baseline = prod ? JSON.parse(prod) : null;
  const lastTag = git(
    'describe',
    '--tags',
    '--match',
    'v[0-9]*',
    '--abbrev=0',
    checkSha(pr.base.sha)
  );
  const history = git('log', `${lastTag}..${pr.head.sha}`, '--format=%H%x00%B%x00').split('\0');
  const commits = [];
  for (let i = 0; i + 1 < history.length; i += 2)
    commits.push({ hash: history[i].trim(), message: history[i + 1].trim() });
  const releaseType = await analyzeCommits(
    {},
    { commits, cwd: process.cwd(), env: {}, logger: { log() {} } }
  );
  const evidence = {
    schemaVersion: 1,
    policy: POLICY,
    repository: APP_REPOSITORY,
    pr: pr.number,
    head: pr.head.sha,
    base: pr.base.sha,
    tree: mergeTree,
    candidateDigest: envelope.digest,
    productionDigest: baseline?.candidateDigest ?? null,
    runId: Number(process.env.GITHUB_RUN_ID),
    releaseType,
  };
  writeJson('candidate.json', envelope);
  writeJson('baseline.json', baseline);
  writeJson('qualification.json', evidence);
  return evidence;
}

export async function verifyQualification(client, pr, mergedSha) {
  const commit = await client.request(
    `/repos/${APP_REPOSITORY}/git/commits/${checkSha(mergedSha)}`
  );
  // Preserve Conventional Commits from the release branch in main's history.
  assert.equal(commit.parents.length, 2, 'Release PRs require a merge commit, not squash/rebase');
  assert.equal(
    commit.parents[1].sha,
    pr.head.sha,
    'Release merge does not contain the qualified head'
  );
  const base = commit.parents[0]?.sha;
  assert(base, 'Missing merge base');
  const runs = await client.pages(
    `/repos/${APP_REPOSITORY}/actions/workflows/qualify-release.yaml/runs?head_sha=${pr.head.sha}`,
    'workflow_runs'
  );
  for (const run of runs) {
    if (
      run.status !== 'completed' ||
      run.conclusion !== 'success' ||
      run.head_repository?.full_name !== APP_REPOSITORY
    )
      continue;
    if (!['pull_request', 'workflow_dispatch'].includes(run.event)) continue;
    const artifacts = await client.pages(
      `/repos/${APP_REPOSITORY}/actions/runs/${run.id}/artifacts`,
      'artifacts'
    );
    const artifact = artifacts.find(item => item.name === 'release-qualification' && !item.expired);
    if (!artifact) continue;
    const bytes = await client.request(
      `/repos/${APP_REPOSITORY}/actions/artifacts/${artifact.id}/zip`,
      { raw: true }
    );
    assert(bytes.length < 1_000_000, 'Oversized qualification artifact');
    if (artifact.digest) assert.equal(digest(bytes), artifact.digest);
    const directory = mkdtempSync(join(tmpdir(), 'ofeed-qualification-'));
    let evidence;
    try {
      const zip = join(directory, 'artifact.zip');
      writeFileSync(zip, bytes);
      evidence = JSON.parse(
        command('unzip', ['-p', zip, 'qualification.json'], { maxBuffer: 100_000 })
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
    if (
      evidence.head !== pr.head.sha ||
      evidence.base !== base ||
      evidence.tree !== commit.tree.sha ||
      evidence.pr !== pr.number ||
      evidence.runId !== run.id ||
      evidence.policy !== POLICY ||
      evidence.repository !== APP_REPOSITORY
    )
      continue;
    const envelope = await new Registry().record(RECORDS, evidence.candidateDigest);
    const candidate = validateCandidate(envelope.value);
    assert.equal(candidate.sourceCommit, evidence.head);
    assert.equal(candidate.sourceTree, evidence.tree);
    const gitops = await gitopsClient();
    const current = await gitops.content(GITOPS, `${ENVIRONMENTS.prod.path}/delivery.json`, 'main');
    assert.equal(
      current ? JSON.parse(current).candidateDigest : null,
      evidence.productionDigest,
      'Production baseline changed; requalify before release'
    );
    return { envelope, evidence };
  }
  throw new Error('No successful qualification for this exact release head, base and merge tree');
}

if (isMain(import.meta)) {
  const [mode, number] = process.argv.slice(2);
  assert.equal(mode, 'select');
  await selectQualification(number);
}
