import merge from 'lodash.merge';
import { makeExecutableSchema } from '@graphql-tools/schema';
import {
  constraintDirective,
  constraintDirectiveTypeDefs,
} from 'graphql-constraint-directive';

// Import type definitions and resolvers for Events.
import {
  typeDef as Event,
  resolvers as eventResolvers,
} from './event/index.js';
// Import type definitions and resolvers for Classes.
import {
  typeDef as Class,
  resolvers as classResolvers,
} from './class/index.js';
// Import type definitions and resolvers for Sports.
import {
  typeDef as Sport,
  resolvers as sportResolvers,
} from './sport/index.js';
// Import type definitions and resolvers for Competitors.
import {
  typeDef as Competitor,
  resolvers as competitorResolvers,
} from './competitor/index.js';
// Import type definitions and resolvers for Teams.
import { typeDef as Team, resolvers as teamResolvers } from './team/index.js';
// Import type definitions and resolvers for Users.
import { typeDef as User, resolvers as userResolvers } from './user/index.js';
// Import type definitions and resolvers for Changelog.
import {
  typeDef as Changelog,
  resolvers as changelogResolvers,
} from './changelog/index.js';
// Import type definitions and resolvers for Country.
import {
  typeDef as Country,
  resolvers as countryResolvers,
} from './country/index.js';

// Import type definitions and resolvers for EventPassword.
import {
  typeDef as EventPassword,
  resolvers as eventPasswordResolvers,
} from './eventPassword/index.js';

// Import type definitions and resolvers for Split.
import {
  typeDef as Split,
  resolvers as splitResolvers,
} from './split/index.js';

// based on - https://www.apollographql.com/blog/backend/schema-design/modularizing-your-graphql-schema-code/
// Basic query and mutation typeDefs
const Query = /* GraphQL */ `
  type Query {
    _empty: String
  }
`;

const Mutation = /* GraphQL */ `
  type Mutation {
    _empty(nothing: String): String
  }
`;

const Subscription = /* GraphQL */ `
  type Subscription {
    _empty(nothing: String): String
  }
`;

const resolvers = {};

// Create the schema using makeExecutableSchema
const schema = makeExecutableSchema({
  typeDefs: [
    constraintDirectiveTypeDefs,
    Query,
    Mutation,
    Subscription,
    Event,
    Class,
    Sport,
    Competitor,
    Team,
    User,
    Changelog,
    Country,
    EventPassword,
    Split,
  ],
  resolvers: merge(
    {}, // Start with an empty object to avoid mutating the original resolvers
    resolvers,
    eventResolvers,
    classResolvers,
    sportResolvers,
    competitorResolvers,
    teamResolvers,
    userResolvers,
    changelogResolvers,
    countryResolvers,
    eventPasswordResolvers,
    splitResolvers,
  ),
});

// Apply the constraintDirective
export const schemaWithDirectives = constraintDirective()(schema);
