import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useForm, useStore } from '@tanstack/react-form';
import { Link, useRouter } from '@tanstack/react-router';

import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';
import { useTranslation } from 'react-i18next';
import { ButtonWithSpinner } from '../../../components/molecules';
import { Field } from '../../../components/organisms';
import { useAuth } from '../../../hooks';
import { AuthPageLayout } from '../../../templates';
import { toast } from '../../../utils';

interface LoginFormValues {
  email: string;
  password: string;
}

type SignInResponse = {
  signin: {
    token: string;
    user: { id: number; firstname: string; lastname: string; email: string };
  };
};
type SignInVars = { input: { username: string; password: string } };

const SIGNIN_MUTATION = gql`
  mutation SignIn($input: LoginInput) {
    signin(input: $input) {
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

export const SignInPage = () => {
  const { t } = useTranslation(['translation', 'common']);
  const router = useRouter();
  const { signin } = useAuth();
  const [doSignin, { loading: isLoadingMutation }] = useMutation<
    SignInResponse,
    SignInVars
  >(SIGNIN_MUTATION);

  // Validation functions
  const validateEmail = (value: string): string | undefined => {
    if (!value) {
      return t('validation.emailRequired', 'Email is required');
    }
    if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value)) {
      return t('validation.emailInvalid', 'Invalid email address');
    }
    return undefined;
  };

  const validatePassword = (value: string): string | undefined => {
    if (!value) {
      return t('validation.passwordRequired', 'Password is required');
    }
    return undefined;
  };

  const form = useForm({
    defaultValues: {
      email: '',
      password: '',
    },
    validators: {
      onChange: ({ value }) => {
        const errors: Partial<Record<keyof LoginFormValues, string>> = {};

        // Email validation
        const emailError = validateEmail(value.email);
        if (emailError) errors.email = emailError;

        // Password validation (only if email is present)
        if (value.email && value.password) {
          const passwordError = validatePassword(value.password);
          if (passwordError) errors.password = passwordError;
        }

        return Object.keys(errors).length > 0 ? errors : undefined;
      },
    },
    onSubmit: async ({ value }) => {
      try {
        const { data } = await doSignin({
          variables: {
            input: {
              username: value.email,
              password: value.password,
            },
          },
        });

        const payload = data?.signin;
        if (!payload?.token || !payload?.user) {
          throw new Error('Missing signin payload');
        }

        // Save the token and user to the auth store
        signin({ token: payload.token, user: payload.user });

        // Redirect po úspěšném přihlášení
        router.navigate({ to: '/' });
      } catch (error: unknown) {
        console.error('Login error:', error);
        toast({
          title: t('Errors.SignInFailedTitle', 'Sign-in failed'),
          description:
            error instanceof Error
              ? error.message
              : t('Errors.Generic', 'Something went wrong'),
          variant: 'error',
        });
      }
    },
  });

  // Get email value from form state
  const emailValue = useStore(
    form.store,
    (state: { values: LoginFormValues }) => state.values.email
  );
  const showPasswordField = emailValue && emailValue.length > 0;

  return (
    <AuthPageLayout t={t}>
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">
            {t('Pages.Auth.SignInUpPage.WelcomeBack')}
          </CardTitle>
          <CardDescription>
            {t('Pages.Auth.SignInUpPage.EnterYourEmailToSignIn')}
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

            {/* Password field - only shown when email is filled */}
            {showPasswordField && (
              <div className="space-y-2 animate-in fade-in-50 duration-300">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-medium">
                    {t('Pages.Auth.User.Password')}
                  </Label>
                  <Link
                    to="/auth/forgot-password"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t('Pages.Auth.RequestPasswordResetPage.ForgottenPassword')}
                  </Link>
                </div>
                <Field
                  form={form}
                  name="password"
                  type="password"
                  placeholder={t('Pages.Auth.User.Placeholder.Password')}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="current-password"
                  disabled={isLoadingMutation}
                  validate={validatePassword}
                  className="w-full"
                />
              </div>
            )}
          </CardContent>

          <CardFooter className="flex flex-col space-y-4">
            <ButtonWithSpinner
              type="submit"
              className="w-full"
              disabled={!form.state.canSubmit || isLoadingMutation}
              isSubmitting={isLoadingMutation}
              size="lg"
            >
              {t('Pages.Auth.SignInUpPage.SignInWithEmail')}
            </ButtonWithSpinner>

            {showPasswordField && (
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
            )}

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
