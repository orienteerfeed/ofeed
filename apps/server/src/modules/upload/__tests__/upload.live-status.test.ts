import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../live-status/live-status.external.js', () => ({ registerUploadSource: vi.fn() }));
vi.mock('../../../utils/context.js', () => ({
  default: { eventImportState: { findFirst: vi.fn() } },
}));
import { registerUploadSource } from '../../live-status/live-status.external.js';
import { parseXmlForTesting } from '../upload.handlers.js';
import prisma from '../../../utils/context.js';
const { noteSuccessfulApplicationUpload } = parseXmlForTesting;
function context(type: 'jwt' | 'eventBasic' = 'eventBasic') {
  const json = vi.fn();
  const warn = vi.fn();
  const c = {
    get: (key: string) =>
      key === 'authContext'
        ? { isAuthenticated: true, type, eventId: 'race', userId: 1 }
        : key === 'logger'
          ? { warn }
          : {},
    req: { header: () => undefined },
    json,
  } as unknown as Parameters<typeof noteSuccessfulApplicationUpload>[0];
  return { c, json, warn };
}
describe('additive IOF upload telemetry hook', () => {
  beforeEach(() => {
    vi.mocked(registerUploadSource).mockReset();
  });
  it('never changes the upload response when auxiliary registration fails', async () => {
    vi.mocked(registerUploadSource).mockRejectedValue(new Error('Telemetry DB unavailable'));
    const { c, json, warn } = context();
    await expect(
      noteSuccessfulApplicationUpload(c, 'race', 'QuickEvent 2.0'),
    ).resolves.toBeUndefined();
    expect(json).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
  });
  it('leaves existing JWT uploads untouched', async () => {
    const { c, json } = context('jwt');
    await noteSuccessfulApplicationUpload(c, 'race', 'QuickEvent 2.0');
    expect(registerUploadSource).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
  });
  it('recognizes legacy identical re-uploads from existing import metadata', async () => {
    vi.mocked(prisma.eventImportState.findFirst).mockResolvedValue({
      creator: 'oChecklist 1.0',
    } as never);
    const { c } = context();
    await noteSuccessfulApplicationUpload(c, 'race', undefined, 'hash');
    expect(registerUploadSource).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ type: 'eventBasic' }),
      'race',
      'oChecklist 1.0',
      undefined,
      undefined,
      undefined,
    );
  });
});
