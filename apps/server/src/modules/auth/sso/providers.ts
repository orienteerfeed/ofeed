import { z } from '@hono/zod-openapi';

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

const ORIS_TIMEOUT_MS = 10_000;

const orisUserSchema = z.object({
  Status: z.string(),
  Data: z
    .object({
      ID: z.union([z.number(), z.string()]),
      FirstName: z.string().nullish(),
      LastName: z.string().nullish(),
      Email: z.string().nullish(),
    })
    .optional(),
});

const oris: SsoProvider = {
  id: 'ORIS',
  enabled: () =>
    env.ORIS_SSO_ENABLED && Boolean(env.ORIS_SSO_CLIENT_ID && env.ORIS_SSO_CLIENT_SECRET),
  authorizeUrl(state) {
    const url = new URL('/ssologin', env.ORIS_SSO_BASE_URL);
    url.searchParams.set('cid', env.ORIS_SSO_CLIENT_ID ?? '');
    url.searchParams.set('uid', state);
    return url.toString();
  },
  async exchange(query, state) {
    if (!query.uid || !safeEqual(query.uid, state)) throw new SsoError('invalid_state');
    // Server-side verification; the secret travels only in the POST body. Only ID, name and
    // email are read from the response (ClubMembers etc. are intentionally not stored).
    const response = await fetch(new URL('/API', env.ORIS_SSO_BASE_URL), {
      method: 'POST',
      body: new URLSearchParams({
        method: 'ssoUser',
        format: 'json',
        cid: env.ORIS_SSO_CLIENT_ID ?? '',
        csc: env.ORIS_SSO_CLIENT_SECRET ?? '',
        uid: state,
      }),
      signal: AbortSignal.timeout(ORIS_TIMEOUT_MS),
    });
    if (!response.ok) throw new SsoError('provider_unavailable');

    const parsed = orisUserSchema.safeParse(await response.json());
    if (!parsed.success || parsed.data.Status !== 'OK' || !parsed.data.Data) {
      throw new SsoError('provider_unavailable');
    }
    const { ID, FirstName, LastName, Email } = parsed.data.Data;
    return {
      providerUserId: String(ID),
      email: Email?.trim().toLowerCase() || undefined,
      emailVerified: ORIS_EMAIL_VERIFIED,
      firstname: FirstName || undefined,
      lastname: LastName || undefined,
    };
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
