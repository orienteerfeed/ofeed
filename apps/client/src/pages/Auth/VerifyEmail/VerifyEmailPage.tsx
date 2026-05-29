import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';
import { Link, useParams } from '@tanstack/react-router';
import { AlertCircle, CheckCircle2, Loader2, MailCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/atoms';
import { useAuth } from '../../../hooks';
import { AuthPageLayout } from '../../../templates';

type VerificationStatus = 'loading' | 'success' | 'already_verified' | 'expired' | 'error';

type VerifyEmailResponse = {
  verifyEmail: {
    token: string;
    user: {
      id: number;
      firstname: string;
      lastname: string;
      email: string;
      role: 'USER' | 'ADMIN';
      organisation?: string | null;
      emergencyContact?: string | null;
    };
  };
};

type VerifyEmailVars = {
  token: string;
};

const VERIFY_EMAIL_MUTATION = gql`
  mutation VerifyEmail($token: String!) {
    verifyEmail(token: $token) {
      token
      user {
        id
        firstname
        lastname
        email
        role
        organisation
        emergencyContact
      }
    }
  }
`;

export const VerifyEmailPage = () => {
  const { t } = useTranslation(['translation', 'common']);
  const { signin } = useAuth();
  const { token } = useParams({ from: '/auth/verify-email/$token' });
  const hasVerifiedRef = useRef(false);
  const [status, setStatus] = useState<VerificationStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [verifyEmailMutation] = useMutation<VerifyEmailResponse, VerifyEmailVars>(
    VERIFY_EMAIL_MUTATION,
  );

  useEffect(() => {
    if (hasVerifiedRef.current) return;
    hasVerifiedRef.current = true;

    void (async () => {
      try {
        const { data } = await verifyEmailMutation({ variables: { token } });

        const payload = data?.verifyEmail;
        if (!payload?.token || !payload?.user) {
          throw new Error('Missing verification payload');
        }

        signin({ token: payload.token, user: payload.user });
        setStatus('success');
      } catch (error: unknown) {
        const msg =
          error instanceof Error ? error.message : t('Errors.Generic', 'Something went wrong');
        const lower = msg.toLowerCase();

        if (lower.includes('expired')) {
          setStatus('expired');
        } else if (lower.includes('already verified')) {
          setStatus('already_verified');
        } else {
          setErrorMessage(msg);
          setStatus('error');
        }
      }
    })();
  }, [verifyEmailMutation, signin, t, token]);

  const icon = {
    loading: <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />,
    success: <CheckCircle2 className="h-12 w-12 text-green-500" />,
    already_verified: <MailCheck className="h-12 w-12 text-blue-500" />,
    expired: <AlertCircle className="h-12 w-12 text-yellow-500" />,
    error: <AlertCircle className="h-12 w-12 text-destructive" />,
  }[status];

  const title = {
    loading: t('Pages.Auth.VerifyEmailPage.Verifying'),
    success: t('Pages.Auth.VerifyEmailPage.Verified'),
    already_verified: t('Pages.Auth.VerifyEmailPage.AlreadyVerified'),
    expired: t('Pages.Auth.VerifyEmailPage.TokenExpired'),
    error: t('Pages.Auth.VerifyEmailPage.Failed'),
  }[status];

  const description = {
    loading: t('Pages.Auth.VerifyEmailPage.VerifyingDescription'),
    success: t('Pages.Auth.VerifyEmailPage.VerifiedDescription'),
    already_verified: t('Pages.Auth.VerifyEmailPage.AlreadyVerifiedDescription'),
    expired: t('Pages.Auth.VerifyEmailPage.TokenExpiredDescription'),
    error: errorMessage ?? t('Pages.Auth.VerifyEmailPage.FailedDescription'),
  }[status];

  return (
    <AuthPageLayout t={t}>
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">{icon}</div>
          <CardTitle className="text-2xl font-bold">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>

        <CardContent className="text-center text-sm text-muted-foreground">
          {status === 'success' && t('Pages.Auth.VerifyEmailPage.ContinueDescription')}
        </CardContent>

        <CardFooter className="flex flex-col space-y-4">
          {(status === 'success' || status === 'already_verified') && (
            <Link to="/" className="w-full">
              <Button className="w-full">
                {t('Pages.Auth.VerifyEmailPage.ContinueToApp')}
              </Button>
            </Link>
          )}
          {(status === 'error' || status === 'expired') && (
            <Link to="/auth/signin" className="w-full">
              <Button variant="outline" className="w-full bg-transparent">
                {t('Pages.Auth.VerifyEmailPage.BackToSignIn')}
              </Button>
            </Link>
          )}
        </CardFooter>
      </Card>
    </AuthPageLayout>
  );
};
