import assert from 'node:assert/strict';

import semanticRelease from 'semantic-release';

import { GitHub } from './github.mjs';
import { updateGitops } from './gitops.mjs';
import {
  APP_REPOSITORY,
  COMPONENTS,
  RECORDS,
  isMain,
  output,
  validateCandidate,
} from './lib.mjs';
import { Registry } from './registry.mjs';

export async function resumeRelease(version) {
  assert.match(version, /^\d+\.\d+\.\d+$/);
  const github = new GitHub();
  const registry = new Registry({ writable: true });
  const { value: prepared } = await registry.record(RECORDS, `release-${version}`);
  assert.equal(prepared.version, version);
  validateCandidate(prepared.candidate.value);
  const comparison = await github.request(
    `/repos/${APP_REPOSITORY}/compare/${prepared.releaseCommit}...main`
  );
  assert(['identical', 'ahead'].includes(comparison.status), 'Prepared release is not on main');
  const latest = await github.request(`/repos/${APP_REPOSITORY}/releases/latest`, {
    missing: true,
  });
  if (latest && latest.tag_name !== `v${version}`) {
    const parts = value => value.replace(/^v/, '').split('.').map(Number);
    const old = parts(version),
      current = parts(latest.tag_name);
    assert(
      !current.some(
        (value, index) =>
          value > old[index] && current.slice(0, index).every((v, i) => v === old[i])
      ),
      'A newer release already exists; refusing stale recovery'
    );
  }
  for (const name of COMPONENTS) {
    const image = prepared.candidate.value.images[name];
    await registry.promote(image.repository.replace('ghcr.io/', ''), image.digest, version);
  }
  const tag = await github.request(`/repos/${APP_REPOSITORY}/git/ref/tags/v${version}`, {
    missing: true,
  });
  if (tag) assert.equal(tag.object.sha, prepared.releaseCommit, 'Existing release tag differs');
  else
    await github.request(`/repos/${APP_REPOSITORY}/git/refs`, {
      method: 'POST',
      body: { ref: `refs/tags/v${version}`, sha: prepared.releaseCommit },
    });
  if (
    !(await github.request(`/repos/${APP_REPOSITORY}/releases/tags/v${version}`, { missing: true }))
  ) {
    await github.request(`/repos/${APP_REPOSITORY}/releases`, {
      method: 'POST',
      body: {
        tag_name: `v${version}`,
        name: `v${version}`,
        body: prepared.notes,
        draft: false,
        prerelease: false,
      },
    });
  }
  const url = await updateGitops('prod', prepared.candidate, version);
  console.log(`Production deployment awaits review: ${url}`);
  output('version', version);
}

if (isMain(import.meta)) {
  if (process.env.RESUME_VERSION) await resumeRelease(process.env.RESUME_VERSION);
  else {
    const override = process.env.RELEASE_OVERRIDE;
    if (override && override !== 'auto') process.env.SEMANTIC_RELEASE_FORCE_LEVEL = override;
    await semanticRelease();
  }
}
