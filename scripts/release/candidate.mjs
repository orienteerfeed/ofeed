import assert from 'node:assert/strict';
import { readdirSync, readFileSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse, stringify } from 'yaml';

import {
  APP_REPOSITORY,
  COMPONENTS,
  IMAGES,
  POLICY,
  RECORDS,
  checkSha,
  command,
  git,
  isMain,
  output,
  readJson,
  validateCandidate,
  writeJson,
} from './lib.mjs';
import { Registry } from './registry.mjs';

export async function inspectImage(registry, repository, reference, sourceCommit) {
  const manifest = await registry.manifest(repository.replace('ghcr.io/', ''), reference);
  const platforms = {};
  for (const entry of manifest.document.manifests ?? []) {
    if (entry.platform?.os !== 'linux' || !['amd64', 'arm64'].includes(entry.platform.architecture))
      continue;
    assert(!platforms[entry.platform.architecture], 'Duplicate architecture in image index');
    platforms[entry.platform.architecture] = entry.digest;
    const image = await registry.manifest(repository.replace('ghcr.io/', ''), entry.digest);
    const config = JSON.parse(
      (
        await registry.blob(repository.replace('ghcr.io/', ''), image.document.config.digest)
      ).toString('utf8')
    );
    assert.equal(
      config.config?.Labels?.['org.opencontainers.image.revision'],
      sourceCommit,
      'Image source differs from candidate'
    );
  }
  for (const arch of ['amd64', 'arm64']) assert(platforms[arch], `Missing linux/${arch} image`);
  return { repository, digest: manifest.digest, platforms };
}

export async function candidateCommand(args) {
  const registry = new Registry();
  const [mode, ...rest] = args;
  if (mode === 'probe') {
    const sha = checkSha(git('rev-parse', 'HEAD'));
    const existing = await registry.manifest(RECORDS, `candidate-${sha}`, { missing: true });
    output('reused', String(Boolean(existing)));
    if (existing) {
      const record = await registry.record(RECORDS, existing.digest);
      validateCandidate(record.value);
      assert.equal(record.value.sourceCommit, sha);
      output('candidate_digest', record.digest);
      output('tag', record.value.tag);
    } else
      output(
        'tag',
        `${process.env.GITHUB_REF_NAME === 'develop' ? 'develop' : 'candidate'}-${sha}`
      );
  } else if (mode === 'probe-image') {
    const [component, tag] = rest;
    assert(COMPONENTS.includes(component));
    const existing = await registry.manifest(IMAGES[component].replace('ghcr.io/', ''), tag, {
      missing: true,
    });
    output('exists', String(Boolean(existing)));
    if (existing)
      output(
        'digest',
        (await inspectImage(registry, IMAGES[component], existing.digest, git('rev-parse', 'HEAD')))
          .digest
      );
  } else if (mode === 'tag') {
    const sha = checkSha(git('rev-parse', 'HEAD'));
    output('tag', `${process.env.GITHUB_REF_NAME === 'develop' ? 'develop' : 'candidate'}-${sha}`);
  } else if (mode === 'image') {
    const [component, sha, path] = rest;
    assert(COMPONENTS.includes(component));
    writeJson(path, {
      component,
      ...(await inspectImage(registry, IMAGES[component], sha, checkSha(git('rev-parse', 'HEAD')))),
    });
  } else if (mode === 'chart') {
    const [directory] = rest;
    mkdirSync(directory, { recursive: true });
    cpSync('deploy/helm/ofeed', join(directory, 'ofeed'), { recursive: true });
    const path = join(directory, 'ofeed/Chart.yaml');
    const chart = parse(readFileSync(path, 'utf8'));
    chart.version = `${chart.version}-candidate.${process.env.GITHUB_RUN_ID}`;
    chart.annotations = {
      ...chart.annotations,
      'org.opencontainers.image.source': `https://github.com/${APP_REPOSITORY}`,
      'ofeed.live/source-commit': git('rev-parse', 'HEAD'),
    };
    writeFileSync(path, stringify(chart));
    const existing = await registry.manifest('orienteerfeed/charts/ofeed', chart.version, {
      missing: true,
    });
    if (existing) {
      const metadata = JSON.parse(
        (
          await registry.blob('orienteerfeed/charts/ofeed', existing.document.config.digest)
        ).toString('utf8')
      );
      assert.equal(
        metadata.annotations?.['ofeed.live/source-commit'],
        chart.annotations['ofeed.live/source-commit']
      );
    } else {
      command('helm', ['package', join(directory, 'ofeed'), '--destination', directory], {
        stdio: 'inherit',
      });
      command(
        'helm',
        [
          'push',
          join(directory, `ofeed-${chart.version}.tgz`),
          'oci://ghcr.io/orienteerfeed/charts',
        ],
        { stdio: 'inherit' }
      );
    }
    const manifest = await registry.manifest('orienteerfeed/charts/ofeed', chart.version);
    writeJson(join(directory, 'chart.json'), {
      repository: 'ghcr.io/orienteerfeed/charts/ofeed',
      version: chart.version,
      digest: manifest.digest,
      packageDigest: manifest.document.layers.find(
        layer => layer.mediaType === 'application/vnd.cncf.helm.chart.content.v1.tar+gzip'
      ).digest,
    });
  } else if (mode === 'assemble') {
    const [directory, tag] = rest;
    const images = {};
    for (const name of readdirSync(directory)) {
      if (!name.endsWith('.json') || name === 'chart.json') continue;
      const { component, ...image } = readJson(join(directory, name));
      assert(COMPONENTS.includes(component) && !images[component]);
      images[component] = image;
    }
    const record = validateCandidate({
      schemaVersion: 1,
      policy: POLICY,
      repository: APP_REPOSITORY,
      sourceCommit: git('rev-parse', 'HEAD'),
      sourceTree: git('rev-parse', 'HEAD^{tree}'),
      tag,
      runId: Number(process.env.GITHUB_RUN_ID),
      images,
      chart: readJson(join(directory, 'chart.json')),
    });
    const result = await registry.putRecord(RECORDS, `candidate-${record.sourceCommit}`, record);
    writeJson('candidate.json', { ...result, value: record });
    output('candidate_digest', result.digest);
  } else if (mode === 'fetch') {
    const [sha, path = 'candidate.json'] = rest;
    const record = await registry.record(RECORDS, `candidate-${checkSha(sha)}`);
    validateCandidate(record.value);
    assert.equal(record.value.sourceCommit, sha);
    writeJson(path, record);
    output('candidate_digest', record.digest);
  } else throw new Error(`Unknown candidate command: ${mode}`);
}

if (isMain(import.meta)) await candidateCommand(process.argv.slice(2));
