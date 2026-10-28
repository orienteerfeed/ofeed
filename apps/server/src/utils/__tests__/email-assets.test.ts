import ejs from 'ejs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const config = vi.hoisted(() => ({ CLIENT_APP_URL: 'https://dev.ofeed.live' }));
vi.mock('../../config/env.js', () => ({ default: config }));

import { getEmailLogoUrl } from '../email-assets.js';

const logoPath = 'images/logos/2025-04-11_orienteerfeed_logo_48x48px_logo_favicon.png';

describe('email logo assets', () => {
  it.each([
    ['https://dev.ofeed.live', 'https://dev.ofeed.live/'],
    ['https://ofeed.live/', 'https://ofeed.live/'],
    ['http://localhost:3000', 'http://localhost:3000/'],
    ['https://preview.example.test/ofeed/', 'https://preview.example.test/ofeed/'],
    [
      'https://preview.example.test/ofeed?query=value#fragment',
      'https://preview.example.test/ofeed/',
    ],
  ])('uses the configured frontend URL %s in every email template', async (baseUrl, assetBase) => {
    config.CLIENT_APP_URL = baseUrl;
    const logoUrl = getEmailLogoUrl();
    expect(logoUrl).toBe(`${assetBase}${logoPath}`);

    for (const template of ['entry-notification', 'welcome', 'password-reset']) {
      const templatePath = fileURLToPath(
        new URL(`../../views/emails/${template}.ejs`, import.meta.url),
      );
      const html = await ejs.renderFile(templatePath, {
        logoUrl,
        title: 'Test email',
        preheader: 'Test',
        recipientName: 'Jana',
        paragraphs: [],
        details: [],
        payment: null,
        entryDetailUrl: null,
        user_firstname: 'Jana',
        user_lastname: 'Nováková',
        user_email: 'entrant@example.test',
        confirm_link: 'https://example.test/verify/test-token',
        password_reset_link: 'https://example.test/reset/test-token',
        year: 2026,
      });
      expect(html).toContain(`src="${logoUrl}"`);
      if (assetBase !== 'https://ofeed.live/') {
        expect(html).not.toContain('src="https://ofeed.live/');
      }
    }
  });
});
