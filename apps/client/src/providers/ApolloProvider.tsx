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

function ScopedApolloProvider({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(() =>
    createApolloClient(getGraphQLUrls(), getToken)
  );
  const disposal = React.useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  React.useEffect(() => {
    clearTimeout(disposal.current);
    return () => {
      disposal.current = setTimeout(() => client.stop(), 0);
    };
  }, [client]);
  return <Provider client={client}>{children}</Provider>;
}

export function ApolloProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const scope = useAuthStore(state =>
    state.token ? (state.user?.id ?? 'restoring') : 'anonymous'
  );

  React.useEffect(() => {
    initializeSessionManager();
    void bootstrapSession().catch(() => {});
    const unsubscribe = useAuthStore.subscribe((state, previous) => {
      if (
        (previous.token && !state.token) ||
        state.user?.id !== previous.user?.id
      ) {
        void router.invalidate();
      }
    });
    return () => {
      unsubscribe();
    };
  }, [router]);
  React.useEffect(() => {
    const unconfirmed = () =>
      toast({ title: t('Sessions.LogoutUnconfirmed'), variant: 'error' });
    window.addEventListener('ofeed-logout-unconfirmed', unconfirmed);
    return () =>
      window.removeEventListener('ofeed-logout-unconfirmed', unconfirmed);
  }, [t]);
  // Remount query consumers with an isolated cache before stopping the old
  // client. Clearing a live client's store cancels its in-flight queries.
  return <ScopedApolloProvider key={scope}>{children}</ScopedApolloProvider>;
}
