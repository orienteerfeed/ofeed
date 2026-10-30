import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/useApi';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { SSO_PROVIDER_LABELS, startSso } from '@/lib/auth/sso';
import { toast } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

type SsoProvidersResponse = { data: { providers: string[] } };

/** Providers enabled on the server; empty when none has credentials configured. */
export function useSsoProviders() {
  const { get } = useApi();
  const { data } = useQuery({
    queryKey: ['sso-providers'],
    queryFn: () =>
      get<SsoProvidersResponse>(ENDPOINTS.ssoProviders(), { skipAuth: true }),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  return data?.data.providers ?? [];
}

export function SsoButtons() {
  const { t } = useTranslation(['translation', 'common']);
  const providers = useSsoProviders();
  const [pending, setPending] = useState<string | null>(null);

  if (providers.length === 0) return null;

  const start = async (provider: string) => {
    setPending(provider);
    try {
      await startSso(provider, 'login');
    } catch (error: unknown) {
      setPending(null);
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

  return (
    <div className="w-full space-y-4">
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
      {providers.map(provider => (
        <Button
          key={provider}
          type="button"
          variant="outline"
          size="lg"
          className="w-full"
          disabled={pending !== null}
          onClick={() => void start(provider)}
        >
          {t('Sso.ContinueWith', {
            provider: SSO_PROVIDER_LABELS[provider] ?? provider,
          })}
        </Button>
      ))}
    </div>
  );
}
