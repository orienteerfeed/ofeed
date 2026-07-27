import { beforeEach, describe, expect, it, vi } from 'vitest';

const ejsMock = vi.hoisted(() => ({ renderFile: vi.fn() }));
const sendEmailMock = vi.hoisted(() => vi.fn());
const qrCodeMock = vi.hoisted(() => ({ toDataURL: vi.fn() }));

vi.mock('ejs', () => ({ default: ejsMock }));
vi.mock('../../../utils/email.js', () => ({ sendEmail: sendEmailMock }));
vi.mock('qrcode', () => ({ default: qrCodeMock }));

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

describe('entry email notifications', () => {
  beforeEach(() => {
    ejsMock.renderFile.mockReset();
    ejsMock.renderFile.mockResolvedValue('<html>email</html>');
    sendEmailMock.mockReset();
    qrCodeMock.toDataURL.mockReset();
    qrCodeMock.toDataURL.mockResolvedValue('data:image/png;base64,qr-code');
  });

  it('notifies the entrant and event owner when an order is received', async () => {
    await notifyEntryOrderReceived(order, event, {
      method: 'CUSTOM_PAYMENT_LINK',
      paymentUrl: 'https://payments.example.test/checkout/entry-1',
    });

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
    await notifyEntryOrderReceived(order, event, {
      method: 'QR_PAYMENT',
      qrPayment: {
        payload: 'SPD*1.0*ACC:CZ6508000000192000145399*AM:250.00*CC:CZK',
        bankAccountIban: 'CZ6508000000192000145399',
        bankAccountName: 'OK Chrudim',
        amount: 250,
        currency: 'CZK',
        paymentReference: '2612345678',
        constantSymbol: '0308',
        recipientMessage: 'OFeed QR payment - Nováková Jana',
      },
    });

    expect(qrCodeMock.toDataURL).toHaveBeenCalledWith(
      expect.stringContaining('SPD*1.0'),
      expect.objectContaining({ width: 208 }),
    );
    expect(ejsMock.renderFile).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      expect.objectContaining({
        payment: expect.objectContaining({
          heading: 'QR platba',
          qrCodeDataUrl: 'data:image/png;base64,qr-code',
          details: expect.arrayContaining([
            expect.objectContaining({ label: 'IBAN', value: 'CZ6508000000192000145399' }),
          ]),
        }),
      }),
    );
  });
});
