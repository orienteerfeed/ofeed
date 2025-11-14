export const typeDef = /* GraphQL */ `
  extend type Query {
    changelogByEvent(eventId: String!): [Changelog!]
  }
  type Changelog {
    id: Int!
    eventId: String!
    competitorId: Int!
    origin: String!
    type: String!
    previousValue: String
    newValue: String
    authorId: Int!
    createdAt: String!
    competitor: Competitor!
    event: Event!
    author: User!
  }
`;
