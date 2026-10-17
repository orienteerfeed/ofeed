import assert from 'node:assert/strict';

import { APP_REPOSITORY } from './lib.mjs';

export class GitHub {
  constructor(token = process.env.GITHUB_TOKEN, fetcher = fetch) {
    assert(token, 'A GitHub token is required');
    this.token = token;
    this.fetcher = fetcher;
  }

  async request(path, { method = 'GET', body, missing = false, raw = false } = {}) {
    assert(path.startsWith('/') && !path.startsWith('//'));
    const response = await this.fetcher(`https://api.github.com${path}`, {
      method,
      redirect: raw ? 'manual' : 'error',
      signal: AbortSignal.timeout(60_000),
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (missing && response.status === 404) return null;
    // Artifact archives redirect to a signed URL. Never forward GitHub credentials.
    if (raw && response.status === 302) {
      const url = new URL(response.headers.get('location'));
      assert.equal(url.protocol, 'https:');
      const archive = await this.fetcher(url, { signal: AbortSignal.timeout(60_000) });
      assert(archive.ok, 'Cannot download workflow artifact');
      return Buffer.from(await archive.arrayBuffer());
    }
    assert(response.ok, `GitHub ${method} ${path.split('?')[0]} failed (${response.status})`);
    if (raw) return Buffer.from(await response.arrayBuffer());
    return response.status === 204 ? null : response.json();
  }

  async pages(path, key) {
    const results = [];
    for (let page = 1; page <= 100; page++) {
      const value = await this.request(
        `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`
      );
      const items = key ? value[key] : value;
      assert(Array.isArray(items));
      results.push(...items);
      if (items.length < 100) return results;
    }
    throw new Error('GitHub pagination limit exceeded');
  }

  async content(repository, path, ref) {
    const result = await this.request(
      `/repos/${repository}/contents/${path}?ref=${encodeURIComponent(ref)}`,
      { missing: true }
    );
    if (!result) return null;
    assert.equal(result.type, 'file');
    return Buffer.from(result.content, 'base64').toString('utf8');
  }
}

export async function gitopsClient() {
  if (process.env.GITOPS_TOKEN) return new GitHub(process.env.GITOPS_TOKEN);
  throw new Error('Configure the GITOPS_TOKEN Actions secret with access to the GitOps repository');
}

export async function mergedReleasePr(client, sha) {
  const prs = await client.pages(`/repos/${APP_REPOSITORY}/commits/${sha}/pulls`);
  const matches = prs.filter(
    pr =>
      pr.merged_at &&
      pr.base.ref === 'main' &&
      pr.merge_commit_sha === sha &&
      /^(release|hotfix)\//.test(pr.head.ref) &&
      pr.head.repo?.full_name === APP_REPOSITORY
  );
  assert.equal(
    matches.length,
    1,
    'A release must merge one same-repository release/* or hotfix/* PR'
  );
  return client.request(`/repos/${APP_REPOSITORY}/pulls/${matches[0].number}`);
}
