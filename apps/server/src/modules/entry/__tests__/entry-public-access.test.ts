import { describe, expect, it } from 'vitest';

import { createEntryOrderAccessToken, hasEntryOrderAccess } from '../entry-public-access.js';

const ENTRY_ID = 'cmroj67s10002u62cge2ya0ub';
const NOW = new Date('2026-07-17T10:00:00.000Z');
const EXPIRES_AT = new Date('2026-08-17T10:00:00.000Z');

describe('entry order public access token', () => {
  it('grants access only to its entry order until it expires', () => {
    const token = createEntryOrderAccessToken(ENTRY_ID, EXPIRES_AT);

    expect(hasEntryOrderAccess(token, ENTRY_ID, NOW)).toBe(true);
    expect(hasEntryOrderAccess(token, 'another-entry', NOW)).toBe(false);
    expect(hasEntryOrderAccess(token, ENTRY_ID, EXPIRES_AT)).toBe(false);
  });

  it('rejects a tampered token', () => {
    const token = createEntryOrderAccessToken(ENTRY_ID, EXPIRES_AT);
    const tamperedToken = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;

    expect(hasEntryOrderAccess(tamperedToken, ENTRY_ID, NOW)).toBe(false);
  });
});
