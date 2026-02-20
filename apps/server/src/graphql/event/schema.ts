export const typeDef = /* GraphQL */ `
  enum ExternalEventProvider {
    ORIS
    EVENTOR
  }

  enum EventFilter {
    ALL
    TODAY
    UPCOMING
    RECENT
  }

  type EventConnection {
    edges: [EventEdge!]!
    pageInfo: PageInfo!
  }

  type EventEdge {
    node: Event!
    cursor: String!
  }

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }

  input EventsInput {
    filter: EventFilter
    sportId: Int
    search: String
    first: Int
    after: String
  }

  extend type Query {
    events(input: EventsInput): EventConnection!
    event(id: String!): Event
    eventsBySport(sportId: Int!): [Event!]
    eventsByUser(userId: Int!): [Event!]
    searchEvents(query: String!): [Event]!
  }

  extend type Mutation {
    updateEventVisibility(eventId: String!, published: Boolean!): EventResponse!
  }

  type Subscription {
    winnerUpdated(eventId: String!): WinnerNotification
  }

  type EventResponse {
    message: String!
    event: Event
  }

  type WinnerNotification {
    eventId: String!
    classId: Int!
    className: String!
    name: String!
  }

  type Event {
    id: String!
    sportId: Int!
    name: String!
    organizer: String
    date: Date!
    timezone: String!
    externalSource: ExternalEventProvider
    externalEventId: String
    location: String
    latitude: Float
    longitude: Float
    zeroTime: DateTime!
    relay: Boolean!
    ranking: Boolean!
    coefRanking: Float
    hundredthPrecision: Boolean!
    startMode: String!
    countryId: String
    published: Boolean!
    demo: Boolean!
    authorId: Int
    createdAt: DateTime!
    updatedAt: DateTime!
    classes: [Class!]
    sport: Sport!
    country: Country
    user: User
    eventPassword: EventPassword
    featuredImageKey: String
    featuredImage: String
  }
`;
