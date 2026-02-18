import { config } from '@/config';
import { useAuthStore } from '@/stores/auth';

const AUTH_STORAGE_KEY = 'ofeed-auth';

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

function getPersistedToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as {
      state?: { token?: unknown };
      token?: unknown;
    };
    const tokenFromState = parsed?.state?.token;
    if (typeof tokenFromState === 'string' && tokenFromState.length > 0) {
      return tokenFromState;
    }

    if (typeof parsed?.token === 'string' && parsed.token.length > 0) {
      return parsed.token;
    }
  } catch {
    return null;
  }

  return null;
}

export function getToken(): string | null {
  const token = useAuthStore.getState().token;
  if (token && token.length > 0) {
    return token;
  }

  return getPersistedToken();
}
