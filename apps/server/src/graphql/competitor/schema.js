export const typeDef = /* GraphQL */ `
  extend type Query {
    competitorById(id: Int!): Competitor!
    competitorsByClass(id: Int!): [Competitor!]
    competitorsByTeam(id: Int!): [Competitor!]
    competitorsByOrganisation(eventId: String!, organisation: String!): [Competitor!]
    organisations(eventId: String!): [Organisation!]!
    searchOrganisations(eventId: String!, q: String!): [Organisation!]!
  }
  extend type Mutation {
    competitorStatusChange(input: StatusChange!): ResponseMessage!
    competitorUpdate(input: UpdateCompetitorInput!): ResponseMessage!
    competitorCreate(input: StoreCompetitorInput!): StoreCompetitorResponse!
  }
  extend type Subscription {
    competitorsByClassUpdated(classId: Int!): [Competitor!]
    competitorUpdated(eventId: String!): Competitor!
  }
  type ResponseMessage {
    message: String!
  }
  type StoreCompetitorResponse {
    message: String!
    competitor: Competitor!
  }
  type Competitor {
    id: Int!
    class: Class!
    classId: Int!
    team: Team
    teamId: Int
    leg: Int
    firstname: String!
    lastname: String!
    bibNumber: Int
    nationality: String
    registration: String!
    license: String
    ranking: Int
    rankPointsAvg: Int
    organisation: String
    shortName: String
    card: Int
    startTime: DateTime
    finishTime: DateTime
    time: Int
    status: String
    lateStart: Boolean!
    note: String
    externalId: String
    updatedAt: DateTime!
    splits: [Split!]
  }
  type Organisation {
    name: String!
    competitors: Int!
  }
  input StatusChange {
    eventId: ID!
    competitorId: Int!
    origin: String! @constraint(pattern: "^START$", maxLength: 32)
    status: String! @constraint(pattern: "^(Active|Inactive|DidNotStart|LateStart)$", maxLength: 32)
  }
  input UpdateCompetitorInput {
    eventId: ID!
    competitorId: Int!
    origin: String! @constraint(pattern: "^(START|FINISH|IT|OFFICE)$", maxLength: 32)
    classId: Int
    firstname: String
    lastname: String
    bibNumber: Int
    nationality: String
    registration: String
    license: String
    ranking: Int
    rankPointsAvg: Int
    organisation: String
    shortName: String
    card: Int
    startTime: DateTime
    finishTime: DateTime
    time: Int
    teamId: Int
    leg: Int
    status: String
    lateStart: Boolean
    note: String
    externalId: String
  }

  input StoreCompetitorInput {
    eventId: String!
    classId: Int!
    origin: String!
    firstname: String!
    lastname: String!
    bibNumber: Int
    nationality: String
    registration: String
    license: String
    ranking: Int
    rankPointsAvg: Int
    organisation: String
    shortName: String
    card: Int
    startTime: DateTime
    finishTime: DateTime
    time: Int
    teamId: Int
    leg: Int
    status: String
    lateStart: Boolean
    note: String
    externalId: String
  }
`;
