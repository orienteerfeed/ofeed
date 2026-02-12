import crypto from "node:crypto";

import OAuth2Server from "@node-oauth/oauth2-server";
import argon2 from "argon2";

import type { Prisma } from "../../generated/prisma/client";

import prisma from "../../utils/context.js";
import { generateRandomHex } from "../../utils/randomUtils.js";

type OAuthClient = OAuth2Server.Client & {
  id: string;
  clientId: string;
  clientSecret: string;
  userId: number;
  grants: string[];
  redirectUris: string[];
  scopes: string[];
};

type OAuthUser = OAuth2Server.User & {
  id: number;
  firstname?: string;
  lastname?: string;
  email?: string;
};

type ClientWithRelations = Awaited<ReturnType<typeof findClientWithRelations>>;

async function findClientWithRelations(clientId: string) {
  return prisma.oAuthClient.findUnique({
    where: { clientId },
    include: {
      grants: true,
      redirectUris: true,
      scopes: true,
      user: {
        select: {
          id: true,
          firstname: true,
          lastname: true,
          email: true,
        },
      },
    },
  });
}

function mapUser(
  user:
    | {
        id: number;
        firstname: string;
        lastname: string;
        email: string;
      }
    | null
    | undefined,
): OAuthUser | null {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    firstname: user.firstname,
    lastname: user.lastname,
    email: user.email,
  };
}

function mapClient(client: NonNullable<ClientWithRelations>): OAuthClient {
  return {
    id: client.id,
    clientId: client.clientId,
    clientSecret: client.clientSecret,
    userId: client.userId,
    grants: client.grants.map(grant => grant.grantType),
    redirectUris: client.redirectUris.map(redirectUri => redirectUri.uri),
    scopes: client.scopes.map(scope => scope.scope),
  };
}

async function resolveUserFromClient(client: OAuth2Server.Client): Promise<OAuthUser | null> {
  if (typeof client.userId === "number") {
    const user = await prisma.user.findUnique({
      where: { id: client.userId },
      select: {
        id: true,
        firstname: true,
        lastname: true,
        email: true,
      },
    });

    return mapUser(user);
  }

  if (typeof client.id !== "string") {
    return null;
  }

  const dbClient = await prisma.oAuthClient.findUnique({
    where: { id: client.id },
    select: {
      user: {
        select: {
          id: true,
          firstname: true,
          lastname: true,
          email: true,
        },
      },
    },
  });

  return mapUser(dbClient?.user);
}

type OAuthModel = OAuth2Server.ClientCredentialsModel &
  OAuth2Server.PasswordModel &
  OAuth2Server.RefreshTokenModel & {
    saveClient: (
      userId: number,
      grants?: string[],
      redirectUris?: string[],
      scopes?: string[],
    ) => Promise<{ id: string; clientId: string; clientSecret: string }>;
    validateRequestedScopes: (requestedScopes: string[], clientScopes: string[]) => boolean;
  };

export const oauth2Model = {
  async getClient(clientId, clientSecret) {
    const client = await findClientWithRelations(clientId);

    if (!client) {
      return null;
    }

    if (clientSecret) {
      const valid = await argon2.verify(client.clientSecret, clientSecret);
      if (!valid) {
        return null;
      }
    }

    return mapClient(client);
  },

  async getUser() {
    return null;
  },

  async saveToken(token, client, user) {
    const tokenUser = (user as OAuthUser | undefined) ?? (await resolveUserFromClient(client));
    if (!tokenUser) {
      return null;
    }

    await prisma.oAuthAccessToken.create({
      data: {
        token: token.accessToken,
        expiresAt: token.accessTokenExpiresAt ?? new Date(Date.now() + 3600 * 1000),
        clientId: client.id,
        userId: tokenUser.id,
      },
    });

    if (token.refreshToken && token.refreshTokenExpiresAt) {
      await prisma.oAuthRefreshToken.create({
        data: {
          token: token.refreshToken,
          expiresAt: token.refreshTokenExpiresAt,
          clientId: client.id,
          userId: tokenUser.id,
        },
      });
    }

    return {
      ...token,
      client,
      user: tokenUser,
    };
  },

  async saveClient(userId, grants = [], redirectUris = [], scopes = []) {
    const clientId = generateRandomHex(32);
    const clientSecret = generateRandomHex(32);
    const salt = crypto.randomBytes(16);
    const hashedSecret = await argon2.hash(clientSecret, { salt });

    const clientData: Prisma.OAuthClientCreateInput = {
      clientId,
      clientSecret: hashedSecret,
      user: {
        connect: { id: userId },
      },
      grants: {
        create: grants.map(grantType => ({ grantType })),
      },
    };

    if (redirectUris.length > 0) {
      clientData.redirectUris = {
        create: redirectUris.map(uri => ({ uri })),
      };
    }

    if (scopes.length > 0) {
      clientData.scopes = {
        create: scopes.map(scope => ({ scope })),
      };
    }

    const client = await prisma.oAuthClient.create({
      data: clientData,
    });

    return {
      id: client.id,
      clientId,
      clientSecret,
    };
  },

  async getAccessToken(accessToken) {
    const token = await prisma.oAuthAccessToken.findFirst({
      where: { token: accessToken },
      include: {
        client: {
          include: {
            grants: true,
            redirectUris: true,
            scopes: true,
            user: {
              select: {
                id: true,
                firstname: true,
                lastname: true,
                email: true,
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true,
          },
        },
      },
    });

    if (!token || token.expiresAt < new Date()) {
      return null;
    }

    const mappedClient = mapClient(token.client);
    const mappedUser = mapUser(token.user) ?? mapUser(token.client.user);

    if (!mappedUser) {
      return null;
    }

    return {
      accessToken: token.token,
      accessTokenExpiresAt: token.expiresAt,
      scope: mappedClient.scopes,
      client: mappedClient,
      user: mappedUser,
    };
  },

  async getRefreshToken(refreshToken) {
    const token = await prisma.oAuthRefreshToken.findFirst({
      where: { token: refreshToken },
      include: {
        client: {
          include: {
            grants: true,
            redirectUris: true,
            scopes: true,
            user: {
              select: {
                id: true,
                firstname: true,
                lastname: true,
                email: true,
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true,
          },
        },
      },
    });

    if (!token || token.expiresAt < new Date()) {
      return null;
    }

    const mappedClient = mapClient(token.client);
    const mappedUser = mapUser(token.user) ?? mapUser(token.client.user);

    if (!mappedUser) {
      return null;
    }

    return {
      refreshToken: token.token,
      refreshTokenExpiresAt: token.expiresAt,
      scope: mappedClient.scopes,
      client: mappedClient,
      user: mappedUser,
    };
  },

  async revokeToken(token) {
    const revoked = await prisma.oAuthRefreshToken.deleteMany({
      where: { token: token.refreshToken },
    });

    return revoked.count > 0;
  },

  async getUserFromClient(client) {
    return resolveUserFromClient(client);
  },

  validateRequestedScopes(requestedScopes, clientScopes) {
    if (requestedScopes.length === 0) {
      return true;
    }

    return requestedScopes.every(scope => clientScopes.includes(scope));
  },
} satisfies OAuthModel;
