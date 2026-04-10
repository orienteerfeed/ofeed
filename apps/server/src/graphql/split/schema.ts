export const typeDef = /* GraphQL */ `
  enum SplitPublicationMode {
    UNRESTRICTED
    LAST_START
    SCHEDULED
    DISABLED
  }

  enum SplitPublicationReason {
    PUBLISHED
    WAITING_FOR_LAST_START
    WAITING_FOR_SCHEDULED
    DISABLED
  }

  extend type Query {
    competitorSplits(competitorId: Int!): [Split!]
    splitPublicationStatus(classId: Int!): SplitPublicationStatus!
  }

  extend type Subscription {
    splitCompetitorsByClassUpdated(classId: Int!): [Competitor!]
  }

  type Split {
    id: Int!
    competitorId: Int!
    controlCode: Int!
    time: Int
  }

  type SplitPublicationStatus {
    eventId: String!
    classId: Int!
    mode: SplitPublicationMode!
    isPublished: Boolean!
    isAccessible: Boolean!
    publishAt: DateTime
    reason: SplitPublicationReason!
  }
`;
