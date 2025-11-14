import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import * as React from 'react';
import { ApolloProvider } from './ApolloProvider';
import { ThemeProvider } from './ThemeProvider';
import { Toaster } from './Toaster';

// Create QueryClient instance outside the component
const queryClient = new QueryClient();

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ApolloProvider>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />

          {import.meta.env.DEV ? (
            <ReactQueryDevtools initialIsOpen={false} />
          ) : null}
        </ThemeProvider>
      </ApolloProvider>
    </QueryClientProvider>
  );
}
