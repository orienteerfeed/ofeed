import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pino from "pino";
import { createStream } from "rotating-file-stream";

import env from "../config/env";
import {
  getLogRotationConfig,
  isAccessLogEnabled,
  isAppLogEnabled,
  isRotationEnabled,
  LOG_DIR,
} from "../config/logging";

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function calculateMaxFiles(retentionDays: number, frequency: string): number {
  switch (frequency) {
    case "hourly":
      return retentionDays * 24;
    case "weekly":
      return Math.ceil(retentionDays / 7);
    case "daily":
    default:
      return retentionDays;
  }
}

function getRotationInterval(frequency: string): `${number}h` | `${number}d` {
  switch (frequency) {
    case "hourly":
      return "1h";
    case "weekly":
      return "7d";
    case "daily":
    default:
      return "1d";
  }
}

function createRotatingStream(filename: string) {
  const rotationConfig = getLogRotationConfig();

  const generator = (time: number | Date | null, index?: number): string => {
    if (time == null) {
      return filename;
    }

    const dateTime = time instanceof Date ? time : new Date(time);
    const year = dateTime.getFullYear();
    const month = String(dateTime.getMonth() + 1).padStart(2, "0");
    const day = String(dateTime.getDate()).padStart(2, "0");

    const collisionSuffix = index && index > 1 ? `.${index - 1}` : "";

    if (rotationConfig.frequency === "hourly") {
      const hour = String(dateTime.getHours()).padStart(2, "0");
      return `${filename}.${year}-${month}-${day}-${hour}${collisionSuffix}`;
    }

    return `${filename}.${year}-${month}-${day}${collisionSuffix}`;
  };

  return createStream(generator, {
    path: LOG_DIR,
    interval: getRotationInterval(rotationConfig.frequency),
    intervalBoundary: rotationConfig.boundary,
    intervalUTC: rotationConfig.utc,
    compress: rotationConfig.compress ? "gzip" : false,
    maxFiles: calculateMaxFiles(rotationConfig.retentionDays, rotationConfig.frequency),
    initialRotation: true,
  });
}

export interface LogContext {
  requestId?: string;
  request?: {
    method?: string;
    path?: string;
    userAgent?: string;
    ip?: string;
  };
  response?: {
    statusCode?: number;
    responseTime?: number;
  };
  [key: string]: unknown;
}

function toStreamLevel(level: typeof env.LOG_LEVEL): pino.Level {
  // Stream entries do not support "silent". Global logger level still can be "silent".
  return level === "silent" ? "trace" : level;
}

function createAppLogger() {
  const streamLevel = toStreamLevel(env.LOG_LEVEL);
  const streams: pino.StreamEntry[] = [];

  if (env.NODE_ENV === "development") {
    streams.push({
      level: streamLevel,
      stream: pino.destination({ dest: 1, sync: false }),
    });
  }

  if (isAppLogEnabled()) {
    const stream = isRotationEnabled()
      ? createRotatingStream("app.log")
      : pino.destination({ dest: path.join(LOG_DIR, "app.log"), sync: false });

    streams.push({ level: streamLevel, stream });
  }

  if (streams.length === 0) {
    streams.push({ level: streamLevel, stream: process.stdout });
  }

  const base = {
    pid: process.pid,
    hostname: os.hostname(),
    service: "orienteerfeed-api",
    env: env.NODE_ENV,
  };

  return streams.length > 1
    ? pino({ level: env.LOG_LEVEL, base, timestamp: pino.stdTimeFunctions.isoTime }, pino.multistream(streams))
    : pino({ level: env.LOG_LEVEL, base, timestamp: pino.stdTimeFunctions.isoTime }, streams[0].stream);
}

function createAccessLogger() {
  if (!isAccessLogEnabled()) {
    return null;
  }

  const stream = isRotationEnabled()
    ? createRotatingStream("access.log")
    : pino.destination({ dest: path.join(LOG_DIR, "access.log"), sync: false });

  return pino(
    {
      level: "info",
      timestamp: pino.stdTimeFunctions.isoTime,
      base: { service: "orienteerfeed-access" },
    },
    stream,
  );
}

export const appLogger = createAppLogger();
export const accessLogger = createAccessLogger();

export function createLogMessage(level: pino.Level, message: string, context?: LogContext) {
  appLogger[level]({ message, ...(context ? { context } : {}) });
}

export const logger = {
  debug: (message: string, context?: LogContext) => createLogMessage("debug", message, context),
  info: (message: string, context?: LogContext) => createLogMessage("info", message, context),
  warn: (message: string, context?: LogContext) => createLogMessage("warn", message, context),
  error: (message: string, context?: LogContext) => createLogMessage("error", message, context),
  fatal: (message: string, context?: LogContext) => createLogMessage("fatal", message, context),
};

export default appLogger;
