import OAuth2Server from '@node-oauth/oauth2-server';
import argon2 from 'argon2';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import { Router } from 'express';
import { check, validationResult } from 'express-validator';

import { AuthenticationError, ValidationError } from '../../exceptions/index.js';
import { formatErrors } from '../../utils/errors.js';
import {
  error as errorResponse,
  success as successResponse,
  validation as validationResponse,
} from '../../utils/responseApi.js';
import {
  authenticateUser,
  passwordResetConfirm,
  passwordResetRequest,
  signupUser,
} from './authService.js';

import prisma from '../../utils/context.js';
import { verifyJwtToken } from '../../utils/jwtToken.js';
import { generateRandomHex } from '../../utils/randomUtils.js';

import { oauth2Model } from './oauth2Model.js';

const router = Router();
const Request = OAuth2Server.Request;
const Response = OAuth2Server.Response;

const oauth = new OAuth2Server({
  debug: true,
  model: oauth2Model, // Implement this file based on your storage (e.g., DB).
  grants: ['authorization_code', 'password', 'refresh_token', 'client_credentials'],
  accessTokenLifetime: 3600,
  allowBearerTokensInQueryString: true,
});

router.use(bodyParser.urlencoded({ extended: false }));
router.use(bodyParser.json());

/**
 * @swagger
 * /rest/v1/auth/signin:
 *  post:
 *      summary: Authenticate existing user
 *      description: User authentication
 *      parameters:
 *       - in: body
 *         name: username
 *         required: true
 *         description: User's email as username.
 *         schema:
 *           type: string
 *           example: user@example.com
 *       - in: body
 *         name: password
 *         required: true
 *         description: User's password.
 *         schema:
 *           type: string
 *           example: Password123
 *      responses:
 *        200:
 *          description: Return JWT token
 *        401:
 *          description: Not authenticated
 *        422:
 *          description: Validation Error
 *        500:
 *          description: Internal Server Error
 */
router.post(
  '/signin',
  [check('username').not().isEmpty().trim().isEmail(), check('password').not().isEmpty().trim()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json(validationResponse(formatErrors(errors), res.statusCode));
    }
    const {
      body: { username, password },
    } = req;

    try {
      const loginSuccessPayload = await authenticateUser(username, password);
      return res
        .status(200)
        .json(successResponse('OK', { data: loginSuccessPayload }, res.statusCode));
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(422).json(validationResponse(error.message, res.statusCode));
      } else if (error instanceof AuthenticationError) {
        return res.status(401).json(errorResponse(error.message, res.statusCode));
      }
      return res.status(500).json(errorResponse('Internal Server Error', res.statusCode));
    }
  }
);

/**
 * @swagger
 * /rest/v1/auth/signup:
 *  post:
 *    summary: Register new user
 *    description: User registration
 *    parameters:
 *       - in: body
 *         name: firstname
 *         required: true
 *         description: User's firstname.
 *         schema:
 *           type: string
 *           example: Jan
 *       - in: body
 *         name: lastname
 *         required: true
 *         description: User's lastname.
 *         schema:
 *           type: string
 *           example: Novák
 *       - in: body
 *         name: email
 *         required: true
 *         description: User's email as username.
 *         schema:
 *           type: string
 *           example: user@example.com
 *       - in: body
 *         name: password
 *         required: true
 *         description: User's password.
 *         schema:
 *           type: string
 *           example: Password123
 *    responses:
 *      200:
 *        description: User successfuly created
 *      422:
 *        description: This email is already registered
 *      500:
 *        description: Database errors
 */
router.post(
  '/signup',
  [
    check('email').not().isEmpty().trim().isEmail(),
    check('password').not().isEmpty().trim().isLength({ min: 6 }),
    check('firstname').not().isEmpty().trim(),
    check('lastname').not().isEmpty().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json(validationResponse(formatErrors(errors), res.statusCode));
    }

    const {
      body: { firstname, lastname, email, password },
    } = req;

    try {
      const signUpPayload = await signupUser(
        email,
        password,
        firstname,
        lastname,
        req.headers['x-orienteerfeed-app-activate-user-url'] || 'localhost'
      );
      return res
        .status(200)
        .json(
          successResponse(
            'OK',
            { data: signUpPayload, message: 'User successfuly created' },
            res.statusCode
          )
        );
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(422).json(errorResponse(error.message, res.statusCode));
      }
      return res.status(500).json(errorResponse(error.message, res.statusCode));
    }
  }
);

/**
 * @swagger
 * /rest/v1/auth/request-password-reset:
 *  post:
 *    summary: Request user's account password reset
 *    description: Password reset
 *    parameters:
 *       - in: header
 *         name: x-ofeed-app-reset-password-url
 *         required: true
 *         schema:
 *           type: string
 *         description: Frontend URL where the user will reset their password.
 *       - in: body
 *         name: email
 *         required: true
 *         description: User's e-mail.
 *         schema:
 *           type: string
 *           example: jan.novak@priklad.cz
 *    responses:
 *      200:
 *        description: Email with password reset link sent successfully
 *      422:
 *        description: Request is not valid
 *      500:
 *        description: Database errors
 */
router.post(
  '/request-password-reset',
  [check('email').not().isEmpty().trim().isEmail()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json(validationResponse(formatErrors(errors), res.statusCode));
    }

    const {
      body: { email },
    } = req;

    try {
      const passwordResetPayload = await passwordResetRequest(
        email,
        req.headers['x-ofeed-app-reset-password-url'] || 'localhost'
      );

      return res
        .status(200)
        .json(
          successResponse(
            'OK',
            { data: signUpPayload, message: passwordResetPayload.message },
            res.statusCode
          )
        );
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(422).json(errorResponse(error.message, res.statusCode));
      }
      return res.status(500).json(errorResponse(error.message, res.statusCode));
    }
  }
);

/**
 * @swagger
 * /rest/v1/auth/reset-password:
 *  post:
 *    summary: Reset user's account password
 *    description: Set new password
 *    parameters:
 *       - in: body
 *         name: token
 *         required: true
 *         description: Request token.
 *         schema:
 *           type: string
 *           example: 1gzhutrads2fhgt546fgn456ayer4tgf6f
 *       - in: body
 *         name: newPassword
 *         required: true
 *         description: User's new password.
 *         schema:
 *           type: string
 *           example: Password123
 *    responses:
 *      200:
 *        description: Password reset successful
 *      422:
 *        description: Request is not valid
 *      500:
 *        description: Database errors
 */
router.post(
  '/reset-password',
  [
    check('token').not().isEmpty().trim().isString(),
    check('newPassword').not().isEmpty().trim().isString(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json(validationResponse(formatErrors(errors), res.statusCode));
    }

    const {
      body: { token, newPassword },
    } = req;

    try {
      const passwordResetPayload = await passwordResetConfirm(token, newPassword);

      return res.status(200).json(
        successResponse(
          'OK',
          {
            data: {
              token: passwordResetPayload.jwtToken,
              user: passwordResetPayload.user,
              message: 'Password reset successful',
            },
            message: passwordResetPayload.message,
          },
          res.statusCode
        )
      );
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(422).json(errorResponse(error.message, res.statusCode));
      }
      return res.status(500).json(errorResponse(error.message, res.statusCode));
    }
  }
);

/**
 * @swagger
 * /rest/v1/auth/oauth2/token:
 *   post:
 *     summary: Generate OAuth token
 *     description: Generate an OAuth token by providing client credentials and grant type.
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         schema:
 *           type: string
 *         required: true
 *         description: Basic authentication header with client ID and client secret encoded in base64.
 *         example: "Basic Y2xpZW50X2lkOmNsaWVudF9zZWNyZXQ="
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               grant_type:
 *                 type: string
 *                 description: Grant type
 *                 example: client_credentials
 *               scope:
 *                 type: string
 *                 description: Access scope
 *                 example: read
 *             required:
 *               - grant_type
 *     responses:
 *       200:
 *         description: Successful operation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                  access_token:
 *                    type: string
 *                    description: The access token
 *                    example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEiLCJzY29wZSI6WyJzZW5kX2lzZHMiXSwiaWF0IjoxNzE4MDI2Njg5fQ.Y3msmrYGsbwAQOzlJ8HScOYsH7jEyxx9-IipwLvNuWY"
 *                  token_type:
 *                    type: string
 *                    description: The type of the issued token
 *                    example: Bearer
 *                  expires_in:
 *                    type: integer
 *                    description: The lifetime in seconds of the access token
 *                    example: 3600
 *                  scope:
 *                    type: string
 *                    description: The scope of the access token
 *                    example: archive.write
 *       400:
 *           description: Invalid request
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   error:
 *                     type: string
 *                     example: invalid_request
 *                   error_description:
 *                     type: string
 *                     example: Missing or invalid authorization header
 *       401:
 *           description: Unauthorized
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   message:
 *                     type: string
 *                     example: Invalid client credentials
 *                   code:
 *                     type: integer
 *                     example: 401
 *                   error:
 *                     type: boolean
 *                     example: true
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                   message:
 *                     type: object
 *                     properties:
 *                       statusCode:
 *                         type: integer
 *                         example: 500
 *                       status:
 *                         type: integer
 *                         example: 500
 *                       code:
 *                         type: integer
 *                         example: 500
 *                       name:
 *                         type: string
 *                         example: server_error
 *                   code:
 *                     type: integer
 *                     example: 500
 *                   error:
 *                     type: boolean
 *                     example: true
 */
router.post('/oauth2/token', async (req, res) => {
  const request = new Request(req);
  const response = new Response(res);

  // Add the required headers
  res.set({
    'Content-Type': 'application/json;charset=UTF-8',
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
  });

  try {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return res.status(400).json(
        {
          error: 'invalid_request',
          error_description: 'Missing or invalid authorization header',
        },
        res.statusCode
      );
    }

    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
    const [client_id, client_secret] = credentials.split(':');

    if (!client_id || !client_secret) {
      return res.status(400).json(
        {
          error: 'invalid_client',
          error_description: 'Invalid client credentials format',
        },
        res.statusCode
      );
    }

    const { grant_type, scope } = request.body;

    if (!grant_type || grant_type !== 'client_credentials') {
      return res.status(400).json(
        {
          error: 'invalid_grant',
          error_description: 'Unsupported grant_type',
        },
        res.statusCode
      );
    }

    const requestedScopes = scope ? scope.split(' ') : [];

    const client = await oauth2Model.getClient(client_id, client_secret);

    if (!client) {
      return res.status(401).json(
        {
          error: 'unauthorized_client',
          error_description: 'Invalid client credentials',
        },
        res.statusCode
      );
    }

    if (!oauth2Model.validateRequestedScopes(requestedScopes, client.scopes)) {
      return res.status(400).json(
        {
          error: 'invalid_scope',
          error_description: 'Invalid scope requested',
        },
        res.statusCode
      );
    }

    oauth
      .token(request, response)
      .then(token => {
        const accessTokenResponse = {
          access_token: token.accessToken,
          token_type: 'Bearer',
          expires_in: Math.floor((token.accessTokenExpiresAt.getTime() - Date.now()) / 1000),
          scope: scope,
        };
        return res.status(200).json(accessTokenResponse, res.statusCode);
      })
      .catch(err => {
        console.error(err);
        return res.status(err.code || 500).json(errorResponse(err, err.code));
      });
  } catch (err) {
    console.error('Error generating token:', err);
    return res.status(err.code || 500).json(errorResponse(err, err.code));
  }
});

// Verify user authentication
router.use(verifyJwtToken);

router.get('/oauth2-credentials', async (req, res) => {
  const { userId } = req.jwtDecoded;
  try {
    const oAuth2Credentials = await prisma.oAuthClient.findFirst({
      where: { userId: userId },
      select: { clientId: true },
    });
    return res.status(200).json(
      successResponse(
        'OK',
        {
          data: { client_id: oAuth2Credentials.clientId },
        },
        res.statusCode
      )
    );
  } catch (error) {
    console.error('Error creating client:', error);
    return res.status(500).json(errorResponse(error.message, res.statusCode));
  }
});

router.post(
  '/generate-oauth2-credentials',
  [
    check('grants').not().isEmpty().isString().isIn(['client_credentials']),
    check('scopes').isString().optional(),
    check('redirectUris').isString().optional(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json(validationResponse(formatErrors(errors)));
    }
    const { grants, redirectUris, scopes } = req.body;
    const { userId } = req.jwtDecoded;

    const grantArray = grants.split(',').map(grant => grant.trim());
    const redirectUriArray = redirectUris ? redirectUris.split(',').map(uri => uri.trim()) : [];
    const scopeArray = scopes ? scopes.split(',').map(scope => scope.trim()) : [];

    // Generate client_id and client_secret
    const clientId = generateRandomHex(32);
    const clientSecret = generateRandomHex(32);

    // Generate a random 128-bit (16 bytes) salt
    const salt = crypto.randomBytes(16);
    const hashedSecret = await argon2.hash(clientSecret, { salt });

    try {
      const clientData = {
        clientId: clientId,
        clientSecret: hashedSecret,
        userId: userId,
        grants: {
          create: grantArray.map(grant => ({ grantType: grant })),
        },
      };

      if (redirectUriArray.length > 0) {
        clientData.redirectUris = {
          create: redirectUriArray.map(uri => ({ uri: uri })),
        };
      }

      if (scopeArray.length > 0) {
        clientData.scopes = {
          create: scopeArray.map(scope => ({ scope: scope })),
        };
      }

      await prisma.oAuthClient.create({
        data: clientData,
      });

      console.log('Client created successfully:');
      console.log(`Client ID: ${clientId}`);
      console.log(`Client Secret: ${clientSecret}`);
      // Store these credentials in a database or return them to the user
      return res.status(200).json(
        successResponse(
          'OK',
          {
            data: {
              client_id: clientId,
              client_secret: clientSecret,
              redirect_uri: redirectUris,
            },
            message: 'OAuth2 Client successfuly created',
          },
          res.statusCode
        )
      );
    } catch (error) {
      console.error('Error creating client:', error);
      return res.status(500).json(errorResponse(error.message, res.statusCode));
    }
  }
);

export default router;
