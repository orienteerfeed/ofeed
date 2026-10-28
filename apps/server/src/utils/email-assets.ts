import env from '../config/env.js';

/** Email assets live on the public frontend, which may use a different API host. */
export function getEmailLogoUrl(): string {
  const url = new URL(env.CLIENT_APP_URL);
  const basePath = url.pathname.replace(/\/+$/, '');
  url.pathname = `${basePath}/images/logos/2025-04-11_orienteerfeed_logo_48x48px_logo_favicon.png`;
  url.search = '';
  url.hash = '';
  return url.toString();
}
