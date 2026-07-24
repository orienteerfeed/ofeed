import {
  clubListResponseSchema,
  registrationLookupResponseSchema,
  registrationPattern,
  type ClubListItem,
  type RegistrationLookupItem,
} from '@repo/shared';
import { useQuery } from '@tanstack/react-query';

import { useApi } from '@/hooks/useApi';
import { ENDPOINTS } from '@/lib/api/endpoints';

interface EnvelopeData<T> {
  data: T;
}

export interface RegistrationLookupInput {
  registration?: string;
  card?: string;
}

/**
 * Looks up an athlete by registration code or SI card number through the
 * server-backed cache (never calls ORIS directly from the browser). Enabled
 * only once the input looks like a plausible query, to avoid firing on every
 * keystroke of an incomplete value.
 */
export function useRegistrationLookup(
  input: RegistrationLookupInput,
  enabled = true
) {
  const api = useApi();
  const registration = input.registration?.trim().toUpperCase();
  const card = input.card?.trim();

  const isQueryable =
    (!!registration && registrationPattern.test(registration)) ||
    (!!card && /^\d{1,9}$/.test(card));

  return useQuery<RegistrationLookupItem[]>({
    queryKey: ['registration', 'lookup', registration ?? null, card ?? null],
    queryFn: async () => {
      const response = await api.get<EnvelopeData<unknown>>(
        ENDPOINTS.registrationLookup(
          registration ? { registration } : { card }
        ),
        { skipAuth: true }
      );
      return registrationLookupResponseSchema.parse(response.data);
    },
    enabled: enabled && isQueryable,
    staleTime: 60_000,
  });
}

/** Searches the server-cached club directory; returns the full list when `q` is empty. */
export function useClubSearch(q: string, enabled = true) {
  const api = useApi();
  const trimmed = q.trim();

  return useQuery<ClubListItem[]>({
    queryKey: ['registration', 'clubs', trimmed],
    queryFn: async () => {
      const response = await api.get<EnvelopeData<unknown>>(
        ENDPOINTS.registrationClubs(trimmed ? { q: trimmed } : undefined),
        { skipAuth: true }
      );
      return clubListResponseSchema.parse(response.data);
    },
    enabled,
    staleTime: 5 * 60_000,
  });
}
