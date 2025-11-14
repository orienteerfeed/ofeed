// oauth2Model.js
import argon2 from 'argon2';
import crypto from 'crypto';
import prisma from '../../utils/context.js';
import { getJwtToken } from '../../utils/jwtToken.js';
import { generateRandomHex } from '../../utils/randomUtils.js';

export const oauth2Model = {
  getClient: async function (clientId, clientSecret) {
    try {
      const client = await prisma.oAuthClient.findUnique({
        where: {
          clientId: clientId,
        },
        select: {
          id: true,
          clientId: true,
          clientSecret: true,
          userId: true,
          grants: true,
          redirectUris: true,
          scopes: true,
        },
      });

      if (!client) {
        console.log('Client not found or invalid credentials');
        return null;
      }
      // Mapping the result to include custom aliases
      const clientWithAliases = {
        clientId: client.clientId,
        clientSecret: client.clientSecret,
        userId: client.userId,
        grants: client.grants.map((grant) => grant.grantType), // Assuming Grants have a 'GrantType' field
        redirectUris: client.redirectUris.map((redirectUri) => redirectUri.uri), // Assuming RedirectUri have a 'Uri' field
        scopes: client.scopes.map((scope) => scope.scope), // Assuming Scope have a 'Scope' field
      };

      // Destructure secret hash from the found user object.
      const { clientSecret: secretHash } = client;

      // Verify the provided password against the stored hash using Argon2.
      const valid = await argon2.verify(secretHash, clientSecret);

      if (!valid) {
        console.log('Client not found or invalid credentials');
        return null;
      }

      return { ...clientWithAliases, id: client.id };
    } catch (error) {
      console.error('Error fetching client:', error);
      throw error;
    }
  },
  getUser: async () => {
    // TODO: currently not supported method
    // function params async (username, password)
    /*     const users = [{ id: '1', username: 'user', password: 'pass' }];
    const user = users.find(
      (user) => user.username === username && user.password === password,
    );
    return user ? { id: user.id } : null; */
    return null;
  },
  saveToken: async ({ accessToken: token }, client, user) => {
    try {
      await prisma.oAuthAccessToken.create({
        data: {
          token: token.accessToken,
          expiresAt: token.accessTokenExpiresAt,
          clientId: client.id,
          userId: user ? user.id : null,
        },
      });

      return {
        accessToken: token.accessToken,
        accessTokenExpiresAt: token.accessTokenExpiresAt,
        refreshToken: token.refreshToken,
        refreshTokenExpiresAt: token.refreshTokenExpiresAt,
        client: { id: client.id, clientId: client.clientId },
        user: { id: user.id },
      };
    } catch (error) {
      console.error('Error saving token:', error);
      throw error;
    }
  },
  saveClient: async function (grants = [], redirectUris = [], scopes = []) {
    try {
      const clientId = generateRandomHex(32);
      const clientSecret = generateRandomHex(32);

      // Generate a random 128-bit (16 bytes) salt
      const salt = crypto.randomBytes(16);
      const hashedSecret = await argon2.hash(clientSecret, { salt });

      const clientData = {
        clientId: clientId,
        clientSecret: hashedSecret,
        grants: {
          create: grants.map((grant) => ({ grantType: grant })),
        },
      };

      if (typeof redirectUris !== 'undefined' && redirectUris.length > 0) {
        clientData.redirectUris = {
          create: redirectUris.map((uri) => ({ uri: uri })),
        };
      }

      if (typeof scopes !== 'undefined' && scopes.length > 0) {
        clientData.scopes = {
          create: scopes.map((scope) => ({ scope: scope })),
        };
      }

      const client = await prisma.oAuthClient.create({
        data: clientData,
      });

      return { ...client, clientId: clientId, clientSecret: clientSecret };
    } catch (error) {
      console.error('Error saving client:', error);
      throw error;
    }
  },
  getAccessToken: async (accessToken) => {
    try {
      const token = await prisma.oAuthAccessToken.findUnique({
        where: {
          token: accessToken,
        },
        include: {
          client: true,
        },
      });

      if (!token) {
        console.log('Access token not found');
        return null;
      }

      if (token.expiresAt < new Date()) {
        console.log('Access token has expired');
        return null;
      }
      return {
        accessToken: token.token,
        clientId: token.client.clientId,
        userId: token.userId,
        expires: token.expiresAt,
        scope: token.scope,
      };
    } catch (error) {
      console.error('Error fetching access token:', error);
      throw error;
    }
  },
  getRefreshToken: async (refreshToken) => {
    // Implement refresh token lookup logic here
    const mockRefreshTokens = [];
    try {
      // Lookup the refresh token in the database or cache
      const token = await mockRefreshTokens.find(
        (token) => token.refreshToken === refreshToken,
      );

      if (token) {
        // Check if the token is expired
        if (token.expiresAt < new Date()) {
          // Token has expired, return null
          return null;
        }

        // Token is valid, return the token object
        return {
          refreshToken: token.refreshToken,
          clientId: token.clientId,
          userId: token.userId,
          expires: token.expiresAt,
          scope: token.scope,
          // Add more properties as needed
        };
      } else {
        // Token not found, return null
        return null;
      }
    } catch (error) {
      // Handle database or other errors
      console.error('Error fetching refresh token:', error);
      return null;
    }
  },
  revokeToken: async (revokeToken) => {
    try {
      const token = await prisma.oAuthRefreshToken.findUnique({
        where: {
          token: revokeToken,
        },
      });

      if (!token) {
        console.log('Refresh token not found');
        return false;
      }

      await prisma.oAuthRefreshToken.delete({
        where: {
          token: revokeToken,
        },
      });

      console.log('Refresh token revoked successfully');
      return true;
    } catch (error) {
      console.error('Error revoking token:', error);
      return false;
    }
  },
  getUserFromClient: async (client) => {
    // Assuming each client has an associated user in the clients array
    try {
      console.log('Fetching user for client:', client.clientId);
      const user = await prisma.user.findUnique({
        where: { id: client.userId },
        select: {
          id: true,
          firstname: true,
          lastname: true,
          email: true,
        },
      });

      if (!user) {
        console.log('No user associated with client');
        return null;
      }

      console.log('User found:', user);
      return user;
    } catch (error) {
      console.error('Error fetching user from client:', error);
      return null;
    }
  },
  validateRequestedScopes: function (requestedScopes, clientScopes) {
    return requestedScopes.every((scope) => clientScopes.includes(scope));
  },
  generateAccessToken: function (client, user, scope) {
    const payload = {
      userId: user.id,
      email: user && user.email,
      clientId: client.clientId,
      scope: scope,
    };
    const token = getJwtToken(payload, '1h');
    const accessToken = {
      accessToken: token,
      accessTokenExpiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour
      scope: scope,
    };
    return accessToken;
  },
};
