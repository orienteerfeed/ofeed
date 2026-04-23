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

  enum EventDiscipline {
    SPRINT
    MIDDLE
    LONG
    ULTRALONG
    NIGHT
    KNOCKOUT_SPRINT
    RELAY
    SPRINT_RELAY
    TEAMS
    OTHER
  }

  enum EventLifecycleStatus {
    DRAFT
    UPCOMING
    LIVE
    DONE
  }

  enum EventPrimaryStatus {
    DRAFT
    UPCOMING
    LIVE
    DONE
  }

  enum EventResultsStatus {
    NONE
    LIVE
    UNOFFICIAL
    OFFICIAL
  }

  enum EventEntriesStatus {
    CLOSED
    OPEN
  }

  enum EventOfficialResultsSource {
    ORIS
    EVENTOR
    LOCAL
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

  type EventStatusSummary {
    primary: EventPrimaryStatus!
    lifecycle: EventLifecycleStatus!
    results: EventResultsStatus!
    entries: EventEntriesStatus!
    entriesConfigured: Boolean!
    officialResultsUrl: String
    officialResultsSource: EventOfficialResultsSource
    resultsOfficialAt: DateTime
    resultsOfficialCheckedAt: DateTime
  }

  type Event {
    id: String!
    sportId: Int!
    name: String!
    organizer: String
    date: DateTime!
    timezone: String!
    externalSource: ExternalEventProvider
    externalEventId: String
    location: String
    latitude: Float
    longitude: Float
    relay: Boolean!
    discipline: EventDiscipline!
    ranking: Boolean!
    coefRanking: Float
    hundredthPrecision: Boolean!
    startMode: String!
    countryId: String
    published: Boolean!
    demo: Boolean!
    entriesOpenAt: DateTime
    entriesCloseAt: DateTime
    splitPublicationMode: SplitPublicationMode!
    splitPublicationAt: DateTime
    resultsOfficialAt: DateTime
    resultsOfficialManuallySetAt: DateTime
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
    statusSummary: EventStatusSummary!
  }
`;
