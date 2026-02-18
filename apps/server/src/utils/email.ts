import sgMail from '@sendgrid/mail';
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

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

      if (error.response) {
        console.error(error.response.body);
      }
      onError(error);
    }
  })();
};

const getMailOptions = ({ html, text, subject, emailTo }) => ({
  to: emailTo,
  from: { email: 'hello@martinkrivda.cz', name: 'Orienteerfeed' },
  subject,
  text,
  html,
});
