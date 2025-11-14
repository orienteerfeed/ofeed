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
export const checkRequiredScope = (requiredScope) => {
  return (req, res, next) => {
    const tokenWithBearer = req.headers['authorization'];

    if (!tokenWithBearer) {
      return res
        .status(401)
        .json(errorResponse('No token provided', res.statusCode));
    }

    const token = tokenWithBearer.split(' ')[1];

    try {
      const jwtDecoded = verifyToken(token);

      if (!jwtDecoded.scope || !jwtDecoded.scope.includes(requiredScope)) {
        return res
          .status(403)
          .json(errorResponse('Forbidden: Insufficient scope', res.statusCode));
      }

      next();
    } catch (error) {
      console.error(error);
      return res
        .status(401)
        .json(errorResponse('Invalid token', res.statusCode));
    }
  };
};
