import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserRegisterForm } from './UserRegisterForm';

import PATHNAMES from '../../../pathnames';

export const SignUpPage = () => {
  const { t } = useTranslation(['translation', 'common']);
  return (
    <div className="min-h-screen">
      <div className="grid h-screen w-screen flex-col items-center justify-center lg:max-w-none lg:grid-cols-2 lg:px-0 dark:bg-zinc-800">
        <Link
          to={PATHNAMES.signIn()}
          className="absolute right-4 top-4 md:right-8 md:top-8 dark:text-white"
        >
          {t('Pages.Auth.SignInUpPage.Login')}
        </Link>
        <div className="hidden h-full bg-muted lg:block dark:bg-zinc-600" />
        <div className="lg:p-8">
          <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
            <div className="flex flex-col space-y-2 text-center">
              <h1 className="text-2xl font-semibold tracking-tight dark:text-white">
                {t('Pages.Auth.SignInUpPage.CreateAnAccount')}
              </h1>
              <p className="text-sm text-muted-foreground dark:text-gray-400">
                {t('Pages.Auth.SignInUpPage.EnterYourEmailToSignIn')}
              </p>
            </div>
            <UserRegisterForm t={t} />
            <p className="px-8 text-center text-sm text-muted-foreground dark:text-gray-400">
              {t('Pages.Auth.SignInUpPage.ClickConsent')}{' '}
              <Link
                href="/terms"
                className="hover:text-brand underline underline-offset-4"
              >
                {t('Pages.Auth.SignInUpPage.TermsOfService')}
              </Link>{' '}
              {t('And', { ns: 'common' })}{' '}
              <Link
                href="/privacy"
                className="hover:text-brand underline underline-offset-4"
              >
                {t('Pages.Auth.SignInUpPage.PrivacyPolicy')}
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
