import type { IdentityProvider } from '../../../generated/prisma/client.js';
import env from '../../../config/env.js';

import { SsoError } from './sso.errors.js';
import { safeEqual } from './sso.state.js';

export interface SsoProfile {
  providerUserId: string;
  email?: string;
  /** True only when the provider guarantees the user owns the email. Enables auto-linking. */
  emailVerified: boolean;
  firstname?: string;
  lastname?: string;
}

export interface SsoProvider {
  id: IdentityProvider;
  enabled(): boolean;
  authorizeUrl(state: string): string;
  exchange(query: Record<string, string>, state: string): Promise<SsoProfile>;
}

// Flip to true only after ORIS confirms it verifies user email addresses.
export const ORIS_EMAIL_VERIFIED = false;

const oris: SsoProvider = {
  id: 'ORIS',
  // Keep discovery and routes unavailable until server-side identity exchange is implemented.
  enabled: () => false,
  authorizeUrl(state) {
    const url = new URL('/ssologin', env.ORIS_SSO_BASE_URL);
    url.searchParams.set('cid', env.ORIS_SSO_CLIENT_ID ?? '');
    url.searchParams.set('uid', state);
    return url.toString();
  },
  async exchange(query, state) {
    if (!query.uid || !safeEqual(query.uid, state)) throw new SsoError('invalid_state');
    // ponytail: the ORIS token verification call (method, POST params, response fields) is
    // documented only in redirect.php; implement it here with a POST body so the secret
    // never lands in a URL, map the ORIS person ID to providerUserId and set
    // emailVerified: ORIS_EMAIL_VERIFIED.
    throw new SsoError('provider_unavailable');
  },
};

const PROVIDERS: Record<string, SsoProvider> = { oris };

export function getSsoProvider(slug: string): SsoProvider | null {
  const provider = PROVIDERS[slug];
  return provider?.enabled() ? provider : null;
}

export function listEnabledSsoProviders(): string[] {
  return Object.entries(PROVIDERS)
    .filter(([, provider]) => provider.enabled())
    .map(([slug]) => slug);
}
