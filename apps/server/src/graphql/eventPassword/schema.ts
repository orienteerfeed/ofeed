export const typeDef = /* GraphQL */ `
  type EventPassword {
    id: String!
    eventId: String!
    password: String!
    expiresAt: DateTime!
    createdAt: DateTime!
    updatedAt: DateTime!
    event: Event!
  }
`;
