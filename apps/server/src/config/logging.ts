import path from "node:path";

import env from "./env";

export interface LogRotationConfig {
  frequency: "daily" | "hourly" | "weekly";
  retentionDays: number;
  compress: boolean;
  boundary: boolean;
  utc: boolean;
}

export function getLogRotationConfig(): LogRotationConfig {
  return {
    frequency: env.LOG_ROTATION_FREQUENCY,
    retentionDays: env.LOG_RETENTION_DAYS,
    compress: env.LOG_COMPRESSION,
    boundary: env.LOG_ROTATION_BOUNDARY,
    utc: env.LOG_ROTATION_UTC,
  };
}

export const LOG_DIR = path.resolve(process.cwd(), env.LOG_DIR);

export function isRotationEnabled() {
  return env.LOG_ROTATION_ENABLED;
}

export function isAccessLogEnabled() {
  return env.ENABLE_ACCESS_LOG;
}

export function isAppLogEnabled() {
  return env.ENABLE_APP_LOG;
}

export function getLogLevel() {
  return env.LOG_LEVEL;
}
