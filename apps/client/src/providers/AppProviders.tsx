import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import * as React from 'react';
import { ApolloProvider } from './ApolloProvider';
import { Toaster } from './Toaster';

// Create QueryClient instance outside the component
const queryClient = new QueryClient();

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ApolloProvider>
        {children}
        <Toaster />
        {import.meta.env.DEV ? (
          <ReactQueryDevtools initialIsOpen={false} />
        ) : null}
      </ApolloProvider>
    </QueryClientProvider>
  );
}
