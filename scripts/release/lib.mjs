import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const COMPONENTS = ['api', 'web', 'board', 'ops'];
export const IMAGES = Object.freeze({
  api: 'ghcr.io/orienteerfeed/ofeed/server',
  web: 'ghcr.io/orienteerfeed/ofeed/client',
  board: 'ghcr.io/orienteerfeed/ofeed/board',
  ops: 'ghcr.io/orienteerfeed/ofeed/ops',
});
export const RECORDS = 'orienteerfeed/ofeed/delivery';
export const GITOPS = 'martinkrivda/officelab-argocd-apps';
export const APP_REPOSITORY = 'orienteerfeed/ofeed';
export const POLICY = 1;

export function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function checkSha(value) {
  assert.match(value ?? '', /^[a-f0-9]{40}$/, 'Expected a full Git commit SHA');
  return value;
}

export function checkDigest(value) {
  assert.match(value ?? '', /^sha256:[a-f0-9]{64}$/, 'Expected an OCI SHA-256 digest');
  return value;
}

export function command(name, args, options = {}) {
  return (
    execFileSync(name, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
      ...options,
    }) ?? ''
  ).trim();
}

export function git(...args) {
  return command('git', args);
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function output(name, value) {
  assert.match(name, /^[a-z_]+$/);
  assert(!String(value).includes('\n'), 'Multiline workflow output rejected');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

export function isMain(meta) {
  return process.argv[1] && fileURLToPath(meta.url) === process.argv[1];
}

export function validateCandidate(record) {
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.repository, APP_REPOSITORY);
  checkSha(record.sourceCommit);
  checkSha(record.sourceTree);
  assert.match(record.tag, /^(?:develop|candidate)-[a-f0-9]{40}(?:-r[0-9]+)?$/);
  assert.equal(record.policy, POLICY);
  assert(Number.isSafeInteger(record.runId) && record.runId > 0);
  assert.equal(Object.keys(record.images).sort().join(','), [...COMPONENTS].sort().join(','));
  for (const name of COMPONENTS) {
    assert.equal(record.images[name].repository, IMAGES[name]);
    checkDigest(record.images[name].digest);
    for (const arch of ['amd64', 'arm64']) checkDigest(record.images[name].platforms[arch]);
  }
  assert.equal(record.chart.repository, 'ghcr.io/orienteerfeed/charts/ofeed');
  assert.match(record.chart.version, /^\d+\.\d+\.\d+-candidate\.\d+$/);
  checkDigest(record.chart.digest);
  checkDigest(record.chart.packageDigest);
  return record;
}
