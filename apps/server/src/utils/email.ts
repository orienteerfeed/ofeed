import sgMail from '@sendgrid/mail';
const sendgridApiKey = process.env.SENDGRID_API_KEY;
if (sendgridApiKey) {
  sgMail.setApiKey(sendgridApiKey);
}

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
      await sgMail.send(msg);
      onSuccess();
    } catch (error) {
      console.error(error);

      if (
        error &&
        typeof error === 'object' &&
        'response' in error &&
        error.response &&
        typeof error.response === 'object' &&
        'body' in error.response
      ) {
        console.error(error.response.body);
      }
      onError(error);
    }
  })();
};

const getMailOptions = ({ html, text, subject, emailTo }: SendEmailOptions) => ({
  to: emailTo,
  from: { email: 'hello@martinkrivda.cz', name: 'Orienteerfeed' },
  subject,
  text,
  html,
});
