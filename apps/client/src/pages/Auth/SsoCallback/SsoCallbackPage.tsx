import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import PATHNAMES from '@/lib/paths/pathnames';
import { useAuthStore } from '@/stores/auth/auth-store';
import { bootstrapSession } from '@/stores/auth/session-manager';
import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthPageLayout } from '../../../templates';
import { toast } from '../../../utils';

export const SSO_ERROR_CODES = [
  'invalid_state',
  'provider_unavailable',
  'email_in_use',
  'email_required',
  'identity_taken',
  'account_inactive',
] as const;

interface SsoCallbackPageProps {
  status: 'ok' | 'error';
  mode: 'login' | 'link';
  reason?: string | undefined;
}

export const SsoCallbackPage = ({
  status,
  mode,
  reason,
}: SsoCallbackPageProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(status === 'error');

  useEffect(() => {
    if (status !== 'ok') return;
    if (mode === 'link') {
      toast({ title: t('Sso.LinkedTitle') });
      void navigate(PATHNAMES.profile());
      return;
    }
    // The session manager adopts the refresh cookie the API set during the redirect.
    bootstrapSession()
      .then(() => {
        if (!useAuthStore.getState().token) throw new Error('No session');
        return navigate({ to: '/' });
      })
      .catch(() => setFailed(true));
  }, [status, mode, navigate, t]);

  const errorKey = SSO_ERROR_CODES.find(code => code === reason);
  const backLink = mode === 'link' ? PATHNAMES.profile() : PATHNAMES.signIn();

  return (
    <AuthPageLayout t={t}>
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">
            {failed ? t('Sso.FailedTitle') : t('Sso.Completing')}
          </CardTitle>
          {failed && (
            <CardDescription role="alert">
              {t(`Sso.Errors.${errorKey ?? 'provider_unavailable'}`)}
            </CardDescription>
          )}
        </CardHeader>
        {failed && (
          <CardContent className="text-center">
            <Link
              {...backLink}
              className="text-foreground hover:underline font-medium"
            >
              {mode === 'link' ? t('Sso.BackToProfile') : t('Sso.BackToSignIn')}
            </Link>
          </CardContent>
        )}
      </Card>
    </AuthPageLayout>
  );
};
