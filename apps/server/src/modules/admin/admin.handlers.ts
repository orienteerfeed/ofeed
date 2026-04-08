import { z } from '@hono/zod-openapi';
import { adminUserActiveUpdateInputSchema } from '@repo/shared';

import { HTTP_STATUS } from '../../constants/index.js';
import { logger } from '../../lib/logging.js';
import { getAdminUserId } from '../../middlewares/require-admin.js';
import { error as errorResponse, success as successResponse } from '../../utils/responseApi.js';
import prisma from '../../utils/context.js';

import {
  deleteAdminUser,
  getAdminDashboard,
  getAdminEvents,
  getAdminUsers,
  isAdminUserActionError,
  updateAdminUserActive,
} from './admin.service.js';
export * from './admin.czech-ranking.handlers.js';
export * from './admin.system-message.handlers.js';

function buildAdminLogContext(c, adminUserId: number | null) {
  return {
    requestId: c.get('requestId'),
    request: {
      method: c.req.method,
      path: c.req.path,
    },
    auth: {
      userId: adminUserId,
    },
  };
}

export async function getAdminDashboardHandler(c) {
  const adminUserId = getAdminUserId(c);
  const logContext = buildAdminLogContext(c, adminUserId);

  try {
    const dashboard = await getAdminDashboard(prisma);

    logger.info('Admin dashboard loaded', {
      ...logContext,
      results: {
        totalUsers: dashboard.summary.totalUsers,
        totalEvents: dashboard.summary.totalEvents,
      },
    });

    return c.json(
      successResponse('Admin dashboard loaded', dashboard, HTTP_STATUS.OK),
      HTTP_STATUS.OK,
    );
  } catch (error) {
    logger.error('Failed to load admin dashboard', {
      ...logContext,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return c.json(
      errorResponse('Failed to load admin dashboard', HTTP_STATUS.INTERNAL_SERVER_ERROR),
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}

export async function getAdminUsersHandler(c) {
  const adminUserId = getAdminUserId(c);
  const logContext = buildAdminLogContext(c, adminUserId);

  try {
    const users = await getAdminUsers(prisma);

    logger.info('Admin users list loaded', {
      ...logContext,
      results: {
        total: users.total,
        returned: users.items.length,
      },
    });

    return c.json(successResponse('Admin users loaded', users, HTTP_STATUS.OK), HTTP_STATUS.OK);
  } catch (error) {
    logger.error('Failed to load admin users', {
      ...logContext,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return c.json(
      errorResponse('Failed to load admin users', HTTP_STATUS.INTERNAL_SERVER_ERROR),
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}

export async function getAdminEventsHandler(c) {
  const adminUserId = getAdminUserId(c);
  const logContext = buildAdminLogContext(c, adminUserId);

  try {
    const events = await getAdminEvents(prisma);

    logger.info('Admin events list loaded', {
      ...logContext,
      results: {
        total: events.total,
        returned: events.items.length,
      },
    });

    return c.json(successResponse('Admin events loaded', events, HTTP_STATUS.OK), HTTP_STATUS.OK);
  } catch (error) {
    logger.error('Failed to load admin events', {
      ...logContext,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return c.json(
      errorResponse('Failed to load admin events', HTTP_STATUS.INTERNAL_SERVER_ERROR),
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}

function parseAdminUserId(value: string) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Invalid admin user id');
  }

  return parsed;
}

export async function updateAdminUserHandler(c) {
  const adminUserId = getAdminUserId(c);
  const logContext = buildAdminLogContext(c, adminUserId);

  try {
    const targetUserId = parseAdminUserId(c.req.param('userId'));
    const body = adminUserActiveUpdateInputSchema.parse(await c.req.json());
    const result = await updateAdminUserActive(prisma, {
      adminUserId: adminUserId as number,
      targetUserId,
      active: body.active,
    });

    logger.info('Admin user status updated', {
      ...logContext,
      results: {
        targetUserId,
        active: result.user.active,
      },
    });

    return c.json(successResponse('Admin user updated', result, HTTP_STATUS.OK), HTTP_STATUS.OK);
  } catch (error) {
    if (
      error instanceof z.ZodError ||
      (error instanceof Error && error.message === 'Invalid admin user id')
    ) {
      return c.json(
        errorResponse('Invalid admin user request', HTTP_STATUS.UNPROCESSABLE_CONTENT),
        HTTP_STATUS.UNPROCESSABLE_CONTENT,
      );
    }

    if (isAdminUserActionError(error)) {
      logger.warn('Admin user status update rejected', {
        ...logContext,
        error: error.message,
      });

      return c.json(errorResponse(error.message, error.statusCode), error.statusCode);
    }

    logger.error('Failed to update admin user status', {
      ...logContext,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return c.json(
      errorResponse('Failed to update admin user status', HTTP_STATUS.INTERNAL_SERVER_ERROR),
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}

export async function deleteAdminUserHandler(c) {
  const adminUserId = getAdminUserId(c);
  const logContext = buildAdminLogContext(c, adminUserId);

  try {
    const targetUserId = parseAdminUserId(c.req.param('userId'));
    const result = await deleteAdminUser(prisma, {
      adminUserId: adminUserId as number,
      targetUserId,
    });

    logger.info('Admin user deleted', {
      ...logContext,
      results: {
        targetUserId,
        deletedEmail: result.user.email,
      },
    });

    return c.json(successResponse('Admin user deleted', result, HTTP_STATUS.OK), HTTP_STATUS.OK);
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid admin user id') {
      return c.json(
        errorResponse('Invalid admin user request', HTTP_STATUS.UNPROCESSABLE_CONTENT),
        HTTP_STATUS.UNPROCESSABLE_CONTENT,
      );
    }

    if (isAdminUserActionError(error)) {
      logger.warn('Admin user deletion rejected', {
        ...logContext,
        error: error.message,
      });

      return c.json(errorResponse(error.message, error.statusCode), error.statusCode);
    }

    logger.error('Failed to delete admin user', {
      ...logContext,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return c.json(
      errorResponse('Failed to delete admin user', HTTP_STATUS.INTERNAL_SERVER_ERROR),
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}
