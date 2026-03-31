export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

export interface ShutdownLogger {
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, context?: Record<string, unknown>) => void;
}

export interface DisconnectableClient {
  $disconnect: () => Promise<unknown>;
}

export interface ShutdownSocket {
  destroy: () => unknown;
  once: (event: 'close', listener: () => void) => unknown;
}

export interface ShutdownServer {
  close: (callback?: (error?: Error) => void) => unknown;
  on: (event: 'connection', listener: (socket: ShutdownSocket) => void) => unknown;
  closeAllConnections?: () => void;
}

export interface ShutdownResult {
  status: 'completed' | 'failed' | 'timed_out';
  error?: unknown;
}

export interface GracefulShutdownOptions {
  server: ShutdownServer;
  disposeGraphQLWebSocket: () => Promise<void>;
  prisma: DisconnectableClient;
  logger: ShutdownLogger;
  timeoutMs?: number;
  exitProcess?: (code: number) => unknown;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
  sockets?: Set<ShutdownSocket>;
}

function getErrorMessage(error: unknown) {
  if (error instanceof AggregateError) {
    return error.errors.map(getErrorMessage).join('; ');
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function closeHttpServer(server: ShutdownServer) {
  return new Promise<void>((resolve, reject) => {
    server.close((error?: Error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function runCleanupSteps(
  server: ShutdownServer,
  disposeGraphQLWebSocket: () => Promise<void>,
  disconnectPrisma: () => Promise<void>,
) {
  const errors: unknown[] = [];

  try {
    await disposeGraphQLWebSocket();
  } catch (error) {
    errors.push(error);
  }

  try {
    await closeHttpServer(server);
  } catch (error) {
    errors.push(error);
  }

  try {
    await disconnectPrisma();
  } catch (error) {
    errors.push(error);
  }

  if (errors.length === 1) {
    throw errors[0];
  }

  if (errors.length > 1) {
    throw new AggregateError(errors, 'Graceful shutdown failed');
  }
}

export function trackServerConnections(server: ShutdownServer) {
  const sockets = new Set<ShutdownSocket>();

  server.on('connection', (socket: ShutdownSocket) => {
    sockets.add(socket);
    socket.once('close', () => {
      sockets.delete(socket);
    });
  });

  return sockets;
}

export function createGracefulShutdown({
  server,
  disposeGraphQLWebSocket,
  prisma,
  logger,
  timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS,
  exitProcess = process.exit,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  sockets = trackServerConnections(server),
}: GracefulShutdownOptions) {
  let shutdownPromise: Promise<ShutdownResult> | null = null;
  let exitRequested = false;
  let prismaDisconnectPromise: Promise<void> | null = null;

  const disconnectPrisma = async () => {
    prismaDisconnectPromise ??= Promise.resolve(prisma.$disconnect()).then(() => undefined);
    await prismaDisconnectPromise;
  };

  const requestExit = (code: number) => {
    if (exitRequested) {
      return;
    }

    exitRequested = true;
    exitProcess(code);
  };

  const destroyOpenSockets = () => {
    server.closeAllConnections?.();

    for (const socket of sockets) {
      socket.destroy();
    }
  };

  const shutdown = (signal?: NodeJS.Signals) => {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    logger.info('Graceful shutdown started...', { signal, timeoutMs });

    shutdownPromise = (async () => {
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

      try {
        await Promise.race([
          runCleanupSteps(server, disposeGraphQLWebSocket, disconnectPrisma),
          new Promise<never>((_, reject) => {
            timeoutHandle = setTimeoutFn(() => {
              logger.warn('Graceful shutdown timed out; destroying open sockets.', {
                signal,
                timeoutMs,
              });
              destroyOpenSockets();
              void disconnectPrisma().catch((error) => {
                logger.warn('Prisma disconnect failed after shutdown timeout.', {
                  error: { message: getErrorMessage(error) },
                });
              });
              reject(new Error(`Graceful shutdown timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            if (
              typeof timeoutHandle === 'object' &&
              timeoutHandle !== null &&
              'unref' in timeoutHandle &&
              typeof timeoutHandle.unref === 'function'
            ) {
              timeoutHandle.unref();
            }
          }),
        ]);

        logger.info('Graceful shutdown completed.', { signal });
        return { status: 'completed' } satisfies ShutdownResult;
      } catch (error) {
        const timedOut =
          error instanceof Error &&
          error.message === `Graceful shutdown timed out after ${timeoutMs}ms`;

        logger.error('Graceful shutdown failed', {
          signal,
          error: { message: getErrorMessage(error) },
        });

        return {
          status: timedOut ? 'timed_out' : 'failed',
          error,
        } satisfies ShutdownResult;
      } finally {
        if (timeoutHandle) {
          clearTimeoutFn(timeoutHandle);
        }
      }
    })();

    return shutdownPromise;
  };

  const handleSignal = (signal: NodeJS.Signals) => {
    if (shutdownPromise) {
      logger.warn('Received additional shutdown signal; forcing exit.', { signal });
      destroyOpenSockets();
      requestExit(1);
      return;
    }

    void shutdown(signal).then((result) => {
      requestExit(result.status === 'completed' ? 0 : 1);
    });
  };

  const registerSignalHandlers = (target: Pick<NodeJS.Process, 'on'> = process) => {
    target.on('SIGINT', () => {
      handleSignal('SIGINT');
    });

    target.on('SIGTERM', () => {
      handleSignal('SIGTERM');
    });
  };

  return {
    destroyOpenSockets,
    handleSignal,
    registerSignalHandlers,
    shutdown,
    sockets,
  };
}
