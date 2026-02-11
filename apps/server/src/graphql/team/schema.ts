export const typeDef = /* GraphQL */ `
  extend type Query {
    teamById(id: Int!): Team!
    teamsByClass(id: Int!): [Team!]
  }
  type Team {
    id: Int!
    class: Class!
    classId: Int!
    name: String!
    organisation: String
    shortName: String
    bibNumber: Int
    competitors: [Competitor!]
  }
`;
