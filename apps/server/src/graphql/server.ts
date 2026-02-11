import type { Server as HttpServer } from "node:http";

import { useServer } from "graphql-ws/use/ws";
import { WebSocketServer } from "ws";

import { schemaWithDirectives } from "./executableSchema.js";
import prisma from "../utils/context.js";
import { buildAuthContextFromRequest } from "../utils/jwtToken.js";

function getAuthorizationHeader(connectionParams: unknown) {
  if (!connectionParams || typeof connectionParams !== "object") {
    return undefined;
  }

  const source = connectionParams as Record<string, unknown>;
  const authorization = source.authorization ?? source.Authorization;

  if (typeof authorization !== "string") {
    return undefined;
  }

  return authorization;
}

export function attachGraphQLWebSocketServer(server: HttpServer) {
  const wsServer = new WebSocketServer({
    server,
    path: "/graphql",
  });

  wsServer.on("connection", () => {
    console.log("New WebSocket connection established");
  });

  wsServer.on("error", (err) => {
    console.error("WebSocket server error:", err);
  });

  const serverCleanup = useServer(
    {
      schema: schemaWithDirectives,
      context: async (ctx) => {
        const authorization = getAuthorizationHeader(ctx.connectionParams);
        const auth = await buildAuthContextFromRequest({
          headers: authorization ? { authorization } : {},
        });

        return {
          prisma,
          auth,
          activationUrl: "localhost",
          resetPasswordUrl: "localhost",
        };
      },
    },
    wsServer,
  );

  return async () => {
    await serverCleanup.dispose();
    await new Promise<void>((resolve) => {
      wsServer.close(() => resolve());
    });
  };
}
