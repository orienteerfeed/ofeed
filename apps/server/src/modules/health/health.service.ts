import type { PrismaClient } from '../../generated/prisma/client.js';

import { HEALTH_CONFIG } from '../../constants/index.js';
import type { CheckResult } from './health.schema.js';

const DB_CHECK_TIMEOUT_MS = HEALTH_CONFIG.DB_TIMEOUT_MS;

export async function checkDatabase(
  prisma: PrismaClient,
  timeoutMs = DB_CHECK_TIMEOUT_MS,
): Promise<CheckResult> {
  const startTime = performance.now();

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Database check timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
    });

    await Promise.race([prisma.$queryRaw`SELECT 1 as health`, timeoutPromise]);

    return {
      name: 'database',
      status: 'UP',
      responseTimeMs: Math.round(performance.now() - startTime),
      message: 'Connection successful',
    };
  } catch (error) {
    return {
      name: 'database',
      status: 'DOWN',
      responseTimeMs: Math.round(performance.now() - startTime),
      message: error instanceof Error ? error.message : 'Unknown database error',
    };
  }
}

export function isReady(checks: CheckResult[]): boolean {
  const dbCheck = checks.find((check) => check.name === 'database');
  return dbCheck?.status === 'UP';
}

export async function performReadinessCheck(prisma: PrismaClient) {
  const dbCheck = await checkDatabase(prisma);
  const checks = [dbCheck];

  return {
    ready: isReady(checks),
    checks,
  };
}
