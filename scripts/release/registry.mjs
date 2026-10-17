import assert from 'node:assert/strict';

import { checkDigest, digest } from './lib.mjs';

const ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ');
const RECORD_TYPE = 'application/vnd.ofeed.delivery.v1+json';

// Small OCI Distribution client: promotion PUTs the original manifest bytes.
// No pull/rebuild, platform conversion, or image-config mutation is involved.
export class Registry {
  constructor({
    username = process.env.GITHUB_ACTOR,
    password = process.env.GHCR_TOKEN ?? process.env.GITHUB_TOKEN,
    writable = process.env.GHCR_WRITE === 'true',
    fetcher = fetch,
  } = {}) {
    this.username = username;
    this.password = password;
    this.fetcher = fetcher;
    this.writable = writable;
    this.tokens = new Map();
  }

  async request(repository, suffix, { method = 'GET', headers = {}, body, missing = false } = {}) {
    assert.match(repository, /^[a-z0-9][a-z0-9._/-]+$/);
    const scope = `repository:${repository}:${!this.writable && ['GET', 'HEAD'].includes(method) ? 'pull' : 'pull,push'}`;
    if (!this.tokens.has(scope)) {
      const authHeaders = this.password
        ? {
            Authorization: `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`,
          }
        : {};
      const response = await this.fetcher(
        `https://ghcr.io/token?service=ghcr.io&scope=${encodeURIComponent(scope)}`,
        { headers: authHeaders, signal: AbortSignal.timeout(30_000) }
      );
      assert(response.ok, `GHCR authorization failed (${response.status}) for ${repository}`);
      const token = await response.json();
      assert(token.token ?? token.access_token, 'GHCR returned no token');
      this.tokens.set(scope, token.token ?? token.access_token);
    }
    const url = suffix.startsWith('https://')
      ? new URL(suffix)
      : new URL(`https://ghcr.io/v2/${repository}/${suffix}`);
    assert.equal(url.origin, 'https://ghcr.io', 'Refusing registry credential forwarding');
    const response = await this.fetcher(url, {
      method,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(60_000),
      headers: { Accept: ACCEPT, ...headers, Authorization: `Bearer ${this.tokens.get(scope)}` },
    });
    if (method === 'GET' && suffix.startsWith('blobs/') && [302, 307].includes(response.status)) {
      const blobUrl = new URL(response.headers.get('location'));
      assert.equal(blobUrl.protocol, 'https:', 'Insecure registry blob redirect');
      const blob = await this.fetcher(blobUrl, { signal: AbortSignal.timeout(60_000) });
      assert(blob.ok, `Registry blob download failed (${blob.status})`);
      return blob;
    }
    if (missing && response.status === 404) return null;
    assert(response.ok, `GHCR ${method} ${repository} failed (${response.status})`);
    return response;
  }

  async manifest(repository, reference, { missing = false } = {}) {
    assert.match(reference, /^(?:sha256:[a-f0-9]{64}|[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127})$/);
    const response = await this.request(repository, `manifests/${reference}`, { missing });
    if (!response) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    const sha = digest(bytes);
    if (reference.startsWith('sha256:'))
      assert.equal(sha, reference, 'Registry manifest digest mismatch');
    if (response.headers.get('docker-content-digest'))
      assert.equal(sha, response.headers.get('docker-content-digest'));
    return { bytes, digest: sha, document: JSON.parse(bytes.toString('utf8')) };
  }

  async putManifest(repository, tag, bytes, mediaType) {
    const expected = digest(bytes);
    const existing = await this.manifest(repository, tag, { missing: true });
    if (existing) {
      assert.equal(
        existing.digest,
        expected,
        `Immutable registry reference already differs: ${repository}:${tag}`
      );
      return expected;
    }
    await this.request(repository, `manifests/${tag}`, {
      method: 'PUT',
      body: bytes,
      headers: { 'Content-Type': mediaType },
    });
    assert.equal((await this.manifest(repository, tag)).digest, expected);
    return expected;
  }

  async promote(repository, sourceDigest, tag) {
    const manifest = await this.manifest(repository, checkDigest(sourceDigest));
    return this.putManifest(repository, tag, manifest.bytes, manifest.document.mediaType);
  }

  async blob(repository, sha) {
    const response = await this.request(repository, `blobs/${checkDigest(sha)}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(digest(bytes), sha, 'Registry blob digest mismatch');
    return bytes;
  }

  async uploadBlob(repository, bytes, mediaType) {
    const sha = digest(bytes);
    const existing = await this.request(repository, `blobs/${sha}`, {
      method: 'HEAD',
      missing: true,
    });
    if (!existing) {
      const upload = await this.request(repository, 'blobs/uploads/', { method: 'POST' });
      const url = new URL(upload.headers.get('location'), 'https://ghcr.io');
      url.searchParams.set('digest', sha);
      await this.request(repository, url.href, {
        method: 'PUT',
        body: bytes,
        headers: { 'Content-Type': 'application/octet-stream' },
      });
    }
    return { mediaType, digest: sha, size: bytes.length };
  }

  async putRecord(repository, tag, value) {
    const layer = await this.uploadBlob(
      repository,
      Buffer.from(JSON.stringify(value)),
      RECORD_TYPE
    );
    const config = await this.uploadBlob(
      repository,
      Buffer.from('{}'),
      'application/vnd.oci.empty.v1+json'
    );
    const manifest = {
      schemaVersion: 2,
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      artifactType: RECORD_TYPE,
      config,
      layers: [layer],
      annotations: { 'org.opencontainers.image.source': 'https://github.com/orienteerfeed/ofeed' },
    };
    const sha = await this.putManifest(
      repository,
      tag,
      Buffer.from(JSON.stringify(manifest)),
      manifest.mediaType
    );
    return { digest: sha, value };
  }

  async record(repository, reference) {
    const manifest = await this.manifest(repository, reference);
    assert.equal(manifest.document.artifactType, RECORD_TYPE);
    assert.equal(manifest.document.layers.length, 1);
    const layer = manifest.document.layers[0];
    assert.equal(layer.mediaType, RECORD_TYPE);
    assert(layer.size < 1_000_000, 'Oversized delivery record');
    return {
      digest: manifest.digest,
      value: JSON.parse((await this.blob(repository, layer.digest)).toString('utf8')),
    };
  }
}
