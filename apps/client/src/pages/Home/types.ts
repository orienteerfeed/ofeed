import type { Country } from '@/types/country';
import type { EventDiscipline, EventSport } from '@/types/event';

export type HomeEventStatus = 'upcoming' | 'ongoing' | 'past';

export interface HomeEventListItem {
  id: string;
  slug: string;
  name: string;
  date: string;
  organizer?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  featuredImage?: string;
  country?: Country;
  sport: EventSport;
  discipline: EventDiscipline;
  relay: boolean;
  status: HomeEventStatus;
}
