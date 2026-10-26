import { verifyAccessToken } from '../modules/auth/access-token.js';
import type { Server as HttpServer } from 'node:http';

import { useServer } from 'graphql-ws/use/ws';
import { WebSocketServer } from 'ws';

import { createGraphQLContextFromConnectionParams, getAuthorizationHeader } from './context.js';
import { schema } from './schema.js';

export { getAuthorizationHeader };

export function attachGraphQLWebSocketServer(server: HttpServer) {
  const wsServer = new WebSocketServer({
    server,
    path: '/graphql',
  });

  wsServer.on('error', (err) => {
    console.error('WebSocket server error:', err);
  });

  const expiryTimers = new WeakMap<object, ReturnType<typeof setTimeout>>();
  const serverCleanup = useServer(
    {
      schema,
      onConnect: async (ctx) => {
        const auth = await createGraphQLContextFromConnectionParams(ctx.connectionParams);
        const authorization = getAuthorizationHeader(ctx.connectionParams);
        if (authorization && !auth.auth.isAuthenticated) return false;
        if (authorization?.toLowerCase().startsWith('bearer ') && auth.auth.isAuthenticated) {
          try {
            const claims = verifyAccessToken(authorization.slice(7));
            const timer = setTimeout(
              () => ctx.extra.socket.close(4403, 'Access token expired'),
              Math.max(0, claims.exp * 1000 - Date.now()),
            );
            timer.unref();
            expiryTimers.set(ctx.extra.socket, timer);
          } catch {
            // Separate registered OAuth credentials keep their existing lifecycle.
          }
        }
        return true;
      },
      onClose: (ctx) => {
        clearTimeout(expiryTimers.get(ctx.extra.socket));
      },
      context: async (ctx) => createGraphQLContextFromConnectionParams(ctx.connectionParams),
    },
    wsServer,
  );

  return async () => {
    await serverCleanup.dispose();
  };
}
