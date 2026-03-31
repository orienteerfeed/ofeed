import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createGracefulShutdown,
  type DisconnectableClient,
  type ShutdownLogger,
  type ShutdownServer,
  type ShutdownSocket,
  trackServerConnections,
} from '../graceful-shutdown.js';

function createLogger(): ShutdownLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function createServer(closeImpl?: (callback?: (error?: Error) => void) => void) {
  const server = new EventEmitter() as EventEmitter & ShutdownServer;

  server.closeAllConnections = vi.fn();
  server.close = vi.fn((callback?: (error?: Error) => void) => {
    closeImpl?.(callback);
  });

  return server;
}

function createSocket() {
  const socket = new EventEmitter() as EventEmitter & ShutdownSocket;

  socket.destroy = vi.fn(() => {
    socket.emit('close');
    return socket;
  });

  return socket;
}

describe('graceful-shutdown', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tracks and removes server connections', () => {
    const server = createServer();
    const sockets = trackServerConnections(server);
    const socket = createSocket();

    server.emit('connection', socket);
    expect(sockets.has(socket)).toBe(true);

    socket.emit('close');
    expect(sockets.size).toBe(0);
  });

  it('performs websocket, http server, and prisma cleanup on shutdown', async () => {
    const calls: string[] = [];
    const server = createServer((callback) => {
      calls.push('server');
      callback?.();
    });
    const disposeGraphQLWebSocket = vi.fn(async () => {
      calls.push('ws');
    });
    const prisma: DisconnectableClient = {
      $disconnect: vi.fn(async () => {
        calls.push('prisma');
      }),
    };
    const logger = createLogger();

    const gracefulShutdown = createGracefulShutdown({
      server,
      disposeGraphQLWebSocket,
      prisma,
      logger,
      timeoutMs: 100,
      exitProcess: vi.fn(),
    });

    const result = await gracefulShutdown.shutdown('SIGTERM');

    expect(result.status).toBe('completed');
    expect(calls).toEqual(['ws', 'server', 'prisma']);
    expect(disposeGraphQLWebSocket).toHaveBeenCalledTimes(1);
    expect(prisma.$disconnect).toHaveBeenCalledTimes(1);
  });

  it('forces open sockets closed when shutdown times out', async () => {
    vi.useFakeTimers();

    const server = createServer();
    const socket = createSocket();
    const prisma: DisconnectableClient = {
      $disconnect: vi.fn(async () => undefined),
    };
    const logger = createLogger();

    const gracefulShutdown = createGracefulShutdown({
      server,
      disposeGraphQLWebSocket: vi.fn(async () => undefined),
      prisma,
      logger,
      timeoutMs: 50,
      exitProcess: vi.fn(),
    });

    server.emit('connection', socket);

    const shutdownPromise = gracefulShutdown.shutdown('SIGINT');
    await vi.advanceTimersByTimeAsync(50);

    const result = await shutdownPromise;

    expect(result.status).toBe('timed_out');
    expect(server.closeAllConnections).toHaveBeenCalledTimes(1);
    expect(socket.destroy).toHaveBeenCalledTimes(1);
    expect(prisma.$disconnect).toHaveBeenCalledTimes(1);
  });

  it('exits with success code after a completed signal-based shutdown', async () => {
    const exitProcess = vi.fn();
    const server = createServer((callback) => {
      callback?.();
    });
    const gracefulShutdown = createGracefulShutdown({
      server,
      disposeGraphQLWebSocket: vi.fn(async () => undefined),
      prisma: { $disconnect: vi.fn(async () => undefined) },
      logger: createLogger(),
      timeoutMs: 100,
      exitProcess,
    });

    gracefulShutdown.handleSignal('SIGTERM');
    await vi.waitFor(() => {
      expect(exitProcess).toHaveBeenCalledWith(0);
    });
  });

  it('forces exit on a repeated shutdown signal', async () => {
    const exitProcess = vi.fn();
    const server = createServer();
    const socket = createSocket();
    const gracefulShutdown = createGracefulShutdown({
      server,
      disposeGraphQLWebSocket: vi.fn(async () => undefined),
      prisma: { $disconnect: vi.fn(async () => undefined) },
      logger: createLogger(),
      timeoutMs: 100,
      exitProcess,
    });

    server.emit('connection', socket);

    gracefulShutdown.handleSignal('SIGINT');
    await Promise.resolve();
    gracefulShutdown.handleSignal('SIGINT');

    expect(server.closeAllConnections).toHaveBeenCalledTimes(1);
    expect(socket.destroy).toHaveBeenCalledTimes(1);
    expect(exitProcess).toHaveBeenCalledWith(1);
  });
});
