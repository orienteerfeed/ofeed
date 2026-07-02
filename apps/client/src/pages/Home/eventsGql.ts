import type { Country } from '@/types/country';
import type {
  EventDiscipline,
  EventEntriesStatus,
  EventSport,
  EventStatusPrimary,
} from '@/types/event';
import { gql } from '@apollo/client';
import type { HomeEventListItem } from './types';

export interface GraphQLEvent {
  id: string;
  name: string;
  organizer?: string | null;
  date: string;
  zeroTime?: string | null;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  featuredImage?: string | null;
  country?: {
    countryCode: string;
    countryName: string;
  } | null;
  sport: EventSport;
  discipline: EventDiscipline;
  relay: boolean;
  statusSummary: {
    primary: EventStatusPrimary;
    entries: EventEntriesStatus;
    entriesConfigured: boolean;
  };
}

export interface EventsData {
  events: {
    edges: {
      node: GraphQLEvent;
      cursor: string;
    }[];
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
  };
}

export interface EventsVariables {
  filter: string | null;
  first: number;
  after?: string | null;
}

export const EVENTS_QUERY = gql`
  query Events($filter: EventFilter, $first: Int!, $after: String) {
    events(input: { filter: $filter, first: $first, after: $after }) {
      edges {
        node {
          id
          name
          organizer
          date
          zeroTime
          location
          latitude
          longitude
          featuredImage
          country {
            countryCode
            countryName
          }
          sport {
            id
            name
          }
          relay
          discipline
          statusSummary {
            primary
            entries
            entriesConfigured
          }
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const toOptionalCountry = (
  country: GraphQLEvent['country']
): Country | undefined => {
  if (!country?.countryCode || !country.countryName) {
    return undefined;
  }
  return {
    countryCode: country.countryCode,
    countryName: country.countryName,
  };
};

export const convertGraphQLEventToHomeEvent = (
  graphqlEvent: GraphQLEvent
): HomeEventListItem => {
  const slug = graphqlEvent.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

  const country = toOptionalCountry(graphqlEvent.country);

  return {
    id: graphqlEvent.id,
    slug,
    name: graphqlEvent.name,
    date: graphqlEvent.date,
    ...(graphqlEvent.zeroTime ? { zeroTime: graphqlEvent.zeroTime } : {}),
    ...(graphqlEvent.organizer ? { organizer: graphqlEvent.organizer } : {}),
    ...(graphqlEvent.location ? { location: graphqlEvent.location } : {}),
    ...(graphqlEvent.featuredImage
      ? { featuredImage: graphqlEvent.featuredImage }
      : {}),
    ...(country ? { country } : {}),
    ...(typeof graphqlEvent.latitude === 'number'
      ? { latitude: graphqlEvent.latitude }
      : {}),
    ...(typeof graphqlEvent.longitude === 'number'
      ? { longitude: graphqlEvent.longitude }
      : {}),
    sport: graphqlEvent.sport,
    discipline: graphqlEvent.discipline,
    status: graphqlEvent.statusSummary.primary,
    entriesStatus: graphqlEvent.statusSummary.entries,
    entriesConfigured: graphqlEvent.statusSummary.entriesConfigured,
    relay: graphqlEvent.relay,
  };
};
