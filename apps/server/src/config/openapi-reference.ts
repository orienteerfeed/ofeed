const SCALAR_API_REFERENCE_CDN = 'https://cdn.jsdelivr.net/npm/@scalar/api-reference';

function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function serializeReferenceConfiguration(configuration: Record<string, unknown>) {
  return JSON.stringify(configuration, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/<\/script/gi, '<\\/script');
}

export function buildOpenApiReferenceHtml(
  configuration: Record<string, unknown>,
  options?: {
    nonce?: string;
    pageTitle?: string;
  },
) {
  const nonceAttribute = options?.nonce ? ` nonce="${escapeHtmlAttribute(options.nonce)}"` : '';
  const pageTitle = escapeHtmlAttribute(options?.pageTitle ?? 'Scalar API Reference');
  const serializedConfiguration = serializeReferenceConfiguration(configuration);

  return `<!doctype html>
<html>
  <head>
    <title>${pageTitle}</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="data:," />
  </head>
  <body>
    <div id="app"></div>
    <script${nonceAttribute} src="${SCALAR_API_REFERENCE_CDN}"></script>
    <script${nonceAttribute}>
      Scalar.createApiReference('#app', ${serializedConfiguration})
    </script>
  </body>
</html>`;
}

export { SCALAR_API_REFERENCE_CDN };
