import { GraphQLError } from 'graphql';

import { isAuthzError } from '../utils/authz.js';

export const getErrorMessage = (err: unknown, fallback: string) =>
  err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
    ? err.message
    : fallback;

export const rethrowAuthzOrError = (err: unknown, fallback: string): never => {
  if (err instanceof GraphQLError) {
    throw err;
  }

  if (isAuthzError(err)) {
    throw err;
  }

  throw new Error(getErrorMessage(err, fallback));
};
