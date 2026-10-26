import { config } from '@/config';
import type { User } from '@/types/user';
import { useAuthStore } from './auth-store';

const api = (path: string) =>
  `${config.BASE_API_URL.replace(/\/$/, '')}${path}`;
const DEVICE_KEY = 'ofeed-device';
const DISABLED_KEY = 'ofeed-session-disabled';
const REVISION_KEY = 'ofeed-session-revision';
let channel: BroadcastChannel | undefined;
let initialized = false;
let activeRevision: string | null = null;
let inFlight: Promise<string | null> | undefined;
let bootstrap: Promise<void> | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let failures = 0;

export function getDeviceMetadata() {
  let deviceId = localStorage.getItem(DEVICE_KEY);
  if (!deviceId || !/^[0-9a-f-]{36}$/i.test(deviceId)) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, deviceId);
  }
  return {
    deviceId,
    deviceName: `${navigator.platform || 'Browser'} browser`.slice(0, 100),
  };
}
function revision() {
  return localStorage.getItem(REVISION_KEY);
}
function disabled() {
  return localStorage.getItem(DISABLED_KEY) === '1';
}
function expiresAt(token: string) {
  try {
    return (
      Number(
        JSON.parse(
          atob(token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))
        ).exp
      ) * 1000
    );
  } catch {
    return 0;
  }
}
export async function withSessionLock<T>(work: () => Promise<T>): Promise<T> {
  if (!navigator.locks)
    throw new Error(
      'This browser requires Web Locks for secure session renewal'
    );
  return navigator.locks.request('ofeed-session', work);
}
function schedule(token: string | null) {
  clearTimeout(timer);
  if (!token || disabled()) return;
  timer = setTimeout(
    () => {
      void refreshSession().catch(scheduleRetry);
    },
    Math.max(1000, expiresAt(token) - Date.now() - 120_000)
  );
}
function scheduleRetry() {
  clearTimeout(timer);
  if (disabled()) return;
  const delay = Math.min(60_000, 1000 * 2 ** Math.min(failures++, 6));
  timer = setTimeout(() => {
    void refreshSession().catch(scheduleRetry);
  }, delay);
}
function clearSession() {
  clearTimeout(timer);
  useAuthStore.setState({ token: null, user: null });
}
async function sessionPost(action: 'refresh' | 'logout') {
  return fetch(api(`/rest/v1/auth/${action}`), {
    method: 'POST',
    credentials: 'include',
    signal: AbortSignal.timeout(15_000),
    headers: { 'Content-Type': 'application/json', 'X-Ofeed-Session': 'web' },
    body: JSON.stringify({ deviceId: getDeviceMetadata().deviceId }),
  });
}
async function loadUser(token: string): Promise<User> {
  const response = await fetch(api('/graphql'), {
    method: 'POST',
    credentials: 'include',
    signal: AbortSignal.timeout(15_000),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query:
        '{ currentUser { id firstname lastname email role organisation emergencyContact } }',
    }),
  });
  if (!response.ok) throw new Error('Unable to restore session');
  const result = await response.json();
  if (!result.data?.currentUser || result.errors?.length)
    throw new Error('Unable to restore session');
  return result.data.currentUser;
}

export function initializeSessionManager() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  localStorage.removeItem('ofeed-auth');
  if (!revision()) localStorage.setItem(REVISION_KEY, crypto.randomUUID());
  channel =
    typeof BroadcastChannel === 'undefined'
      ? undefined
      : new BroadcastChannel('ofeed-session');
  if (channel)
    channel.onmessage = ({ data }) => {
      if (data.revision !== revision()) return;
      if (data.type === 'logout') clearSession();
      if (
        data.type === 'session' &&
        !disabled() &&
        typeof data.token === 'string' &&
        expiresAt(data.token) > Date.now()
      ) {
        activeRevision = data.revision;
        useAuthStore.setState({ token: data.token, user: data.user });
      }
    };
  useAuthStore.subscribe((state, previous) => {
    if (state.token !== previous.token) schedule(state.token);
  });
  window.addEventListener('ofeed-signout', () => {
    void logoutSession();
  });
  const wake = () => {
    if (disabled()) {
      void confirmLogout();
      return;
    }
    if (!document.hidden) void refreshSession().catch(scheduleRetry);
  };
  window.addEventListener('online', wake);
  window.addEventListener('focus', wake);
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('storage', event => {
    if (
      (event.key === DISABLED_KEY && disabled()) ||
      (event.key === REVISION_KEY && activeRevision !== revision())
    )
      clearSession();
  });
}

export function acceptSignin(token: string, user: User) {
  initializeSessionManager();
  localStorage.setItem(REVISION_KEY, crypto.randomUUID());
  localStorage.removeItem(DISABLED_KEY);
  activeRevision = revision();
  useAuthStore.setState({ token, user });
  schedule(token);
  channel?.postMessage({ type: 'session', token, user, revision: revision() });
}

async function ensureUser(token: string, expectedRevision: string | null) {
  if (!useAuthStore.getState().user) {
    const user = await loadUser(token);
    if (revision() !== expectedRevision || disabled()) return null;
    useAuthStore.setState({ user });
  }
  return token;
}

export function refreshSession(
  force = false,
  rejectedToken?: string | null
): Promise<string | null> {
  initializeSessionManager();
  if (disabled()) return Promise.resolve(null);
  if (useAuthStore.getState().token && activeRevision !== revision())
    clearSession();
  const current = useAuthStore.getState().token;
  if (
    current &&
    ((rejectedToken && current !== rejectedToken) ||
      (!force && expiresAt(current) - Date.now() > 120_000))
  )
    return ensureUser(current, revision());
  if (inFlight) return inFlight;
  const expectedRevision = revision();
  inFlight = withSessionLock(async () => {
    if (disabled() || revision() !== expectedRevision) return null;
    const token = useAuthStore.getState().token;
    if (
      token &&
      ((rejectedToken && token !== rejectedToken) ||
        (!force && expiresAt(token) - Date.now() > 120_000))
    )
      return ensureUser(token, expectedRevision);
    const response = await sessionPost('refresh');
    if (revision() !== expectedRevision || disabled()) return null;
    if (response.status === 401) {
      localStorage.setItem(DISABLED_KEY, '1');
      clearSession();
      channel?.postMessage({ type: 'logout', revision: revision() });
      return null;
    }
    if (!response.ok)
      throw new Error('Session renewal temporarily unavailable');
    const payload = (await response.json()).results?.data;
    if (typeof payload?.accessToken !== 'string')
      throw new Error('Invalid refresh response');
    if (revision() !== expectedRevision || disabled()) return null;
    activeRevision = expectedRevision;
    // Publish the access token before loading profile data: retrying a failed profile load
    // must not replay the refresh token that was just consumed.
    useAuthStore.setState({ token: payload.accessToken });
    const user =
      useAuthStore.getState().user ?? (await loadUser(payload.accessToken));
    if (revision() !== expectedRevision || disabled()) return null;
    useAuthStore.setState({ token: payload.accessToken, user });
    failures = 0;
    schedule(payload.accessToken);
    channel?.postMessage({
      type: 'session',
      token: payload.accessToken,
      user,
      revision: revision(),
    });
    return payload.accessToken;
  }).finally(() => {
    inFlight = undefined;
  });
  return inFlight;
}
export async function bootstrapSession() {
  initializeSessionManager();
  if (!bootstrap)
    bootstrap = (async () => {
      if (disabled()) {
        void confirmLogout();
        return;
      }
      try {
        const token = await refreshSession();
        if (token && !useAuthStore.getState().user)
          useAuthStore.setState({ user: await loadUser(token) });
      } catch {
        scheduleRetry();
        throw new Error('Session restoration temporarily unavailable');
      }
    })().catch(error => {
      bootstrap = undefined;
      throw error;
    });
  return bootstrap;
}
async function confirmLogout() {
  const expectedRevision = revision();
  try {
    await withSessionLock(async () => {
      if (disabled() && revision() === expectedRevision)
        await sessionPost('logout');
    });
  } catch {
    /* The persistent disabled marker prevents silent restoration after offline logout. */
  }
}
export async function logoutSession() {
  initializeSessionManager();
  localStorage.setItem(DISABLED_KEY, '1');
  localStorage.setItem(REVISION_KEY, crypto.randomUUID());
  clearSession();
  channel?.postMessage({ type: 'logout', revision: revision() });
  try {
    const confirmed = await withSessionLock(async () => {
      if (!disabled()) return true;
      return (await sessionPost('logout')).ok;
    });
    if (!confirmed) window.dispatchEvent(new Event('ofeed-logout-unconfirmed'));
  } catch {
    window.dispatchEvent(new Event('ofeed-logout-unconfirmed'));
  }
}

export { revision as getSessionRevision };

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
) {
  const token = await refreshSession();
  const expectedRevision = revision();
  const checkSession = () => {
    if (token && expectedRevision !== revision())
      throw new Error('Session changed during request');
  };
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined)
  );
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const send = () =>
    fetch(input instanceof Request ? input.clone() : input, {
      ...init,
      headers,
    });
  const response = await send();
  checkSession();
  if (response.status !== 401 || !token) return response;
  const next = await refreshSession(true, token);
  checkSession();
  if (!next) return response;
  headers.set('Authorization', `Bearer ${next}`);
  const retried = await send();
  checkSession();
  return retried;
}
