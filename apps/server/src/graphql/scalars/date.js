// src/graphql/scalars/date.js
import { GraphQLScalarType, Kind } from 'graphql';

export const typeDef = /* GraphQL */ `
  scalar Date
`;

// Pomocná funkce – bere Date nebo cokoliv, co jde předat do new Date()
const toDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) {
    throw new TypeError(`Date cannot represent an invalid Date: ${value}`);
  }
  return date;
};

// Serialize: JS Date -> "YYYY-MM-DD"
const serializeDate = (value) => {
  const date = toDate(value);

  // Pozor: toISOString() je v UTC – vezmeme jen část YYYY-MM-DD
  return date.toISOString().slice(0, 10);
};

// Parse: "YYYY-MM-DD" -> JS Date
const parseDate = (value) => {
  // Pokud ti stačí, že to proleze přes new Date:
  const date = new Date(value);

  if (isNaN(date.getTime())) {
    throw new TypeError(`Date cannot represent an invalid Date: ${value}`);
  }
  return date;
};

export const resolvers = {
  Date: new GraphQLScalarType({
    name: 'Date',
    description:
      'Date scalar type representing a date in format YYYY-MM-DD (no time part).',
    serialize: serializeDate,
    parseValue: parseDate,
    parseLiteral(ast) {
      if (ast.kind === Kind.STRING) {
        return parseDate(ast.value);
      }
      throw new TypeError(
        `Date cannot represent non string literal: ${ast.kind}`,
      );
    },
  }),
};
