import { serve } from "@hono/node-server";
import type { Server as HttpServer } from "node:http";

import { env } from "./config";
import { attachGraphQLWebSocketServer } from "./graphql/server";
import { logger } from "./lib/logging";

import app from "./app";

const server = serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    logger.info(`Server is running on http://localhost:${info.port}`);
  },
);

const disposeGraphQLWebSocket = attachGraphQLWebSocketServer(server as unknown as HttpServer);

let shuttingDown = false;

async function shutdown() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info("Graceful shutdown started...");

  try {
    await disposeGraphQLWebSocket();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  } catch (error) {
    logger.error("Graceful shutdown failed", {
      error: {
        message: error instanceof Error ? error.message : "Unknown shutdown error",
      },
    });
  }
}

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});
