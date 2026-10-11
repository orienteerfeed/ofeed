import type { Context } from 'hono';

import type { AppBindings } from '../../types/index.js';

import { logEndpoint } from '../../lib/http/endpoint-logger.js';
import { performReadinessCheck } from './health.service.js';

export function healthzHandler(c: Context<AppBindings>) {
  c.header('Cache-Control', 'no-store');
  return c.json(
    {
      status: 'alive',
      timestamp: new Date().toISOString(),
    },
    200,
  );
}

export async function readyzHandler(c: Context<AppBindings>) {
  c.header('Cache-Control', 'no-store');

  const prisma = c.get('prisma');
  const { ready, checks } = await performReadinessCheck(prisma);

  if (ready) {
    return c.json(
      {
        status: 'ready',
        checks,
      },
      200,
    );
  }

  c.header('Retry-After', '30');
  logEndpoint(c, 'warn', 'Readiness check reported not ready', { checks });

  return c.json(
    {
      status: 'not_ready',
      checks,
    },
    503,
  );
}
