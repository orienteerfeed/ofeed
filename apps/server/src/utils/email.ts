import { Resend } from 'resend';

import env from '../config/env.js';

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

type SendEmailOptions = {
  html: string;
  text: string;
  subject: string;
  emailTo: string;
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
};

export const sendEmail = async ({
  html,
  text,
  subject,
  emailTo,
  onSuccess = () => {},
  onError = () => {},
}: SendEmailOptions) => {
  const msg = getMailOptions({ html, text, subject, emailTo });

  (async () => {
    try {
      if (!resend) {
        throw new Error('RESEND_API_KEY is not configured');
      }

      const { error } = await resend.emails.send(msg);

      if (error) {
        throw error;
      }

      onSuccess();
    } catch (error) {
      console.error(error);
      onError(error);
    }
  })();
};

const getMailOptions = ({ html, text, subject, emailTo }: SendEmailOptions) => ({
  to: emailTo,
  from: `${env.RESEND_FROM_NAME} <${env.RESEND_FROM_EMAIL}>`,
  subject,
  text,
  html,
});
