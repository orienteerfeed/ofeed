export const typeDef = /* GraphQL */ `
  type EventPassword {
    id: String!
    eventId: String!
    password: String!
    expiresAt: String!
    createdAt: String!
    updatedAt: String!
    event: Event!
  }
`;
