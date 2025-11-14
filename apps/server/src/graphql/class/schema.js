export const typeDef = /* GraphQL */ `
  extend type Query {
    classById(id: Int!): Class!
    eventClasses(eventId: String!): [Class!]
    eventClassesByIds(eventId: String!, ids: [Int!]): [Class!]
  }
  type Class {
    id: Int!
    eventId: String!
    externalId: String
    name: String!
    startName: String
    length: Int
    climb: Int
    controlsCount: Int
    competitorsCount: Int
    printedMaps: Int
    minAge: Int
    maxAge: Int
    sex: String
    status: String
    competitors: [Competitor!]
    teams: [Team!]
  }
`;
