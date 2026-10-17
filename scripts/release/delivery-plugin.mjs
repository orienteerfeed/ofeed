import assert from 'node:assert/strict';

import { GitHub, gitopsClient, mergedReleasePr } from './github.mjs';
import { updateGitops } from './gitops.mjs';
import {
  COMPONENTS,
  RECORDS,
  output,
  validateCandidate,
  writeJson,
} from './lib.mjs';
import { verifyQualification } from './qualification.mjs';
import { Registry } from './registry.mjs';

export async function verifyConditions(_config, context) {
  if (context.options.dryRun) return;
  assert.equal(context.env.GITHUB_REF, 'refs/heads/main', 'Only main can publish a stable release');
  assert(context.env.GITHUB_TOKEN, 'Missing release token');
  // Fail before any image alias or Git tag is written if GitOps access is absent.
  await (await gitopsClient()).request('/repos/martinkrivda/officelab-argocd-apps');
}

export async function prepare(_config, context) {
  const github = new GitHub(context.env.GITHUB_TOKEN);
  const pr = await mergedReleasePr(github, context.nextRelease.gitHead);
  const { envelope, evidence } = await verifyQualification(github, pr, context.nextRelease.gitHead);
  envelope.qualification = evidence;
  const priority = { patch: 1, minor: 2, major: 3 };
  assert(
    (priority[context.nextRelease.type] ?? 0) >= (priority[evidence.releaseType] ?? 0),
    'Release version understates qualified Conventional Commits'
  );
  const registry = new Registry({ writable: true });
  for (const name of COMPONENTS) {
    const image = envelope.value.images[name];
    await registry.promote(
      image.repository.replace('ghcr.io/', ''),
      image.digest,
      context.nextRelease.version
    );
  }
  const record = {
    schemaVersion: 1,
    version: context.nextRelease.version,
    releaseCommit: context.nextRelease.gitHead,
    candidate: envelope,
    qualification: evidence,
    notes: context.nextRelease.notes,
  };
  await registry.putRecord(RECORDS, `release-${context.nextRelease.version}`, record);
  writeJson('prepared-release.json', record);
  output('version', context.nextRelease.version);
}

export async function publish(_config, context) {
  const record = await new Registry().record(RECORDS, `release-${context.nextRelease.version}`);
  assert.equal(record.value.releaseCommit, context.nextRelease.gitHead);
  validateCandidate(record.value.candidate.value);
  const url = await updateGitops('prod', record.value.candidate, context.nextRelease.version);
  context.logger.log('Production deployment awaits review: %s', url);
  return { name: 'GitOps production proposal', url };
}
