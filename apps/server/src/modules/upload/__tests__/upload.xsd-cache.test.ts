import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Each test gets a fresh module (and therefore a reset cache) via vi.resetModules()
// + dynamic import. This avoids cross-test cache pollution.

describe('getXsdSchema', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('fetches from GitHub and returns content on first call (cache miss)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      text: async () => '<xsd>content</xsd>',
    } as Response);

    const { getXsdSchema } = await import('../upload.xsd-cache.js');
    const result = await getXsdSchema();

    expect(result).toBe('<xsd>content</xsd>');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('returns cached content and skips fetch on second call within TTL', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      text: async () => '<xsd>content</xsd>',
    } as Response);

    const { getXsdSchema } = await import('../upload.xsd-cache.js');
    await getXsdSchema(); // populates cache
    await getXsdSchema(); // should hit cache

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('returns stale content when fetch fails after TTL expires', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(global, 'fetch');

    // First call: succeeds, populates cache
    fetchSpy.mockResolvedValueOnce({
      text: async () => '<xsd>stale</xsd>',
    } as Response);

    const { getXsdSchema } = await import('../upload.xsd-cache.js');
    await getXsdSchema();

    // Advance past the 24-hour TTL
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);

    // Second call: TTL expired, fetch throws
    fetchSpy.mockRejectedValueOnce(new Error('Network error'));
    const result = await getXsdSchema();

    expect(result).toBe('<xsd>stale</xsd>');
  });
});
