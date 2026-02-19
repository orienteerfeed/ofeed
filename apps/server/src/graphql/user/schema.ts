export const typeDef = /* GraphQL */ `
  extend type Query {
    currentUser: User!
    myEvents: [Event!]
    currentUserCards: [UserCard!]!
  }
  extend type Mutation {
    signin(input: LoginInput): AuthPayload
    signup(input: UserInput): ResponseMessage
    updateCurrentUser(input: UpdateCurrentUserInput!): User!
    createUserCard(input: CreateUserCardInput!): UserCard!
    updateUserCard(input: UpdateUserCardInput!): UserCard!
    deleteUserCard(id: Int!): Boolean!
    setDefaultUserCard(id: Int!): UserCard!
    requestPasswordReset(email: String!): ResetResponse!
    resetPassword(token: String!, newPassword: String!): AuthPayload!
    changeCurrentUserPassword(input: ChangeCurrentUserPasswordInput!): ResetResponse!
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
    emergencyContact: String @constraint(maxLength: 255)
    password: String! @constraint(maxLength: 255)
    active: Boolean
    createdAt: DateTime!
    updatedAt: DateTime!
  }
  enum UserCardType {
    SPORTIDENT
  }
  type UserCard {
    id: Int!
    userId: Int!
    sportId: Int!
    sport: Sport!
    type: UserCardType!
    cardNumber: String!
    isDefault: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
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
  input UpdateCurrentUserInput {
    email: String @constraint(format: "email", maxLength: 255)
    firstname: String @constraint(minLength: 1, maxLength: 255)
    lastname: String @constraint(minLength: 1, maxLength: 255)
    organisation: String @constraint(maxLength: 191)
    emergencyContact: String @constraint(maxLength: 255)
  }
  input CreateUserCardInput {
    sportId: Int!
    type: UserCardType!
    cardNumber: String! @constraint(minLength: 1, maxLength: 64)
    isDefault: Boolean
  }
  input UpdateUserCardInput {
    id: Int!
    sportId: Int!
    type: UserCardType!
    cardNumber: String! @constraint(minLength: 1, maxLength: 64)
  }
  input ChangeCurrentUserPasswordInput {
    currentPassword: String! @constraint(minLength: 1, maxLength: 255)
    newPassword: String! @constraint(minLength: 8, maxLength: 255)
  }
`;
