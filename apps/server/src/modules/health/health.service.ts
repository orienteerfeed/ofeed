import type { PrismaClient } from "../../generated/prisma/client";

import { HEALTH_CONFIG } from "../../constants";
import type { CheckResult, HealthResponse } from "./health.schema";

import packageJson from "../../../../../package.json" with { type: "json" };

const DB_CHECK_TIMEOUT_MS = HEALTH_CONFIG.DB_TIMEOUT_MS;

export async function checkDatabase(prisma: PrismaClient, timeoutMs = DB_CHECK_TIMEOUT_MS): Promise<CheckResult> {
  const startTime = performance.now();

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Database check timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    await Promise.race([prisma.$queryRaw`SELECT 1 as health`, timeoutPromise]);

    return {
      name: "database",
      status: "UP",
      responseTimeMs: Math.round(performance.now() - startTime),
      message: "Connection successful",
    };
  } catch (error) {
    return {
      name: "database",
      status: "DOWN",
      responseTimeMs: Math.round(performance.now() - startTime),
      message: error instanceof Error ? error.message : "Unknown database error",
    };
  }
}

export function checkMemory(): CheckResult {
  const memUsage = process.memoryUsage();
  const heapUsagePercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);
  const status = heapUsagePercent > 85 ? "DOWN" : "UP";

  return {
    name: "memory",
    status,
    message: status === "UP" ? "Memory usage normal" : "High memory usage",
    details: {
      heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
      rssMB: Math.round(memUsage.rss / 1024 / 1024),
      heapUsagePercent,
    },
  };
}

export function calculateHealthStatus(checks: CheckResult[]): "UP" | "DEGRADED" | "DOWN" {
  const hasFailure = checks.some(check => check.status === "DOWN");
  if (hasFailure) {
    return "DOWN";
  }

  return "UP";
}

export function isReady(checks: CheckResult[]): boolean {
  const dbCheck = checks.find(check => check.name === "database");
  return dbCheck?.status === "UP";
}

export async function performReadinessCheck(prisma: PrismaClient) {
  const dbCheck = await checkDatabase(prisma);
  const checks = [dbCheck];

  return {
    ready: isReady(checks),
    checks,
  };
}

export async function performFullHealthCheck(prisma: PrismaClient): Promise<HealthResponse> {
  const dbCheck = await checkDatabase(prisma);
  const memoryCheck = checkMemory();
  const checks = [dbCheck, memoryCheck];

  return {
    status: calculateHealthStatus(checks),
    version: packageJson.version ?? "1.0.0",
    uptime: Math.round(process.uptime()),
    checks,
  };
}
