import { config } from '@/config';
import { ENDPOINTS } from '@/lib/api/endpoints';
import {
  authenticatedFetch,
  getDeviceMetadata,
} from '@/stores/auth/session-manager';

export type SsoMode = 'login' | 'link';

export const SSO_PROVIDER_LABELS: Record<string, string> = {
  oris: 'ORIS',
  google: 'Google',
  github: 'GitHub',
};

/**
 * Asks the API for the provider authorize URL and navigates there. The request must include
 * credentials so the browser stores the API's signed SSO state cookie.
 */
export async function startSso(provider: string, mode: SsoMode) {
  const url = `${config.BASE_API_URL}${ENDPOINTS.ssoStart(provider, {
    ...getDeviceMetadata(),
    mode,
  })}`;
  const init: RequestInit = {
    credentials: 'include',
    signal: AbortSignal.timeout(15_000),
  };
  const response =
    mode === 'link'
      ? await authenticatedFetch(url, init)
      : await fetch(url, init);
  if (!response.ok) {
    throw new Error(`SSO start failed with status ${response.status}`);
  }
  const authorizeUrl: unknown = (await response.json()).results?.data
    ?.authorizeUrl;
  if (typeof authorizeUrl !== 'string' || !/^https:\/\//.test(authorizeUrl)) {
    throw new Error('Invalid SSO authorize URL');
  }
  window.location.assign(authorizeUrl);
}
