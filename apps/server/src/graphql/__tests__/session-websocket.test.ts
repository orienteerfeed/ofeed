import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
const mocks = vi.hoisted(() => ({
  options: undefined as unknown,
  authenticate: vi.fn(),
  verify: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('ws', () => ({
  WebSocketServer: class {
    on() {}
  },
}));
vi.mock('graphql-ws/use/ws', () => ({
  useServer: (options: unknown) => {
    mocks.options = options;
    return { dispose: mocks.dispose };
  },
}));
vi.mock('../schema.js', () => ({ schema: {} }));
vi.mock('../context.js', () => ({
  createGraphQLContextFromConnectionParams: mocks.authenticate,
  getAuthorizationHeader: (params: { Authorization?: string } | undefined) => params?.Authorization,
}));
vi.mock('../../modules/auth/access-token.js', () => ({ verifyAccessToken: mocks.verify }));
import { attachGraphQLWebSocketServer } from '../server.js';
type Context = {
  connectionParams?: { Authorization?: string };
  extra: { socket: { close: ReturnType<typeof vi.fn> } };
};
type Options = {
  onConnect: (context: Context) => Promise<boolean>;
  onClose: (context: Context) => void;
};
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});
describe('authenticated subscription expiry', () => {
  it('closes a user connection at token expiry and clears timers on disconnect', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-26T12:00:00Z'));
    mocks.authenticate.mockResolvedValue({ auth: { isAuthenticated: true } });
    mocks.verify.mockReturnValue({ exp: Date.now() / 1000 + 900 });
    attachGraphQLWebSocketServer({} as Server);
    const options = mocks.options as Options;
    const context = {
      connectionParams: { Authorization: 'Bearer access' },
      extra: { socket: { close: vi.fn() } },
    };
    expect(await options.onConnect(context)).toBe(true);
    vi.advanceTimersByTime(899_999);
    expect(context.extra.socket.close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(context.extra.socket.close).toHaveBeenCalledWith(4403, 'Access token expired');
    const second = { ...context, extra: { socket: { close: vi.fn() } } };
    mocks.verify.mockReturnValue({ exp: Date.now() / 1000 + 900 });
    await options.onConnect(second);
    options.onClose(second);
    vi.advanceTimersByTime(900_000);
    expect(second.extra.socket.close).not.toHaveBeenCalled();
  });
  it('keeps anonymous public connections and rejects invalid supplied credentials', async () => {
    vi.useFakeTimers();
    mocks.authenticate.mockResolvedValue({ auth: { isAuthenticated: false } });
    attachGraphQLWebSocketServer({} as Server);
    const options = mocks.options as Options;
    const context = { extra: { socket: { close: vi.fn() } } };
    expect(await options.onConnect(context)).toBe(true);
    expect(
      await options.onConnect({
        ...context,
        connectionParams: { Authorization: 'Bearer invalid' },
      }),
    ).toBe(false);
    vi.advanceTimersByTime(900_000);
    expect(context.extra.socket.close).not.toHaveBeenCalled();
  });
});
