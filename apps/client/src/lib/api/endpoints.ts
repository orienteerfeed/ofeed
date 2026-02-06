import { config } from '@/config';

const apiPrefix = '/rest/v1' as const;

// Type for query parameters
type QueryParams = Record<string, string | number | boolean | undefined | null>;

// Helper to build query strings safely
export function qs(params?: QueryParams): string {
  if (!params) return '';

  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    searchParams.append(key, String(value));
  }

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}

// Pagination and search parameters
interface PaginationParams extends QueryParams {
  page?: number;
  limit?: number;
  q?: string;
}

// Strongly-typed route builders
export const ENDPOINTS = {
  // Auth endpoints
  signIn: (): string => `${apiPrefix}/auth/signin`,
  signUp: (): string => `${apiPrefix}/auth/signup`,
  fetchOAuth2Credentials: (): string => `${apiPrefix}/auth/oauth2-credentials`,
  generateOAuth2Credentials: (): string =>
    `${apiPrefix}/auth/generate-oauth2-credentials`,
  revokeOAuth2Credentials: (): string =>
    `${apiPrefix}/auth/revoke-oauth2-credentials`,

  // My events endpoints
  myEvents: (params?: PaginationParams): string =>
    `${apiPrefix}/my-events${qs(params)}`,

  // Event endpoints
  events: (params?: PaginationParams): string =>
    `${apiPrefix}/events${qs(params)}`,
  eventDetail: (eventId: string | number): string =>
    `${apiPrefix}/events/${eventId}`,
  generateEventPassword: (): string => `${apiPrefix}/events/generate-password`,
  revokeEventPassword: (): string => `${apiPrefix}/events/revoke-password`,
  deleteEventCompetitors: (eventId: string | number): string =>
    `${apiPrefix}/events/${eventId}/competitors`,
  deleteEventData: (eventId: string | number): string =>
    `${apiPrefix}/events/${eventId}/delete-data`,
  deleteEvent: (eventId: string | number): string =>
    `${apiPrefix}/events/${eventId}`,
  uploadEventImage: (eventId: string | number): string =>
    `${apiPrefix}/events/${eventId}/image`,
  eventChangelog: (
    eventId: string | number,
    params?: QueryParams
  ): string => `${apiPrefix}/events/${eventId}/changelog${qs(params)}`,
  uploadIofXml: (): string => `${apiPrefix}/upload/iof`,
} as const;

export type EndpointKey = keyof typeof ENDPOINTS;

// Type for endpoint function parameters
export type EndpointParams<K extends EndpointKey> = Parameters<
  (typeof ENDPOINTS)[K]
>;

/** Build absolute URL using configured API base */
export function apiUrl<K extends EndpointKey>(
  key: K,
  ...args: EndpointParams<K>
): string {
  const endpointFn = ENDPOINTS[key] as (...args: unknown[]) => string;
  const relativePath = endpointFn(...args);

  // Remove trailing slashes from base URL and combine with path
  const baseUrl = config.BASE_API_URL?.replace(/\/+$/, '') || '';
  return `${baseUrl}${relativePath}`;
}

// Export endpoints as default
export default ENDPOINTS;
