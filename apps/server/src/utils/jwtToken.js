import jwt from 'jsonwebtoken';
import dotenvFlow from 'dotenv-flow';
import basicAuth from 'basic-auth';
import { oauth2Model } from '../modules/auth/oauth2Model.js';
import { error } from './responseApi.js';
import { getDecryptedEventPassword } from '../modules/event/eventService.js';
import prisma from './context.js';

// Load environment variables from .env file
dotenvFlow.config();
const JWT_TOKEN_SECRET_KEY = process.env.JWT_TOKEN_SECRET_KEY;

// generate JWT token with no expiration
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

export const generateJwtTokenForLink = (userId) => {
  const token = jwt.sign({ id: userId }, JWT_TOKEN_SECRET_KEY, {
    expiresIn: '48h',
  });
  return token;
};

/**
 * Middleware to verify JWT token from the Authorization header.
 * @param {Object} req - The HTTP request object.
 * @param {Object} res - The HTTP response object.
 * @param {Function} next - The next middleware function in the stack.
 */
// verify JWT token and save decoded payload into req.jwtDecoded
export const verifyJwtToken = async (req, res, next) => {
  const tokenWithBearer = req.headers['authorization'];

  // Check for Bearer token first
  if (tokenWithBearer && tokenWithBearer.startsWith('Bearer ')) {
    const token = tokenWithBearer.slice(7, tokenWithBearer.length); // Remove 'Bearer ' from token

    try {
      req.jwtDecoded = jwt.verify(token, JWT_TOKEN_SECRET_KEY); // Verify JWT token

      // Optional: Check if it's an OAuth client token
      if (
        typeof req.jwtDecoded.clientId !== 'undefined' &&
        req.jwtDecoded.clientId
      ) {
        const tokenDetails = await oauth2Model.getAccessToken(token);
        if (!tokenDetails) {
          return res
            .status(401)
            .json(error('Invalid or expired access token', res.statusCode));
        }
      }
      next(); // Continue to the next middleware
    } catch (err) {
      console.error(err);
      return res
        .status(401)
        .json(error('Unauthorized: Invalid JWT.', res.statusCode));
    }
  } else {
    // Check for Basic Authentication
    const credentials = basicAuth(req); // Parse the Basic Auth credentials (eventId:eventPassword)
    if (credentials) {
      const { name: eventId, pass: eventPassword } = credentials;

      try {
        // Fetch the stored password for the given eventId
        const storedPassword = await getDecryptedEventPassword(eventId);

        const eventUser = await prisma.event.findUnique({
          where: { id: eventId },
          select: {
            id: true,
            authorId: true,
          },
        });
        if (storedPassword && eventPassword === storedPassword.password) {
          req.eventId = eventId; // Attach eventId to request for further use
          // Initialize req.jwtDecoded if not using JWT and assign userId
          req.jwtDecoded = { userId: eventUser.authorId };
          next(); // Continue to the next middleware
        } else {
          return res
            .status(401)
            .json(
              error(
                'Unauthorized: Invalid eventId or eventPassword.',
                res.statusCode,
              ),
            );
        }
      } catch (err) {
        console.error(err);
        return res
          .status(401)
          .json(
            error(
              'Unauthorized: Could not validate event credentials.',
              res.statusCode,
            ),
          );
      }
    } else {
      return res
        .status(401)
        .json(error('Missing `authorization` header.', res.statusCode));
    }
  }
};

export const verifyToken = (token) => {
  if (!token) {
    throw new Error('No token provided');
  }
  try {
    return jwt.verify(token, process.env.JWT_TOKEN_SECRET_KEY); // Ensure your JWT secret is safely stored in environment variables
  } catch (error) {
    throw new Error('Invalid or expired token: ', error);
  }
};

export const verifyBasicAuth = async (username, password, eventId) => {
  // Example check against environment variables
  if (!username || !password) {
    throw new Error('Unauthorized: No credentials provided');
  }

  // Fetch the stored password for the given eventId
  const storedPassword = await getDecryptedEventPassword(eventId);

  const eventUser = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      authorId: true,
    },
  });
  if (storedPassword && password === storedPassword.password) {
    return { userId: eventUser.authorId }; // Mock user object; can be expanded with real data
  } else {
    throw new Error('Unauthorized: Invalid username or password');
  }
};

/**
 * Verifies the token from the link and extracts the user ID.
 * @param {string} token - The token to verify.
 * @returns {string} The extracted user ID.
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
