export const typeDef = /* GraphQL */ `
  extend type Query {
    competitorSplits(competitorId: Int!): [Split!]
  }

  type Split {
    id: Int!
    competitorId: Int!
    controlCode: Int!
    time: Int
  }
`;
