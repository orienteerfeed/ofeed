export const typeDef = /* GraphQL */ `
  extend type Query {
    currentUser: User!
    myEvents: [Event!]
  }
  extend type Mutation {
    signin(input: LoginInput): AuthPayload
    signup(input: UserInput): ResponseMessage
    requestPasswordReset(email: String!): ResetResponse!
    resetPassword(token: String!, newPassword: String!): AuthPayload!
  }
  type ResponseMessage {
    token: String!
    user: User!
    message: String!
  }
  type AuthPayload {
    token: String
    user: User
  }

  type ResetResponse {
    success: Boolean!
    message: String
  }

  type User {
    id: Int!
    email: String! @constraint(format: "email", maxLength: 255)
    firstname: String! @constraint(maxLength: 255)
    lastname: String! @constraint(maxLength: 255)
    organisation: String @constraint(maxLength: 191)
    password: String! @constraint(maxLength: 255)
    active: Boolean
    createdAt: String!
    updatedAt: String!
  }
  input LoginInput {
    username: String! @constraint(maxLength: 255)
    password: String! @constraint(maxLength: 255)
  }
  input UserInput {
    email: String! @constraint(format: "email", maxLength: 255)
    password: String! @constraint(maxLength: 255)
    firstname: String! @constraint(maxLength: 255)
    lastname: String! @constraint(maxLength: 255)
    organisation: String @constraint(maxLength: 191)
  }
`;
