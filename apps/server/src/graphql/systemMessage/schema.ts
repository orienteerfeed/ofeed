export const typeDef = /* GraphQL */ `
  enum SystemMessageSeverity {
    INFO
    WARNING
    ERROR
    SUCCESS
  }

  extend type Query {
    activeSystemMessages: [SystemMessage!]!
  }

  type SystemMessage {
    id: Int!
    title: String
    message: String!
    severity: SystemMessageSeverity!
    publishedAt: DateTime!
    expiresAt: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!
  }
`;
