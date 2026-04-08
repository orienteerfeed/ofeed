import { describe, expect, it } from 'vitest';

import { buildLocalizedDocsUrl } from '@/lib/paths/externalLinks';

describe('external link helpers', () => {
  it('keeps the base docs url for the default language', () => {
    expect(
      buildLocalizedDocsUrl('en', {
        baseUrl: 'https://docs.orienteerfeed.com/',
        defaultLanguage: 'en',
      }),
    ).toBe('https://docs.orienteerfeed.com/');
  });

  it('adds the active language path for non-default languages', () => {
    expect(
      buildLocalizedDocsUrl('cs', {
        baseUrl: 'https://docs.orienteerfeed.com/',
        defaultLanguage: 'en',
      }),
    ).toBe('https://docs.orienteerfeed.com/cs/');
  });

  it('keeps the base docs url for unsupported localized docs languages', () => {
    expect(
      buildLocalizedDocsUrl('de', {
        baseUrl: 'https://docs.orienteerfeed.com/',
        defaultLanguage: 'en',
      }),
    ).toBe('https://docs.orienteerfeed.com/');
  });

  it('normalizes locale variants before building docs url', () => {
    expect(
      buildLocalizedDocsUrl('cs-CZ', {
        baseUrl: 'https://docs.orienteerfeed.com',
        defaultLanguage: 'en',
      }),
    ).toBe('https://docs.orienteerfeed.com/cs/');
  });
});
