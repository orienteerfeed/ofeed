import { GraphQLScalarType, Kind } from 'graphql';

import { builder } from '../builder.js';

const toDate = (value: unknown) => {
  const date = value instanceof Date ? value : new Date(value as string | number);
  if (isNaN(date.getTime())) {
    throw new TypeError(`Date cannot represent an invalid Date: ${value}`);
  }
  return date;
};

const serializeDate = (value: unknown) => {
  const date = toDate(value);

  return date.toISOString().slice(0, 10);
};

const parseDate = (value: unknown) => {
  const date = new Date(value as string | number);

  if (isNaN(date.getTime())) {
    throw new TypeError(`Date cannot represent an invalid Date: ${value}`);
  }
  return date;
};

export const dateScalar = new GraphQLScalarType({
  name: 'Date',
  description: 'Date scalar type representing a date in format YYYY-MM-DD (no time part).',
  serialize: serializeDate,
  parseValue: parseDate,
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return parseDate(ast.value);
    }
    throw new TypeError(`Date cannot represent non string literal: ${ast.kind}`);
  },
});

builder.addScalarType('Date', dateScalar);
