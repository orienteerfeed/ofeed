import { describe, expect, it } from 'vitest';

import { computeSplitPublicationStatus } from '../split-publication.service.js';

describe('split-publication.service', () => {
  it('publishes split times immediately when unrestricted', () => {
    const status = computeSplitPublicationStatus({
      mode: 'UNRESTRICTED',
      now: new Date('2026-04-09T10:00:00.000Z'),
    });

    expect(status.isPublished).toBe(true);
    expect(status.isAccessible).toBe(true);
    expect(status.reason).toBe('PUBLISHED');
  });

  it('waits for the last starter when configured to publish on last start', () => {
    const status = computeSplitPublicationStatus({
      mode: 'LAST_START',
      publishAt: new Date('2026-04-09T10:30:00.000Z'),
      now: new Date('2026-04-09T10:00:00.000Z'),
    });

    expect(status.isPublished).toBe(false);
    expect(status.isAccessible).toBe(false);
    expect(status.reason).toBe('WAITING_FOR_LAST_START');
  });

  it('supports bypass access before a scheduled publication time', () => {
    const status = computeSplitPublicationStatus({
      mode: 'SCHEDULED',
      publishAt: new Date('2026-04-09T12:00:00.000Z'),
      canBypass: true,
      now: new Date('2026-04-09T10:00:00.000Z'),
    });

    expect(status.isPublished).toBe(false);
    expect(status.isAccessible).toBe(true);
    expect(status.reason).toBe('WAITING_FOR_SCHEDULED');
  });

  it('keeps disabled split publication inaccessible for public viewers', () => {
    const status = computeSplitPublicationStatus({
      mode: 'DISABLED',
      now: new Date('2026-04-09T10:00:00.000Z'),
    });

    expect(status.isPublished).toBe(false);
    expect(status.isAccessible).toBe(false);
    expect(status.reason).toBe('DISABLED');
  });
});
