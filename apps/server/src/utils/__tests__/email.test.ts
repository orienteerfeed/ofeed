import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.hoisted(() => vi.fn());
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));
vi.mock('../../config/env.js', () => ({
  default: {
    RESEND_API_KEY: 'test-key',
    RESEND_FROM_NAME: 'OFeed',
    RESEND_FROM_EMAIL: 'noreply@example.test',
  },
}));

import { sendEmail } from '../email.js';

const message = {
  html: '<img src="cid:entry-payment-qr">',
  text: 'Payment details',
  subject: 'Entry received',
  emailTo: 'entrant@example.test',
};

describe('email transport', () => {
  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: 'test-email' }, error: null });
  });

  it('forwards the inline PNG content and CID to Resend', async () => {
    const attachments = [
      {
        filename: 'qr-platba.png',
        content: Buffer.from('png').toString('base64'),
        contentType: 'image/png',
        contentId: 'entry-payment-qr',
      },
    ];
    const onSuccess = vi.fn();
    await sendEmail({ ...message, attachments, onSuccess });

    expect(sendMock).toHaveBeenCalledWith({
      from: 'OFeed <noreply@example.test>',
      to: message.emailTo,
      html: message.html,
      text: message.text,
      subject: message.subject,
      attachments,
    });
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it('keeps ordinary emails free of attachments', async () => {
    await sendEmail(message);
    expect(sendMock.mock.calls[0]![0]).not.toHaveProperty('attachments');
  });
});
