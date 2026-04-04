import { describe, expect, it } from 'vitest';

import { buildOpenApiReferenceHtml, SCALAR_API_REFERENCE_CDN } from '../openapi-reference.js';

describe('config/openapi-reference', () => {
  it('renders Scalar reference HTML with nonce-aware scripts', () => {
    const html = buildOpenApiReferenceHtml(
      {
        url: '/doc',
        theme: 'kepler',
      },
      {
        nonce: 'nonce-value',
        pageTitle: 'REST API Reference',
      },
    );

    expect(html).toContain(`<title>REST API Reference</title>`);
    expect(html).toContain(
      `<script nonce="nonce-value" src="${SCALAR_API_REFERENCE_CDN}"></script>`,
    );
    expect(html).toContain('<script nonce="nonce-value">');
    expect(html).toContain(`Scalar.createApiReference('#app', {`);
    expect(html).toContain('"url": "/doc"');
    expect(html).toContain('<link rel="icon" href="data:," />');
  });

  it('escapes closing script tags in serialized configuration', () => {
    const html = buildOpenApiReferenceHtml({
      url: '/doc',
      title: "</script><script>alert('xss')</script>",
    });

    expect(html).not.toContain("</script><script>alert('xss')</script>");
    expect(html).toContain(
      "\\u003c/script\\u003e\\u003cscript\\u003ealert('xss')\\u003c/script\\u003e",
    );
  });
});
