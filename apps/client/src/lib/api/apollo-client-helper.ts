import { config } from '@/config';

function joinUrl(base: string, path: string) {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

// Helper pro získání GraphQL URL (stejná logika jako v ApolloProvider)
export function getGraphQLUrls() {
  const httpUrl = joinUrl(config.BASE_API_URL, '/graphql');

  function toWsUrl(httpUrl: string) {
    try {
      const u = new URL(httpUrl);
      u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
      return u.toString();
    } catch {
      return httpUrl.replace(/^https?/i, m =>
        m.toLowerCase() === 'https' ? 'wss' : 'ws'
      );
    }
  }

  const wsUrl = joinUrl(toWsUrl(config.BASE_API_URL), '/graphql');

  return { httpUrl, wsUrl };
}

// Funkce pro získání tokenu (stejná logika jako v ApolloProvider)
export function getToken(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('auth-token'); // nebo váš způsob získání tokenu
  }
  return null;
}
