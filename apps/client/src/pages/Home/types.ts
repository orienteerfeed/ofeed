import type { Country } from '@/types/country';
import type {
  EventDiscipline,
  EventEntriesStatus,
  EventSport,
  EventStatusPrimary,
} from '@/types/event';

export interface HomeEventListItem {
  id: string;
  slug: string;
  name: string;
  /** raw ISO datetime — format at render time so it reacts to locale changes */
  date: string;
  zeroTime?: string;
  organizer?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  featuredImage?: string;
  country?: Country;
  sport: EventSport;
  discipline: EventDiscipline;
  relay: boolean;
  status: EventStatusPrimary;
  entriesStatus: EventEntriesStatus;
  entriesConfigured: boolean;
}
