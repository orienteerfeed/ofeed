import type { Context, Next } from "hono";
import dotenvFlow from 'dotenv-flow';
import jwt from 'jsonwebtoken';
import { oauth2Model } from '../modules/auth/oauth2.model.js';
import { getDecryptedEventPassword } from '../modules/event/event.service.js';
import prisma from './context.js';
import { error } from './responseApi.js';

dotenvFlow.config();
const JWT_TOKEN_SECRET_KEY = process.env.JWT_TOKEN_SECRET_KEY;

/**
 * Generates a JWT token with an optional expiration.
 * @param {Object} payload - The payload to include in the JWT token.
 * @param {string|null} [expiresIn=null] - The expiration time for the token (e.g., '1h', '2d'). If null, the token will not expire.
 * @returns {string} The generated JWT token.
 */
export const getJwtToken = (payload, expiresIn = null) => {
  const options = expiresIn ? { expiresIn } : {};
  return jwt.sign(payload, JWT_TOKEN_SECRET_KEY, options);
};

/**
 * Generates a JWT token specifically for activation/reset links with 48-hour expiration.
 * @param {string} userId - The user ID to include in the token payload.
 * @returns {string} The generated JWT token.
 */
export const generateJwtTokenForLink = (userId) => {
  const token = jwt.sign({ id: userId }, JWT_TOKEN_SECRET_KEY, {
    expiresIn: '48h',
  });
  return token;
};

function headersFromHonoContext(c: Context): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const [key, value] of c.req.raw.headers.entries()) {
    headers[key.toLowerCase()] = value;
  }

  return headers;
}

/**
 * Hono middleware to verify JWT/Basic auth from the Authorization header.
 */
export const verifyJwtToken = async (c: Context, next: Next) => {
  try {
    const auth = await buildAuthContextFromRequest({ headers: headersFromHonoContext(c) });

    if (!auth.isAuthenticated) {
      return c.json(error('Unauthorized: Invalid or missing credentials.', 401), 401);
    }

    c.set("authContext" as never, auth as never);
    await next();
  } catch (err) {
    console.error(err);
    return c.json(error('Unauthorized', 401), 401);
  }
};

/**
 * Verifies a JWT token string and returns the decoded payload.
 * @param {string} token - The JWT token to verify.
 * @returns {Object} The decoded token payload.
 * @throws {Error} If token is invalid, expired, or not provided.
 */
export const verifyToken = (token) => {
  if (!token) {
    throw new Error('No token provided');
  }
  try {
    return jwt.verify(token, JWT_TOKEN_SECRET_KEY);
  } catch (err) {
    throw new Error('Invalid or expired token: ' + err.message);
  }
};

/**
 * Verifies Basic authentication credentials for event access.
 * @param {string} username - The username (expected to be event ID).
 * @param {string} password - The password to verify.
 * @param {string} eventId - The event ID from the request.
 * @returns {Object} Object containing userId if authentication succeeds.
 * @throws {Error} If authentication fails or credentials are invalid.
 */
export const verifyBasicAuth = async (username, password, eventId) => {
  if (!username || !password) {
    throw new Error('Unauthorized: No credentials provided');
  }

  // username = eventId (in your implementation)
  const storedPassword = await getDecryptedEventPassword(eventId);

  const eventUser = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      authorId: true,
    },
  });

  if (storedPassword && password === storedPassword.password) {
    return { userId: eventUser.authorId };
  } else {
    throw new Error('Unauthorized: Invalid username or password');
  }
};

/**
 * Common function: builds authentication context from HTTP request headers for both REST and GraphQL.
 *
 * Result shape:
 * {
 *   isAuthenticated: boolean,
 *   type: 'jwt' | 'eventBasic' | null,
 *   userId?: string,
 *   eventId?: string,        // only for Basic event password
 *   rawToken?: string,
 *   tokenPayload?: object,   // entire decoded JWT payload
 * }
 *
 * @param {Object} req - Request-like object with `headers.authorization`.
 * @returns {Promise<Object>} Authentication context object.
 */
export const buildAuthContextFromRequest = async (req) => {
  const authHeader = req.headers['authorization'] || '';

  if (!authHeader) {
    return { isAuthenticated: false, type: null };
  }

  // Bearer <token>
  if (authHeader.startsWith('Bearer ')) {
    const rawToken = authHeader.slice(7).trim();

    try {
      const decoded = verifyToken(rawToken);

      // Optional OAuth clientId check – same logic as before
      if (decoded.clientId) {
        const tokenDetails = await oauth2Model.getAccessToken(rawToken);
        if (!tokenDetails) {
          return { isAuthenticated: false, type: null };
        }
      }

      return {
        isAuthenticated: true,
        type: 'jwt',
        userId: decoded.userId,
        rawToken,
        tokenPayload: decoded,
      };
    } catch (err) {
      console.error('JWT verification failed:', err.message);
      return { isAuthenticated: false, type: null };
    }
  }

  // Basic <base64(eventId:password)>
  if (authHeader.startsWith('Basic ')) {
    const base64Credentials = authHeader.slice(6).trim();
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
    const [eventId, password] = credentials.split(':');

    if (!eventId || !password) {
      return { isAuthenticated: false, type: null };
    }

    try {
      const { userId } = await verifyBasicAuth(eventId, password, eventId);
      return {
        isAuthenticated: true,
        type: 'eventBasic',
        userId,
        eventId,
      };
    } catch (err) {
      console.error('Basic auth verification failed:', err.message);
      return { isAuthenticated: false, type: null };
    }
  }

  return { isAuthenticated: false, type: null };
};

/**
 * Verifies an activation/reset token and extracts the user ID.
 * @param {string} token - The JWT token to verify.
 * @returns {string} The extracted user ID from the token payload.
 * @throws {Error} If the token is invalid or expired.
 */
export const getUserIdFromActivationToken = (token) => {
  try {
    const decoded = jwt.verify(token, JWT_TOKEN_SECRET_KEY);
    return decoded.id;
  } catch (error) {
    console.error('Failed to verify token:', error);
    throw new Error('Invalid or expired token');
  }
};
