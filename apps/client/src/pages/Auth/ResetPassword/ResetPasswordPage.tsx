import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';
import { useForm } from '@tanstack/react-form';
import { Link, useParams, useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  ButtonWithSpinner,
  PasswordStrengthIndicator,
} from '../../../components/molecules';
import { Field } from '../../../components/organisms';
import { useAuth } from '../../../hooks';
import { AuthPageLayout } from '../../../templates';
import { toast } from '../../../utils';

interface PasswordResetFormValues {
  password: string;
  passwordConfirmation: string;
}

type ResetPasswordResponse = {
  resetPassword: {
    token: string;
    user: {
      id: number;
      firstname: string;
      lastname: string;
      email: string;
      club?: string | null;
    };
  };
};
type ResetPasswordVars = { token: string; newPassword: string };

// Define the mutation
const RESET_PASSWORD_MUTATION = gql`
  mutation ResetPassword($token: String!, $newPassword: String!) {
    resetPassword(token: $token, newPassword: $newPassword) {
      token
      user {
        id
        firstname
        lastname
        email
      }
    }
  }
`;

export const ResetPasswordPage = () => {
  const { t } = useTranslation(['translation', 'common']);
  const router = useRouter();
  const { signin } = useAuth();
  const { token } = useParams({ from: '/auth/reset-password/$token' });
  const [doResetPassword, { loading: isLoadingMutation }] = useMutation<
    ResetPasswordResponse,
    ResetPasswordVars
  >(RESET_PASSWORD_MUTATION);

  // Validation functions
  const validatePassword = (value: string): string | undefined => {
    if (!value) {
      return t('validation.passwordRequired', 'Password is required');
    }
    if (value.length < 8) {
      return t(
        'validation.passwordMinLength',
        'Password must be at least 8 characters'
      );
    }
    return undefined;
  };

  const validatePasswordConfirmation = (value: string): string | undefined => {
    const password = form.getFieldValue('password');
    if (!value) {
      return t(
        'validation.confirmPasswordRequired',
        'Please confirm your password'
      );
    }
    if (value !== password) {
      return t('validation.passwordsDoNotMatch', 'Passwords do not match');
    }
    return undefined;
  };

  const form = useForm({
    defaultValues: {
      password: '',
      passwordConfirmation: '',
    },
    validators: {
      onChange: ({ value }) => {
        const errors: Partial<Record<keyof PasswordResetFormValues, string>> =
          {};

        // Password validation
        if (value.password) {
          const passwordError = validatePassword(value.password);
          if (passwordError) errors.password = passwordError;
        }

        // Password confirmation validation (only if password is filled)
        if (value.password && value.passwordConfirmation) {
          const passwordConfirmationError = validatePasswordConfirmation(
            value.passwordConfirmation
          );
          if (passwordConfirmationError)
            errors.passwordConfirmation = passwordConfirmationError;
        }

        return Object.keys(errors).length > 0 ? errors : undefined;
      },
    },
    onSubmit: async ({ value }) => {
      try {
        const { data } = await doResetPassword({
          variables: {
            token: token,
            newPassword: value.password,
          },
        });

        const payload = data?.resetPassword;
        if (!payload?.token || !payload?.user) {
          throw new Error('Missing resetPassword payload');
        }

        // Save the token and user to the auth store
        signin({ token: payload.token, user: payload.user });

        // Simulate successful password reset
        console.log('Password reset successful');

        // Redirect after successful login
        router.navigate({ to: '/' });
      } catch (error: any) {
        console.error('Password reset error:', error);
        toast({
          title: t('Errors.ResetPasswordFailedTitle', 'Reset password failed'),
          description:
            error?.message ?? t('Errors.Generic', 'Something went wrong'),
          variant: 'error',
        });
      }
    },
  });

  return (
    <AuthPageLayout t={t}>
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">
            {t('Pages.Auth.PasswordResetPage.ResetYourPassword')}
          </CardTitle>
          <CardDescription>
            {t('Pages.Auth.PasswordResetPage.EnterYourNewPassword')}
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
            {/* Password field */}
            <div className="space-y-2">
              <form.Field name="password">
                {field => (
                  <>
                    <Label htmlFor="password" className="text-sm font-medium">
                      {t('Pages.Auth.PasswordResetPage.NewPassword')}
                    </Label>
                    <Field
                      form={form}
                      name="password"
                      type="password"
                      placeholder={t('Pages.Auth.User.Placeholder.NewPassword')}
                      autoCapitalize="none"
                      autoCorrect="off"
                      autoComplete="new-password"
                      disabled={isLoadingMutation}
                      validate={validatePassword}
                      className="w-full"
                    />
                    {field.state.value && (
                      <PasswordStrengthIndicator password={field.state.value} />
                    )}
                  </>
                )}
              </form.Field>
            </div>

            {/* Password confirmation field */}
            <div className="space-y-2">
              <Label
                htmlFor="passwordConfirmation"
                className="text-sm font-medium"
              >
                {t('Pages.Auth.User.Placeholder.PasswordConfirmation')}
              </Label>
              <Field
                form={form}
                name="passwordConfirmation"
                type="password"
                placeholder={t(
                  'Pages.Auth.User.Placeholder.PasswordConfirmation'
                )}
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="new-password"
                disabled={isLoadingMutation}
                validate={validatePasswordConfirmation}
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
                ? t('Pages.Auth.PasswordResetPage.ResettingPassword')
                : t('Pages.Auth.PasswordResetPage.ResetPassword')}
            </ButtonWithSpinner>

            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  {t('Or', { ns: 'common' })}
                </span>
              </div>
            </div>

            <p className="text-center text-sm text-muted-foreground">
              {t('Pages.Auth.SignInUpPage.DontHaveAnAccount')}{' '}
              <Link
                to="/auth/signup"
                className="text-foreground hover:underline font-medium transition-colors"
              >
                {t('Pages.Auth.SignInUpPage.SignUp')}
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </AuthPageLayout>
  );
};
