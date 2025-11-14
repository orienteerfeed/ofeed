import sgMail from '@sendgrid/mail';
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export const sendEmail = async ({
  html,
  text,
  subject,
  emailTo,
  onSuccess = () => {},
  onError = () => {},
}) => {
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
