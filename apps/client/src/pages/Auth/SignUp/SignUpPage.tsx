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
import { Link, useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  ButtonWithSpinner,
  PasswordStrengthIndicator,
} from '../../../components/molecules';
import { Field } from '../../../components/organisms';
import { useAuth } from '../../../hooks';
import { AuthPageLayout } from '../../../templates';
import { toast } from '../../../utils';

interface SignUpFormValues {
  firstName: string;
  lastName: string;
  email: string;
  club: string;
  password: string;
  confirmPassword: string;
}

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

type SignUpResponse = {
  signup: {
    token: string;
    user: { id: number };
  };
};
type SignUpVars = {
  input: {
    firstname: string;
    lastname: string;
    email: string;
    password: string;
    club?: string | null;
  };
};

export const SignUpPage = () => {
  const { t } = useTranslation(['translation', 'common']);
  const router = useRouter();
  const { signin } = useAuth();

  const [doSignup, { loading: isLoadingMutation }] = useMutation<
    SignUpResponse,
    SignUpVars
  >(SIGNUP_MUTATION);

  // Validation functions
  const validateFirstName = (value: string): string | undefined => {
    if (!value) {
      return t('validation.firstNameRequired', 'First name is required');
    }
    if (value.length < 2) {
      return t(
        'validation.firstNameMinLength',
        'First name must be at least 2 characters'
      );
    }
    return undefined;
  };

  const validateLastName = (value: string): string | undefined => {
    if (!value) {
      return t('validation.lastNameRequired', 'Last name is required');
    }
    if (value.length < 2) {
      return t(
        'validation.lastNameMinLength',
        'Last name must be at least 2 characters'
      );
    }
    return undefined;
  };

  const validateEmail = (value: string): string | undefined => {
    if (!value) {
      return t('validation.emailRequired', 'Email is required');
    }
    if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value)) {
      return t('validation.emailInvalid', 'Invalid email address');
    }
    return undefined;
  };

  const validateClub = (value: string): string | undefined => {
    if (!value) {
      return t('validation.clubRequired', 'Club is required');
    }
    return undefined;
  };

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

  const validateConfirmPassword = (value: string): string | undefined => {
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
      firstName: '',
      lastName: '',
      email: '',
      club: '',
      password: '',
      confirmPassword: '',
    },
    validators: {
      onChange: ({ value }) => {
        const errors: Partial<Record<keyof SignUpFormValues, string>> = {};

        // Basic validations
        const firstNameError = validateFirstName(value.firstName);
        if (firstNameError) errors.firstName = firstNameError;

        const lastNameError = validateLastName(value.lastName);
        if (lastNameError) errors.lastName = lastNameError;

        const emailError = validateEmail(value.email);
        if (emailError) errors.email = emailError;

        const clubError = validateClub(value.club);
        if (clubError) errors.club = clubError;

        // Password validations
        if (value.password) {
          const passwordError = validatePassword(value.password);
          if (passwordError) errors.password = passwordError;
        }

        // Confirm password validation (only if password is filled)
        if (value.password && value.confirmPassword) {
          const confirmPasswordError = validateConfirmPassword(
            value.confirmPassword
          );
          if (confirmPasswordError)
            errors.confirmPassword = confirmPasswordError;
        }

        return Object.keys(errors).length > 0 ? errors : undefined;
      },
    },
    onSubmit: async ({ value }) => {
      try {
        const { data } = await doSignup({
          variables: {
            input: {
              firstname: value.firstName,
              lastname: value.lastName,
              email: value.email,
              password: value.password,
            },
          },
        });

        const payload = data?.signup;
        if (!payload?.token || !payload?.user) {
          throw new Error('Missing signin payload');
        }

        const user = {
          id: payload.user.id,
          email: value.email,
          firstname: value.firstName,
          lastname: value.lastName,
          club: value.club,
        };

        // Save the token and user to the auth store
        signin({ token: payload.token, user: user });

        // Navigate to home page after successful registration
        router.navigate({ to: '/' });
      } catch (error: any) {
        console.error('Registration error:', error);
        toast({
          title: t('Errors.SignUpFailedTitle', 'Sign-up failed'),
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
            {t('Pages.Auth.SignInUpPage.CreateAnAccount')}
          </CardTitle>
          <CardDescription>
            {t('Pages.Auth.SignInUpPage.EnterYourInformation')}
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
            {/* Name fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName" className="text-sm font-medium">
                  {t('Pages.Auth.User.Firstname')}
                </Label>
                <Field
                  form={form}
                  name="firstName"
                  type="text"
                  placeholder={t('Pages.Auth.User.Placeholder.Firstname')}
                  autoComplete="given-name"
                  disabled={isLoadingMutation}
                  validate={validateFirstName}
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-sm font-medium">
                  {t('Pages.Auth.User.Lastname')}
                </Label>
                <Field
                  form={form}
                  name="lastName"
                  type="text"
                  placeholder={t('Pages.Auth.User.Placeholder.Lastname')}
                  autoComplete="family-name"
                  disabled={isLoadingMutation}
                  validate={validateLastName}
                  className="w-full"
                />
              </div>
            </div>

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

            {/* Club field */}
            <div className="space-y-2">
              <Label htmlFor="club" className="text-sm font-medium">
                {t('Pages.Auth.User.Club')}
              </Label>
              <Field
                form={form}
                name="club"
                type="text"
                placeholder={t('Pages.Auth.User.Placeholder.Club')}
                autoComplete="organization"
                disabled={isLoadingMutation}
                validate={validateClub}
                className="w-full"
              />
            </div>

            <div className="space-y-4 animate-in fade-in-50 duration-300">
              <div className="space-y-2">
                <form.Field name="password">
                  {field => (
                    <>
                      <Label htmlFor="password" className="text-sm font-medium">
                        {t('Pages.Auth.User.Password')}
                      </Label>
                      <Field
                        form={form}
                        name="password"
                        type="password"
                        placeholder={t('Pages.Auth.User.Placeholder.Password')}
                        autoCapitalize="none"
                        autoCorrect="off"
                        autoComplete="new-password"
                        disabled={isLoadingMutation}
                        validate={validatePassword}
                        className="w-full"
                      />
                      {field.state.value && (
                        <PasswordStrengthIndicator
                          password={field.state.value}
                        />
                      )}
                    </>
                  )}
                </form.Field>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="confirmPassword"
                  className="text-sm font-medium"
                >
                  {t('Pages.Auth.User.Placeholder.PasswordConfirmation')}
                </Label>
                <Field
                  form={form}
                  name="confirmPassword"
                  type="password"
                  placeholder={t(
                    'Pages.Auth.User.Placeholder.PasswordConfirmation'
                  )}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="new-password"
                  disabled={isLoadingMutation}
                  validate={validateConfirmPassword}
                  className="w-full"
                />
              </div>
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
                ? t('Pages.Auth.SignUpPage.CreatingAccount')
                : t('Pages.Auth.SignUpPage.CreateAccount')}
            </ButtonWithSpinner>

            <p className="text-center text-sm text-muted-foreground">
              {t('Pages.Auth.SignUpPage.AlreadyHaveAnAccount')}{' '}
              <Link
                to="/auth/signin"
                className="text-foreground hover:underline font-medium transition-colors"
              >
                {t('Pages.Auth.SignInUpPage.Login')}
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </AuthPageLayout>
  );
};
