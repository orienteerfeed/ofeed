import { useRouter } from '@tanstack/react-router';
import { ApolloProvider as Provider } from '@apollo/client/react';
import * as React from 'react';
import { createApolloClient } from './apolloClient';
import { getGraphQLUrls, getToken } from '@/lib/api/apollo-client-helper';
import {
  bootstrapSession,
  initializeSessionManager,
} from '@/stores/auth/session-manager';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/utils';
import { useTranslation } from 'react-i18next';

export function ApolloProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [client] = React.useState(() =>
    createApolloClient(getGraphQLUrls(), getToken)
  );
  const disposal = React.useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  React.useEffect(() => {
    clearTimeout(disposal.current);
    initializeSessionManager();
    void bootstrapSession().catch(() => {});
    const unsubscribe = useAuthStore.subscribe((state, previous) => {
      if (
        (previous.token && !state.token) ||
        state.user?.id !== previous.user?.id
      ) {
        void client.clearStore();
        void router.invalidate();
      }
    });
    return () => {
      unsubscribe();
      disposal.current = setTimeout(() => client.stop(), 0);
    };
  }, [client, router]);
  React.useEffect(() => {
    const unconfirmed = () =>
      toast({ title: t('Sessions.LogoutUnconfirmed'), variant: 'error' });
    window.addEventListener('ofeed-logout-unconfirmed', unconfirmed);
    return () =>
      window.removeEventListener('ofeed-logout-unconfirmed', unconfirmed);
  }, [t]);
  return <Provider client={client}>{children}</Provider>;
}
