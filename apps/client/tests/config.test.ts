import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  delete window.__OFEED_RUNTIME_CONFIG__;
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('frontend configuration', () => {
  it('uses runtime URLs and flags before Vite build values', async () => {
    vi.stubEnv('VITE_BOARD_APP_URL', 'http://localhost:5173');
    vi.stubEnv('VITE_ENABLE_MAP_VIEW', 'true');
    window.__OFEED_RUNTIME_CONFIG__ = {
      VITE_BOARD_APP_URL: 'https://board.orienteerfeed.com',
      VITE_ENABLE_MAP_VIEW: 'false',
    };

    const { config } = await import('../src/config');

    expect(config.BOARD_APP_URL).toBe('https://board.orienteerfeed.com');
    expect(config.ENABLE_MAP_VIEW).toBe(false);
  });

  it('uses the production Board domain when the URL is unconfigured', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_BOARD_APP_URL', undefined);

    const { config } = await import('../src/config');

    expect(config.BOARD_APP_URL).toBe('https://board.orienteerfeed.com');
  });

  it('keeps the local Board default for Vite development', async () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_BOARD_APP_URL', undefined);

    const { config } = await import('../src/config');

    expect(config.BOARD_APP_URL).toBe('http://localhost:5173');
  });
});
