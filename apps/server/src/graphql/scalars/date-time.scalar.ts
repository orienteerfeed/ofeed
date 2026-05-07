import { GraphQLScalarType, Kind } from 'graphql';

import { formatUtcDateTimeRfc3339 } from '../../utils/time.js';
import { builder } from '../builder.js';

const serializeDate = (value: unknown) => {
  const formatted = formatUtcDateTimeRfc3339(value as string | Date | number | null | undefined);
  if (formatted) {
    return formatted;
  }

  throw new TypeError(
    `DateTime cannot be serialized from a non-date type: ${JSON.stringify(value)}`,
  );
};

const parseDate = (value: unknown) => {
  const date = new Date(value as string | number);
  if (isNaN(date.getTime())) {
    throw new TypeError(`DateTime cannot represent an invalid Date: ${value}`);
  }
  return date;
};

export const dateTimeScalar = new GraphQLScalarType({
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
});

builder.addScalarType('DateTime', dateTimeScalar);
