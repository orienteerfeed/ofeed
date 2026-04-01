import type { Context, MiddlewareHandler } from 'hono';

import type { AppBindings } from '../types/index.js';

import { logger } from '../lib/logging.js';
import prisma from '../utils/context.js';
import { requireAdmin as requireAdminAuthz, isAuthzError } from '../utils/authz.js';
import { error as errorResponse } from '../utils/responseApi.js';

export const requireAdminAccess: MiddlewareHandler<AppBindings, any> = async (c, next) => {
  try {
    await requireAdminAuthz(prisma, c.get('authContext'));
    await next();
  } catch (error) {
    if (isAuthzError(error)) {
      logger.warn('Admin access rejected', {
        requestId: c.get('requestId'),
        request: {
          method: c.req.method,
          path: c.req.path,
        },
        auth: {
          authType: c.get('authContext')?.type ?? null,
          userId: c.get('authContext')?.userId ?? null,
        },
        response: {
          statusCode: error.statusCode,
        },
      });

      return c.json(errorResponse(error.message, error.statusCode), error.statusCode as never);
    }

    throw error;
  }
};

export function getAdminUserId(c: Context<AppBindings>) {
  const rawUserId = c.get('authContext')?.userId;

  if (typeof rawUserId === 'number') {
    return Number.isFinite(rawUserId) ? rawUserId : null;
  }

  if (typeof rawUserId === 'string' && rawUserId.trim() !== '') {
    const parsedUserId = Number(rawUserId);
    return Number.isFinite(parsedUserId) ? parsedUserId : null;
  }

  return null;
}
