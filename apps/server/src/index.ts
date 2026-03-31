import { serve } from '@hono/node-server';
import type { Server as HttpServer } from 'node:http';

import { env } from './config/index.js';
import prisma from './db/prisma.js';
import { attachGraphQLWebSocketServer } from './graphql/server.js';
import { createGracefulShutdown } from './lib/graceful-shutdown.js';
import { logger } from './lib/logging.js';

import app from './app.js';

const server = serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    logger.info(`Server is running on http://localhost:${info.port}`);
  },
);

const httpServer = server as unknown as HttpServer;
const gracefulShutdown = createGracefulShutdown({
  server: httpServer,
  disposeGraphQLWebSocket: attachGraphQLWebSocketServer(httpServer),
  prisma,
  logger,
});

gracefulShutdown.registerSignalHandlers();
