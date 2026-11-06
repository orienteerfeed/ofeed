import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useApi } from '@/hooks/useApi';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { SSO_PROVIDER_LABELS, startSso } from '@/lib/auth/sso';
import { toast } from '@/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSsoProviders } from './SsoButtons';

type SsoIdentity = {
  provider: string;
  email: string | null;
  createdAt: string;
  lastLoginAt: string | null;
};
type SsoIdentitiesResponse = { data: { identities: SsoIdentity[] } };

export function LinkedAccounts() {
  const { t, i18n } = useTranslation();
  const providers = useSsoProviders();
  const { get, delete: del } = useApi();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['sso-identities'],
    queryFn: () => get<SsoIdentitiesResponse>(ENDPOINTS.ssoIdentities()),
    enabled: providers.length > 0,
  });

  const unlink = useMutation({
    mutationFn: (provider: string) => del<void>(ENDPOINTS.ssoUnlink(provider)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sso-identities'] });
      toast({ title: t('Sso.Linked.UnlinkSuccess') });
    },
    onError: (error: Error) => {
      toast({
        title: t('Sso.Linked.UnlinkFailed'),
        description:
          error.message === 'last_sign_in_method'
            ? t('Sso.Errors.last_sign_in_method')
            : error.message,
        variant: 'error',
      });
    },
  });

  const link = async (provider: string) => {
    try {
      await startSso(provider, 'link');
    } catch (error: unknown) {
      toast({
        title: t('Sso.StartFailed'),
        description:
          error instanceof Error
            ? error.message
            : t('Errors.Generic', 'Something went wrong'),
        variant: 'error',
      });
    }
  };

  if (providers.length === 0) return null;

  const identities = data?.data.identities ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Sso.Linked.Title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t('Sso.Linked.Description')}
        </p>
        {providers.map(provider => {
          const identity = identities.find(
            item => item.provider.toLowerCase() === provider
          );
          const label = SSO_PROVIDER_LABELS[provider] ?? provider;
          return (
            <div
              key={provider}
              role="group"
              aria-label={label}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="space-y-1">
                <p className="font-medium">{label}</p>
                <p className="text-sm text-muted-foreground">
                  {identity
                    ? t('Sso.Linked.LinkedSince', {
                        date: new Date(identity.createdAt).toLocaleDateString(
                          i18n.language
                        ),
                      })
                    : t('Sso.Linked.NotLinked')}
                </p>
              </div>
              {identity ? (
                <Button
                  variant="outline"
                  disabled={unlink.isPending}
                  onClick={() => unlink.mutate(provider)}
                >
                  {t('Sso.Linked.Unlink')}
                </Button>
              ) : (
                <Button onClick={() => void link(provider)}>
                  {t('Sso.Linked.Link')}
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
