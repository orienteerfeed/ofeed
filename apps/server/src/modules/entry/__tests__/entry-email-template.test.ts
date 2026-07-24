import ejs from 'ejs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.join(__dirname, '../../../views/emails/entry-notification.ejs');

describe('entry notification email template', () => {
  it('renders an email without an optional payment section', async () => {
    const html = await ejs.renderFile(templatePath, {
      title: 'OFeed – přihláška zpracována: Test závod',
      preheader: 'Přihláška byla zpracována.',
      recipientName: 'Jana',
      paragraphs: ['Vaše přihláška byla zpracována.'],
      details: [{ label: 'Závod', value: 'Test závod' }],
      payment: null,
      entryDetailUrl: null,
      year: 2026,
    });

    expect(html).toContain('<title>OFeed – přihláška zpracována: Test závod</title>');
    expect(html).toContain('Ahoj Jana,');
  });
});
