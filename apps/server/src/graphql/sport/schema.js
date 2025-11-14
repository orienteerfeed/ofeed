export const typeDef = /* GraphQL */ `
  extend type Query {
    sports: [Sport!]!
    sport(id: Int!): Sport
  }
  type Sport {
    id: Int!
    name: String!
  }
`;
