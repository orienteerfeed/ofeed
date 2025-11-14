export const typeDef = /* GraphQL */ `
  extend type Query {
    countries: [Country!]!
  }
  type Country {
    countryCode: String!
    countryName: String!
    events: [Event!]
  }
`;
