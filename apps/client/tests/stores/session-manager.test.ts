import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/config', () => ({
  config: { BASE_API_URL: 'http://localhost:3001' },
}));
const user = {
  id: 7,
  firstname: 'Test',
  lastname: 'Runner',
  email: 'session@example.test',
  role: 'USER' as const,
};
const token = (lifetime = 900) =>
  `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + lifetime }))}.signature`;
let manager: typeof import('@/stores/auth/session-manager');
let store: typeof import('@/stores/auth/auth-store').useAuthStore;
let fetchMock: ReturnType<typeof vi.fn>;
let removeListeners: Array<() => void>;
let messages: unknown[];
let receive: ((event: { data: Record<string, unknown> }) => void) | null;
const pairResponse = (accessToken: string) =>
  new Response(
    JSON.stringify({ results: { data: { accessToken, expiresIn: 900 } } }),
    { headers: { 'Content-Type': 'application/json' } }
  );

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  localStorage.clear();
  messages = [];
  removeListeners = [];
  receive = null;
  const originalWindowAdd = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation(
    (type, listener, options) => {
      originalWindowAdd(type, listener, options);
      removeListeners.push(() =>
        window.removeEventListener(type, listener, options)
      );
    }
  );
  const originalDocumentAdd = document.addEventListener.bind(document);
  vi.spyOn(document, 'addEventListener').mockImplementation(
    (type, listener, options) => {
      originalDocumentAdd(type, listener, options);
      removeListeners.push(() =>
        document.removeEventListener(type, listener, options)
      );
    }
  );
  vi.stubGlobal(
    'BroadcastChannel',
    class {
      set onmessage(listener: typeof receive) {
        receive = listener;
      }
      postMessage(message: unknown) {
        messages.push(message);
      }
    }
  );
  let lock: Promise<unknown> = Promise.resolve();
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: (_name: string, work: () => Promise<unknown>) => {
        const result = lock.then(work);
        lock = result.catch(() => {});
        return result;
      },
    },
  });
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  manager = await import('@/stores/auth/session-manager');
  store = (await import('@/stores/auth/auth-store')).useAuthStore;
});
afterEach(() => {
  removeListeners.forEach(remove => remove());
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('browser session coordinator', () => {
  it('keeps tokens out of localStorage and removes legacy credentials', () => {
    localStorage.setItem('ofeed-auth', JSON.stringify({ token: 'legacy' }));
    const access = token();
    manager.acceptSignin(access, user);
    expect(localStorage.getItem('ofeed-auth')).toBeNull();
    expect(JSON.stringify(localStorage)).not.toContain(access);
    expect(store.getState().token).toBe(access);
  });
  it('refreshes concurrent authentication failures once and sends only deviceId', async () => {
    const previous = token();
    const next = token(901);
    manager.acceptSignin(previous, user);
    fetchMock.mockResolvedValue(pairResponse(next));
    const results = await Promise.all([
      manager.refreshSession(true, previous),
      manager.refreshSession(true, previous),
    ]);
    expect(results).toEqual([next, next]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(options.body)).toEqual({
      deviceId: manager.getDeviceMetadata().deviceId,
    });
    expect(options.credentials).toBe('include');
    expect(options.headers['X-Ofeed-Session']).toBe('web');
    expect(messages).toContainEqual(
      expect.objectContaining({ type: 'session', token: next })
    );
  });
  it('refreshes two minutes before expiry', async () => {
    manager.acceptSignin(token(), user);
    fetchMock.mockResolvedValue(pairResponse(token(1800)));
    await vi.advanceTimersByTimeAsync(780_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('preserves authentication on server/network failures and clears it on terminal rejection', async () => {
    const previous = token();
    manager.acceptSignin(previous, user);
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }));
    await expect(manager.refreshSession(true)).rejects.toThrow();
    expect(store.getState().token).toBe(previous);
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    await expect(manager.refreshSession(true)).rejects.toThrow();
    expect(store.getState().token).toBe(previous);
    fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }));
    expect(await manager.refreshSession(true)).toBeNull();
    expect(store.getState().token).toBeNull();
  });
  it('retries an operation once with the same body and idempotency key', async () => {
    const previous = token();
    const next = token(901);
    manager.acceptSignin(previous, user);
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(pairResponse(next))
      .mockResolvedValueOnce(new Response('', { status: 401 }));
    const body = JSON.stringify({ operation: 'queued' });
    const response = await manager.authenticatedFetch('/operation', {
      method: 'POST',
      body,
      headers: { 'Idempotency-Key': 'stable-key' },
    });
    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const index of [0, 2]) {
      const options = fetchMock.mock.calls[index]![1];
      expect(options.body).toBe(body);
      expect(options.headers.get('Idempotency-Key')).toBe('stable-key');
    }
    expect(fetchMock.mock.calls[2]![1].headers.get('Authorization')).toBe(
      `Bearer ${next}`
    );
  });
  it('does not replay a consumed refresh credential when profile loading fails', async () => {
    fetchMock
      .mockResolvedValueOnce(pairResponse(token()))
      .mockRejectedValueOnce(new TypeError('offline'));
    await expect(manager.refreshSession()).rejects.toThrow();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { currentUser: user } }))
    );
    await manager.refreshSession();
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/refresh'))
    ).toHaveLength(1);
    expect(store.getState().user).toEqual(user);
  });
  it('persists offline logout and prevents a late refresh from restoring authentication', async () => {
    manager.acceptSignin(token(), user);
    let complete!: (response: Response) => void;
    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise<Response>(resolve => {
            complete = resolve;
          })
      )
      .mockRejectedValue(new TypeError('offline'));
    const refreshing = manager.refreshSession(true);
    await Promise.resolve();
    await Promise.resolve();
    const logout = manager.logoutSession();
    complete(pairResponse(token(901)));
    await refreshing;
    await logout;
    expect(store.getState().token).toBeNull();
    const calls = fetchMock.mock.calls.length;
    expect(await manager.refreshSession()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(calls);
    expect(localStorage.getItem('ofeed-session-disabled')).toBe('1');
  });
  it('accepts current cross-tab updates and ignores delayed tokens after account switch or logout', () => {
    manager.acceptSignin(token(), user);
    const previousRevision = localStorage.getItem('ofeed-session-revision');
    const next = token(901);
    receive?.({
      data: { type: 'session', revision: previousRevision, token: next, user },
    });
    expect(store.getState().token).toBe(next);
    localStorage.setItem('ofeed-session-revision', 'new-account-revision');
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'ofeed-session-revision' })
    );
    expect(store.getState().token).toBeNull();
    receive?.({
      data: { type: 'session', revision: previousRevision, token: next, user },
    });
    expect(store.getState().token).toBeNull();
    localStorage.setItem('ofeed-session-disabled', '1');
    receive?.({
      data: {
        type: 'session',
        revision: 'new-account-revision',
        token: next,
        user,
      },
    });
    expect(store.getState().token).toBeNull();
  });
  it('does not restore a session when logout happens during response-body parsing', async () => {
    manager.acceptSignin(token(), user);
    let finishBody!: (body: unknown) => void;
    const json = vi.fn(
      () =>
        new Promise(resolve => {
          finishBody = resolve;
        })
    );
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json })
      .mockRejectedValue(new TypeError('offline'));
    const refreshing = manager.refreshSession(true);
    await vi.waitFor(() => expect(json).toHaveBeenCalled());
    const logout = manager.logoutSession();
    finishBody({
      results: { data: { accessToken: token(901), expiresIn: 900 } },
    });
    await refreshing;
    await logout;
    expect(store.getState().token).toBeNull();
  });
  it('retries a GraphQL authentication error once and preserves its mutation body', async () => {
    manager.acceptSignin(token(), user);
    const { sessionGraphQLFetch } = await import('@/providers/apolloClient');
    const error = {
      errors: [
        { message: 'Unauthorized', extensions: { code: 'UNAUTHENTICATED' } },
      ],
    };
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify(error), {
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(pairResponse(token(901)))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { operation: true } }), {
          headers: { 'Content-Type': 'application/json' },
        })
      );
    const body = JSON.stringify({ query: 'mutation { operation }' });
    const response = await sessionGraphQLFetch('/graphql', {
      method: 'POST',
      body,
    });
    expect(await response.json()).toEqual({ data: { operation: true } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]![1].body).toBe(body);
    expect(fetchMock.mock.calls[2]![1].body).toBe(body);
  });
  it('does not refresh for authorization errors', async () => {
    manager.acceptSignin(token(), user);
    const { sessionGraphQLFetch } = await import('@/providers/apolloClient');
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ errors: [{ extensions: { code: 'FORBIDDEN' } }] }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    );
    await sessionGraphQLFetch('/graphql', { method: 'POST', body: '{}' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('does not replay a pending operation as a different signed-in user', async () => {
    manager.acceptSignin(token(), user);
    let respond!: (response: Response) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>(resolve => {
          respond = resolve;
        })
    );
    const operation = manager.authenticatedFetch('/operation', {
      method: 'POST',
      body: '{}',
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    manager.acceptSignin(token(902), {
      ...user,
      id: 8,
      email: 'other@example.test',
    });
    respond(new Response('', { status: 401 }));
    await expect(operation).rejects.toThrow('Session changed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('does not let queued offline-logout recovery revoke a new signin', async () => {
    manager.initializeSessionManager();
    let release!: () => void;
    const busy = manager.withSessionLock(
      () =>
        new Promise<void>(resolve => {
          release = resolve;
        })
    );
    await Promise.resolve();
    localStorage.setItem('ofeed-session-disabled', '1');
    await manager.bootstrapSession();
    manager.acceptSignin(token(), user);
    release();
    await busy;
    await manager.withSessionLock(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.getState().user?.id).toBe(user.id);
  });
});
