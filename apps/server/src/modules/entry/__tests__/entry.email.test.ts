import { beforeEach, describe, expect, it, vi } from 'vitest';

const ejsMock = vi.hoisted(() => ({ renderFile: vi.fn() }));
const sendEmailMock = vi.hoisted(() => vi.fn());
const qrCodeMock = vi.hoisted(() => ({ toBuffer: vi.fn() }));

vi.mock('ejs', () => ({ default: ejsMock }));
vi.mock('../../../utils/email.js', () => ({ sendEmail: sendEmailMock }));
vi.mock('qrcode', () => ({ default: qrCodeMock }));
vi.mock('../../../config/env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../config/env.js')>();
  return { default: { ...actual.default, CLIENT_APP_URL: 'https://dev.ofeed.live' } };
});

import { notifyEntryOrderProcessed, notifyEntryOrderReceived } from '../entry.email.js';

const event = {
  id: 'event-1',
  name: 'Mistrovství klubu',
  date: new Date('2026-07-10T08:00:00.000Z'),
  timezone: 'Europe/Prague',
  location: 'Chrudim',
  author: { email: 'owner@example.test', firstname: 'Petr' },
};

const order = {
  id: 'entry-1',
  contactEmail: 'entrant@example.test',
  contactFirstname: 'Jana',
  contactLastname: 'Nováková',
  paymentReference: '2612345678',
  totalAmount: 250,
  currency: 'CZK',
  detailAccessToken: 'signed-entry-access-token',
  items: [
    { firstname: 'Jana', lastname: 'Nováková', className: 'D21' },
    { firstname: 'Jan', lastname: 'Novák', className: 'H21' },
  ],
};

const qrPayment = {
  payload: 'SPD*1.0*ACC:CZ6508000000192000145399*AM:250.00*CC:CZK',
  bankAccountIban: 'CZ6508000000192000145399',
  bankAccountName: 'OK Chrudim',
  amount: 250,
  currency: 'CZK',
  paymentReference: '2612345678',
  constantSymbol: '0308',
  recipientMessage: 'OFeed QR payment - Nováková Jana',
};

describe('entry email notifications', () => {
  beforeEach(() => {
    ejsMock.renderFile.mockReset();
    ejsMock.renderFile.mockResolvedValue('<html>email</html>');
    sendEmailMock.mockReset();
    qrCodeMock.toBuffer.mockReset();
    qrCodeMock.toBuffer.mockResolvedValue(Buffer.from('qr-png'));
  });

  it('notifies the entrant and event owner when an order is received', async () => {
    await notifyEntryOrderReceived(order, event, {
      method: 'CUSTOM_PAYMENT_LINK',
      paymentUrl: 'https://payments.example.test/checkout/entry-1',
    });

    expect(sendEmailMock.mock.calls.every(([mail]) => !mail.attachments)).toBe(true);
    expect(ejsMock.renderFile).toHaveBeenCalledTimes(2);
    expect(ejsMock.renderFile).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/entry-notification\.ejs$/),
      expect.objectContaining({
        title: 'OFeed – přihláška přijata: Mistrovství klubu',
        payment: expect.objectContaining({
          heading: 'Online platba',
          action: {
            label: 'Přejít k platbě',
            url: 'https://payments.example.test/checkout/entry-1',
          },
        }),
        entryDetailUrl: expect.stringContaining(
          '/events/event-1/entries/entry-1?access=signed-entry-access-token',
        ),
      }),
    );
    expect(ejsMock.renderFile).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({ payment: null }),
    );
    expect(sendEmailMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        emailTo: 'entrant@example.test',
        subject: 'OFeed – přihláška přijata: Mistrovství klubu',
      }),
    );
    expect(sendEmailMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        emailTo: 'owner@example.test',
        subject: 'OFeed – nová přihláška: Mistrovství klubu',
      }),
    );
  });

  it('notifies only the entrant when an order is processed', async () => {
    await notifyEntryOrderProcessed(order, event);

    expect(sendEmailMock.mock.calls[0]![0].attachments).toBeUndefined();
    expect(ejsMock.renderFile).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        emailTo: 'entrant@example.test',
        subject: 'OFeed – přihláška zpracována: Mistrovství klubu',
      }),
    );
  });

  it('does not skip the entrant notification when an event has no owner', async () => {
    await notifyEntryOrderReceived(order, { ...event, author: null }, { method: 'CASH' });

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ emailTo: 'entrant@example.test' }),
    );
  });

  it('embeds a QR payment code and bank details in the entrant email', async () => {
    const realQrCode = await vi.importActual<{ default: typeof import('qrcode') }>('qrcode');
    qrCodeMock.toBuffer.mockImplementation(realQrCode.default.toBuffer);
    const realEjs = await vi.importActual<typeof import('ejs')>('ejs');
    ejsMock.renderFile.mockImplementation((filename, data) =>
      realEjs.default.renderFile(filename, data),
    );
    await notifyEntryOrderReceived(order, event, {
      method: 'QR_PAYMENT',
      qrPayment,
    });

    expect(qrCodeMock.toBuffer).toHaveBeenCalledWith(
      expect.stringContaining('SPD*1.0'),
      expect.objectContaining({ width: 208 }),
    );
    expect(ejsMock.renderFile).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      expect.objectContaining({
        payment: expect.objectContaining({
          heading: 'QR platba',
          qrCode: expect.objectContaining({ contentId: 'entry-payment-qr' }),
          action: {
            label: 'Zobrazit platební údaje',
            url: expect.stringContaining(
              '/events/event-1/entries/entry-1?access=signed-entry-access-token',
            ),
          },
          details: expect.arrayContaining([
            expect.objectContaining({ label: 'IBAN', value: 'CZ6508000000192000145399' }),
          ]),
        }),
      }),
    );
    const entrantMail = sendEmailMock.mock.calls[0]![0];
    const paymentLink = entrantMail.html.match(
      /<a href="([^"]+)"[^>]*>Zobrazit platební údaje<\/a>/,
    );
    expect(paymentLink).not.toBeNull();
    const url = new URL(paymentLink![1]);
    expect(['http:', 'https:']).toContain(url.protocol);
    expect(url.pathname).toBe('/events/event-1/entries/entry-1');
    expect(url.searchParams.get('access')).toBe(order.detailAccessToken);
    const attachments = entrantMail.attachments;
    expect(attachments).toEqual([
      {
        content: expect.any(String),
        contentType: 'image/png',
        contentId: 'entry-payment-qr',
        filename: 'qr-platba.png',
      },
    ]);
    const png = Buffer.from(attachments[0].content, 'base64');
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(png.readUInt32BE(16)).toBe(208);
    expect(png.readUInt32BE(20)).toBe(208);
    expect(entrantMail.html).toContain(`src="cid:${attachments[0].contentId}"`);
    expect(entrantMail.html).not.toContain('data:image/');
    expect(entrantMail.html).toContain('src="https://dev.ofeed.live/images/logos/');
    expect(entrantMail.html).not.toContain('src="https://ofeed.live/');
    expect(sendEmailMock.mock.calls[1]![0].attachments).toBeUndefined();
    expect(entrantMail.html).not.toContain('spayd://');
    expect(entrantMail.text).not.toContain('spayd://');
    expect(entrantMail.text).toContain('?access=signed-entry-access-token');
  });

  it('keeps bank details and the entry link when QR generation fails', async () => {
    const realEjs = await vi.importActual<typeof import('ejs')>('ejs');
    ejsMock.renderFile.mockImplementation((filename, data) =>
      realEjs.default.renderFile(filename, data),
    );
    qrCodeMock.toBuffer.mockRejectedValue(new Error('QR generation failed'));

    await notifyEntryOrderReceived(order, event, { method: 'QR_PAYMENT', qrPayment });

    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const mail = sendEmailMock.mock.calls[0]![0];
    expect(mail.attachments).toBeUndefined();
    expect(mail.html).not.toContain('alt="QR kód pro platbu"');
    expect(mail.html).not.toContain('cid:');
    expect(mail.html).toContain(qrPayment.bankAccountIban);
    expect(mail.html).toContain('Zobrazit platební údaje');
    expect(mail.text).toContain(order.detailAccessToken);
  });
});
