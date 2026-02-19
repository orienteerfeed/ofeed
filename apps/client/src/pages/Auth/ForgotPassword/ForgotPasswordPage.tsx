import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import PATHNAMES from '@/lib/paths/pathnames';
import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';
import { useForm } from '@tanstack/react-form';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/atoms';
import { ButtonWithSpinner } from '../../../components/molecules';
import { Field } from '../../../components/organisms';
import config from '../../../config';
import { AuthPageLayout } from '../../../templates';
import { toast } from '../../../utils';

const REQUEST_PASSWORD_RESET_MUTATION = gql`
  mutation RequestPasswordReset($email: String!) {
    requestPasswordReset(email: $email) {
      message
    }
  }
`;

export const ForgotPasswordPage = () => {
  const { t } = useTranslation(['translation', 'common']);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [requestPasswordReset, { loading: isLoadingMutation }] = useMutation(
    REQUEST_PASSWORD_RESET_MUTATION
  );

  // Validation function
  const validateEmail = (value: string): string | undefined => {
    if (!value) {
      return t('validation.emailRequired', 'Email is required');
    }
    if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value)) {
      return t('validation.emailInvalid', 'Invalid email address');
    }
    return undefined;
  };

  const form = useForm({
    defaultValues: {
      email: '',
    },
    onSubmit: async ({ value }: { value: { email: string } }) => {
      try {
        console.log('Password reset request for:', value.email);

        await requestPasswordReset({
          variables: {
            email: value.email,
          },
          context: {
            headers: {
              'x-ofeed-app-reset-password-url':
                config.PUBLIC_URL + PATHNAMES.getResetPassword().to,
            },
          },
        });

        // Show success state
        setIsSubmitted(true);
      } catch (error: unknown) {
        console.error('Password reset error:', error);
        toast({
          title: t(
            'Errors.ForgotPasswordFailedTitle',
            'Forgot password failed'
          ),
          description:
            error instanceof Error
              ? error.message
              : t('Errors.Generic', 'Something went wrong'),
          variant: 'error',
        });
      }
    },
  });

  if (isSubmitted) {
    return (
      <AuthPageLayout t={t}>
        <Card className="w-full max-w-md mx-auto">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
            </div>
            <CardTitle className="text-2xl font-bold">
              {t('Pages.Auth.RequestPasswordResetPage.CheckYourEmail')}
            </CardTitle>
            <CardDescription>
              {t('Pages.Auth.RequestPasswordResetPage.PasswordResetLinkSent')}{' '}
              <strong>{form.getFieldValue('email')}</strong>
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col space-y-4">
            <Link to="/auth/signin" className="w-full">
              <Button variant="outline" className="w-full bg-transparent">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('Pages.Auth.RequestPasswordResetPage.BackToSignIn')}
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </AuthPageLayout>
    );
  }

  return (
    <AuthPageLayout t={t}>
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">
            {t('Pages.Auth.RequestPasswordResetPage.ResetPassword')}
          </CardTitle>
          <CardDescription>
            {t('Pages.Auth.RequestPasswordResetPage.EnterYourEmail')}
          </CardDescription>
        </CardHeader>

        <form
          onSubmit={e => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
        >
          <CardContent className="space-y-4">
            {/* Email field */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                {t('Pages.Auth.User.Email')}
              </Label>
              <Field
                form={form}
                name="email"
                type="email"
                placeholder={t('Pages.Auth.User.Placeholder.Email')}
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect="off"
                disabled={isLoadingMutation}
                validate={validateEmail}
                className="w-full"
              />
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-4">
            <ButtonWithSpinner
              type="submit"
              className="w-full"
              disabled={!form.state.canSubmit || isLoadingMutation}
              isSubmitting={isLoadingMutation}
              size="lg"
            >
              {isLoadingMutation
                ? t('Pages.Auth.RequestPasswordResetPage.Sending')
                : t('Pages.Auth.RequestPasswordResetPage.ResetPassword')}
            </ButtonWithSpinner>

            <Link to="/auth/signin" className="w-full">
              <Button variant="ghost" className="w-full">
                {t('Pages.Auth.RequestPasswordResetPage.BackToSignIn')}
              </Button>
            </Link>
          </CardFooter>
        </form>
      </Card>
    </AuthPageLayout>
  );
};
