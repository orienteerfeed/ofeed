import type { Context, Next } from "hono";

import { verifyToken } from './jwtToken.js';
import { error as errorResponse } from './responseApi.js';

/**
 * Middleware to check if the JWT token includes the required scope.
 *
 * @param {string} requiredScope - The scope that needs to be present in the token.
 * @returns {Function} Middleware function that checks for the required scope.
 * @throws {UnauthorizedError} If no token is provided or the token is invalid.
 * @throws {ForbiddenError} If the token does not include the required scope.
 */
export const checkRequiredScope = requiredScope => {
  return async (c: Context, next: Next) => {
    const tokenWithBearer = c.req.header('authorization');

    if (!tokenWithBearer) {
      return c.json(errorResponse('No token provided', 401), 401);
    }

    const token = tokenWithBearer.split(' ')[1];

    try {
      const jwtDecoded = verifyToken(token);

      if (!jwtDecoded.scope || !jwtDecoded.scope.includes(requiredScope)) {
        return c.json(errorResponse('Forbidden: Insufficient scope', 403), 403);
      }

      await next();
    } catch (error) {
      console.error(error);
      return c.json(errorResponse('Invalid token', 401), 401);
    }
  };
};
