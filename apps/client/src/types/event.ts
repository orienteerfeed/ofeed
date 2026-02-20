import { Country } from './country';
import { User } from './user';
import type { EventPassword as SharedEventPassword, Sport as SharedEventSport } from '@repo/shared';
export type EventFilter =
  | 'all'
  | 'ongoing'
  | 'upcoming'
  | 'recent'
  | 'past'
  | 'featured'
  | 'popular'
  | 'nearby';

export interface EventClass {
  id: number;
  name: string;
  description?: string;
  length?: number;
  climb?: number;
  controls?: number;
}

export interface Event {
  id: string;
  slug: string;
  name: string;
  date: string;
  description?: string;
  featuredImage?: string;

  organizer: string;
  location: string;
  country: Country;
  latitude?: number;
  longitude?: number;
  // Event details
  sportId: number;
  sport: EventSport;
  discipline?: EventDiscipline;
  zeroTime?: string; // UTC time-of-day (HH:mm:ss)
  timezone?: string; // IANA timezone (e.g., 'Europe/Prague', 'America/New_York')
  externalSource?: 'ORIS' | 'EVENTOR';
  externalEventId?: string;
  relay: boolean;
  ranking: boolean;
  coefRanking?: number;
  hundredthPrecision?: boolean; // Whether to use hundredth precision for times

  // Classes and participation
  classes?: EventClass[];
  maxParticipants?: number;
  currentParticipants?: number;

  // Settings
  eventPassword?: EventPassword;

  // Metadata
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  published: boolean;
  status: 'upcoming' | 'past' | 'ongoing';
  authorId: number;
  user: User | null;
}

export interface EventsFilterParams {
  filter?: EventFilter;
  sport?: EventSport;
  discipline?: EventDiscipline;
  search?: string;
  page?: number;
  limit?: number;
  sort?: 'date' | 'name' | 'distance' | 'popularity';
}

export type EventSport = SharedEventSport;

export type EventDiscipline = 'middle' | 'long' | 'sprint' | 'relay';

export interface EventQueryData {
  event: Event;
}

export interface EventQueryVariables {
  eventId: string;
}

export type EventPassword = Pick<SharedEventPassword, 'password'> & {
  expiresAt: string;
};

export interface EventFormData {
  id?: string;
  name: string;
  sportId: number;
  date: string;
  timezone: string;
  organizer: string;
  location: string;
  latitude?: number | undefined;
  longitude?: number | undefined;
  countryCode?: string;
  zeroTime: string;
  ranking: boolean;
  coefRanking?: number | undefined;
  relay: boolean;
  hundredthPrecision: boolean;
  published: boolean;
  externalSource?: 'ORIS' | 'EVENTOR';
  externalEventId?: string;
}

// Helper types for form conversion
export interface EventFormValues {
  eventName: string;
  sportId: string;
  date: string;
  timezone: string;
  organizer: string;
  location: string;
  latitude: string;
  longitude: string;
  countryCode: string;
  zeroTime: string;
  ranking: boolean;
  coefRanking: string;
  relay: boolean;
  published: boolean;
  hundredthPrecision: boolean;
}
