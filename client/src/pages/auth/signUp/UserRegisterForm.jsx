import React from 'react';
import { gql, useMutation } from '@apollo/client';
import { Formik } from 'formik';
import { useNavigate } from 'react-router-dom';
import { Label } from '../../../atoms';
import { Field } from '../../../organisms';
import { useAuth, toast, translatedValidations } from '../../../utils';
import { SubmitButton } from '../../../organisms';
import AutoCompleteField from 'src/organisms/AutoCompleteField';

import PATHNAMES from '../../../pathnames';

// Define the mutation
const SIGNUP_MUTATION = gql`
  mutation Signup($input: UserInput!) {
    signup(input: $input) {
      token
      user {
        id
      }
      message
    }
  }
`;

export const UserRegisterForm = ({ t }) => {
  /*   const { data, isLoading, error } = useFetchRequest(
    'https://api.chucknorris.io/jokes/random',
  ); */
  const { object, requiredEmail, requiredString } = translatedValidations(t);
  const { signin } = useAuth();
  const navigate = useNavigate();

  const schema = object({
    firstname: requiredString,
    lastname: requiredString,
    email: requiredEmail,
    password: requiredString,
  });

  const [signup] = useMutation(SIGNUP_MUTATION);

  const onSubmitCallback = async (values, setSubmitting) => {
    try {
      const response = await signup({
        variables: {
          input: {
            firstname: values.firstname,
            lastname: values.lastname,
            email: values.email,
            password: values.password,
          },
        },
      });
      const user = {
        email: values.email,
        firstname: values.firstname,
        lastname: values.lastname,
        id: response.data.signup.user.id,
      };

      const token = response.data.signup.token;
      signin({ token, user });
      console.log('Signup successful:', response);
      navigate(PATHNAMES.event());
    } catch (error) {
      console.error('Error signing up:', error);
      toast({
        title: 'Ooh! Something went wrong.',
        description: error.message,
        variant: 'destructive',
      });
    }
    setSubmitting(false);
  };

  return (
    <Formik
      initialValues={{
        firstname: '',
        lastname: '',
        club: '',
        email: '',
        password: '',
      }}
      validationSchema={schema}
      onSubmit={(values, { setSubmitting }) => {
        onSubmitCallback(values, setSubmitting);
      }}
    >
      {({
        handleSubmit,
        /* and other goodies */
      }) => (
        <form onSubmit={handleSubmit} className="p-4 sm:p-0">
          <div className="grid gap-4">
            <div className="grid gap-1">
              <Label className="sr-only" htmlFor="firstname">
                {t('Pages.Auth.User.Firstname')}
              </Label>
              <Field
                id="firstname"
                name="firstname"
                placeholder={t('Pages.Auth.User.Placeholder.Firstname')}
                type="text"
                autoCapitalize="on"
                autoComplete="given-name"
                autoCorrect="off"
              />
            </div>
            <div className="grid gap-1">
              <Label className="sr-only" htmlFor="lastname">
                {t('Pages.Auth.User.Lastname')}
              </Label>
              <Field
                id="lastname"
                name="lastname"
                placeholder={t('Pages.Auth.User.Placeholder.Lastname')}
                type="text"
                autoCapitalize="on"
                autoComplete="family-name"
                autoCorrect="off"
              />
            </div>
            <div className="grid gap-1">
              <Label className="sr-only" htmlFor="club">
                {t('Pages.Auth.User.Club')}
              </Label>
              <AutoCompleteField
                id="club"
                name="club"
                placeholder={t('Pages.Auth.User.Placeholder.Club')}
                type="text"
                autoCapitalize="none"
                autoComplete="off"
                autoCorrect="off"
              />
            </div>
            <div className="grid gap-1">
              <Label className="sr-only" htmlFor="email">
                {t('Pages.Auth.User.Email')}
              </Label>
              <Field
                id="email"
                name="email"
                placeholder={t('Pages.Auth.User.Placeholder.Email')}
                type="email"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect="off"
              />
            </div>
            <div className="grid gap-1">
              <Label className="sr-only" htmlFor="password">
                {t('Pages.Auth.User.Password')}
              </Label>
              <Field
                id="password"
                name="password"
                placeholder={t('Pages.Auth.User.Placeholder.Password')}
                type="password"
                autoCapitalize="none"
                autoComplete="new-password"
                autoCorrect="off"
              />
            </div>
            <SubmitButton variant="default">
              {t('Pages.Auth.SignInUpPage.SignInWithEmail')}
            </SubmitButton>
          </div>
        </form>
      )}
    </Formik>
  );
};
