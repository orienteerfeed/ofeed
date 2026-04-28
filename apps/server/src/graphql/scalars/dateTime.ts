import { GraphQLScalarType, Kind } from 'graphql';

import { formatUtcDateTimeRfc3339 } from '../../utils/time.js';

export const typeDef = /* GraphQL */ `
  scalar DateTime
`;

const serializeDate = (value) => {
  const formatted = formatUtcDateTimeRfc3339(value);
  if (formatted) {
    return formatted;
  }

  throw new TypeError(
    `DateTime cannot be serialized from a non-date type: ${JSON.stringify(value)}`,
  );
};

const parseDate = (value) => {
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new TypeError(`DateTime cannot represent an invalid Date: ${value}`);
  }
  return date; // Prisma expects JS Date, so this is perfect
};

export const resolvers = {
  DateTime: new GraphQLScalarType({
    name: 'DateTime',
    description: 'Custom DateTime scalar (backed by JS Date, serialized as ISO8601 string)',
    serialize: serializeDate,
    parseValue: parseDate,
    parseLiteral(ast) {
      if (ast.kind === Kind.STRING) {
        return parseDate(ast.value);
      }
      throw new TypeError(`DateTime cannot represent non string literal: ${ast.kind}`);
    },
  }),
};
