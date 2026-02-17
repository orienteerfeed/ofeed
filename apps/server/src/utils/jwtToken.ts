import type { Context, Next } from "hono";
import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import { oauth2Model } from '../modules/auth/oauth2.model.js';
import { logger } from '../lib/logging.js';
import { toLowerCaseHeaderRecord } from '../lib/http/headers.js';
import { decodeBase64, decrypt } from './cryptoUtils.js';
import prisma from './context.js';
import { error } from './responseApi.js';

const JWT_TOKEN_SECRET_KEY = env.JWT_TOKEN_SECRET_KEY;

type AuthFailureReason =
  | 'missing_authorization_header'
  | 'unsupported_authorization_scheme'
  | 'invalid_bearer_token'
  | 'oauth_access_token_not_found'
  | 'basic_malformed_credentials'
  | 'basic_missing_event_id'
  | 'basic_missing_password'
  | 'basic_event_not_found'
  | 'basic_password_not_found'
  | 'basic_password_expired'
  | 'basic_password_decrypt_failed'
  | 'basic_password_mismatch'
  | 'basic_unexpected_error';

type UnauthenticatedContext = {
  isAuthenticated: false;
  type: null;
  failureReason: AuthFailureReason;
};

type BasicAuthFailureReason =
  | 'basic_missing_event_id'
  | 'basic_missing_password'
  | 'basic_event_not_found'
  | 'basic_password_not_found'
  | 'basic_password_expired'
  | 'basic_password_decrypt_failed'
  | 'basic_password_mismatch'
  | 'basic_unexpected_error';

class BasicAuthVerificationError extends Error {
  reason: BasicAuthFailureReason;
  eventId?: string;

  constructor(reason: BasicAuthFailureReason, message: string, eventId?: string) {
    super(message);
    this.name = 'BasicAuthVerificationError';
    this.reason = reason;
    this.eventId = eventId;
  }
}

function unauthenticated(failureReason: AuthFailureReason): UnauthenticatedContext {
  return { isAuthenticated: false, type: null, failureReason };
}

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
  return toLowerCaseHeaderRecord(c.req.raw.headers);
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
    logger.error('JWT middleware verification failed', {
      request: {
        method: c.req.method,
        path: c.req.path,
      },
      error: {
        message: err instanceof Error ? err.message : 'Unknown error',
      },
    });
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
 * @param {string} eventId - The username from Basic auth (expected to be event ID).
 * @param {string} password - The password to verify.
 * @returns {Object} Object containing userId if authentication succeeds.
 * @throws {Error} If authentication fails or credentials are invalid.
 */
export const verifyBasicAuth = async (eventId, password) => {
  if (!eventId) {
    throw new BasicAuthVerificationError('basic_missing_event_id', 'Unauthorized: Event not provided');
  }

  if (!password) {
    throw new BasicAuthVerificationError('basic_missing_password', 'Unauthorized: No credentials provided', eventId);
  }

  const eventUser = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      authorId: true,
    },
  });

  if (!eventUser) {
    throw new BasicAuthVerificationError('basic_event_not_found', 'Unauthorized: Event not found', eventId);
  }

  const eventPassword = await prisma.eventPassword.findUnique({
    where: { eventId },
    select: {
      password: true,
      expiresAt: true,
    },
  });

  if (!eventPassword) {
    throw new BasicAuthVerificationError(
      'basic_password_not_found',
      'Unauthorized: Event password not found',
      eventId,
    );
  }

  if (new Date(eventPassword.expiresAt) <= new Date()) {
    throw new BasicAuthVerificationError('basic_password_expired', 'Unauthorized: Event password expired', eventId);
  }

  let decryptedPassword: string;
  try {
    decryptedPassword = decrypt(decodeBase64(eventPassword.password));
  } catch (err) {
    throw new BasicAuthVerificationError(
      'basic_password_decrypt_failed',
      err instanceof Error ? err.message : 'Unauthorized: Unable to decrypt event password',
      eventId,
    );
  }

  if (!decryptedPassword || decryptedPassword.trim() === '') {
    throw new BasicAuthVerificationError(
      'basic_password_decrypt_failed',
      'Unauthorized: Event password decryption returned empty value',
      eventId,
    );
  }

  if (password !== decryptedPassword) {
    throw new BasicAuthVerificationError('basic_password_mismatch', 'Unauthorized: Invalid username or password', eventId);
  }

  return { userId: eventUser.authorId };
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
  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';

  if (!authHeader) {
    return unauthenticated('missing_authorization_header');
  }

  const [schemeRaw, ...credentialsParts] = authHeader.trim().split(' ');
  const scheme = schemeRaw?.toLowerCase();
  const credentialsPart = credentialsParts.join(' ').trim();

  // Bearer <token>
  if (scheme === 'bearer') {
    const rawToken = credentialsPart;
    if (!rawToken) {
      return unauthenticated('invalid_bearer_token');
    }

    try {
      const decoded = verifyToken(rawToken) as { clientId?: string; userId?: number | string } & Record<string, unknown>;

      // Optional OAuth clientId check – same logic as before
      if (decoded.clientId) {
        const tokenDetails = await oauth2Model.getAccessToken(rawToken);
        if (!tokenDetails) {
          logger.warn('JWT verification failed', {
            authType: 'bearer',
            reason: 'oauth_access_token_not_found',
            tokenType: 'oauth-client',
          });
          return unauthenticated('oauth_access_token_not_found');
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
      logger.warn('JWT verification failed', {
        authType: 'bearer',
        error: {
          message: err instanceof Error ? err.message : 'Unknown error',
        },
      });
      return unauthenticated('invalid_bearer_token');
    }
  }

  // Basic <base64(eventId:password)>
  if (scheme === 'basic') {
    if (!credentialsPart) {
      return unauthenticated('basic_malformed_credentials');
    }

    const credentials = Buffer.from(credentialsPart, 'base64').toString('utf8');
    const separatorIndex = credentials.indexOf(':');
    if (separatorIndex < 0) {
      logger.warn('Basic auth verification failed', {
        authType: 'basic',
        reason: 'basic_malformed_credentials',
      });
      return unauthenticated('basic_malformed_credentials');
    }

    const eventId = credentials.slice(0, separatorIndex).trim();
    const password = credentials.slice(separatorIndex + 1);

    if (!eventId) {
      logger.warn('Basic auth verification failed', {
        authType: 'basic',
        reason: 'basic_missing_event_id',
      });
      return unauthenticated('basic_missing_event_id');
    }

    if (!password) {
      logger.warn('Basic auth verification failed', {
        authType: 'basic',
        eventId,
        reason: 'basic_missing_password',
      });
      return unauthenticated('basic_missing_password');
    }

    try {
      const { userId } = await verifyBasicAuth(eventId, password);
      return {
        isAuthenticated: true,
        type: 'eventBasic',
        userId,
        eventId,
      };
    } catch (err) {
      const reason =
        err instanceof BasicAuthVerificationError ? err.reason : ('basic_unexpected_error' as const);
      logger.warn('Basic auth verification failed', {
        authType: 'basic',
        eventId,
        reason,
        error: {
          message: err instanceof Error ? err.message : 'Unknown error',
        },
      });
      return unauthenticated(reason);
    }
  }

  return unauthenticated('unsupported_authorization_scheme');
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
    logger.warn('Activation token verification failed', {
      authType: 'activation-token',
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
    throw new Error('Invalid or expired token');
  }
};
