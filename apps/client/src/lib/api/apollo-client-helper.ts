import { config } from '@/config';
import { useAuthStore } from '@/stores/auth';

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

export function getToken(): string | null {
  return useAuthStore.getState().token;
}
