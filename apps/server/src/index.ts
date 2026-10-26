import { reloadAccessKeys } from './modules/auth/access-token.js';
import { startSessionCleanup } from './modules/auth/session-cleanup.js';
import { serve } from '@hono/node-server';
import type { Server as HttpServer } from 'node:http';

import { env } from './config/index.js';
import prisma from './db/prisma.js';
import { attachGraphQLWebSocketServer } from './graphql/server.js';
import { createGracefulShutdown } from './lib/graceful-shutdown.js';
import { logger } from './lib/logging.js';

import { startIdempotencyCleanup } from './modules/idempotency/idempotency-cleanup.js';

import app from './app.js';

reloadAccessKeys();
const accessKeyTimer = setInterval(reloadAccessKeys, 5000);
accessKeyTimer.unref();
const stopSessionCleanup = startSessionCleanup(prisma, () =>
  logger.error('Session cleanup failed'),
);
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
const stopIdempotencyCleanup = startIdempotencyCleanup(prisma, (error) => {
  logger.error('Idempotency response cleanup failed', { error });
});
const disposeGraphQLWebSocket = attachGraphQLWebSocketServer(httpServer);
const gracefulShutdown = createGracefulShutdown({
  server: httpServer,
  disposeGraphQLWebSocket: async () => {
    clearInterval(accessKeyTimer);
    await stopSessionCleanup();
    await stopIdempotencyCleanup();
    await disposeGraphQLWebSocket();
  },
  prisma,
  logger,
});

gracefulShutdown.registerSignalHandlers();
