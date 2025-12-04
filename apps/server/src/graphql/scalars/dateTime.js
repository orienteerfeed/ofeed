import { GraphQLScalarType, Kind } from 'graphql';

export const typeDef = /* GraphQL */ `
  scalar DateTime
`;

// You can use any format here. This uses ISO 8601.
// If you want "yyyy-MM-dd HH:mm:ss" etc., see note below.
const serializeDate = (value) => {
  if (value instanceof Date) {
    return value.toISOString(); // <-- format output here
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      throw new TypeError(`DateTime cannot represent an invalid Date: ${value}`);
    }
    return date.toISOString();
  }

  throw new TypeError(
    `DateTime cannot be serialized from a non-date type: ${JSON.stringify(value)}`
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
    description:
      'Custom DateTime scalar (backed by JS Date, serialized as ISO8601 string)',
    serialize: serializeDate,
    parseValue: parseDate,
    parseLiteral(ast) {
      if (ast.kind === Kind.STRING) {
        return parseDate(ast.value);
      }
      throw new TypeError(
        `DateTime cannot represent non string literal: ${ast.kind}`
      );
    },
  }),
};
