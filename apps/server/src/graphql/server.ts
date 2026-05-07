import type { Server as HttpServer } from 'node:http';

import { useServer } from 'graphql-ws/use/ws';
import { WebSocketServer } from 'ws';

import {
  createGraphQLContextFromConnectionParams,
  getAuthorizationHeader,
} from './context.js';
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

  const serverCleanup = useServer(
    {
      schema,
      context: async (ctx) => createGraphQLContextFromConnectionParams(ctx.connectionParams),
    },
    wsServer,
  );

  return async () => {
    await serverCleanup.dispose();
  };
}
