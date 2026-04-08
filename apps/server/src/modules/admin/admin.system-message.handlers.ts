import { z } from '@hono/zod-openapi';
import {
  adminSystemMessageUpdateInputSchema,
  adminSystemMessageUpsertInputSchema,
} from '@repo/shared';

import { HTTP_STATUS } from '../../constants/index.js';
import { logger } from '../../lib/logging.js';
import { getAdminUserId } from '../../middlewares/require-admin.js';
import { error as errorResponse, success as successResponse } from '../../utils/responseApi.js';
import prisma from '../../utils/context.js';

import {
  createAdminSystemMessage,
  deleteAdminSystemMessage,
  getAdminSystemMessages,
  isAdminSystemMessageActionError,
  updateAdminSystemMessage,
} from './admin.system-message.service.js';

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

function parseAdminSystemMessageId(value: string) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Invalid admin system message id');
  }

  return parsed;
}

export async function getAdminSystemMessagesHandler(c) {
  const adminUserId = getAdminUserId(c);
  const logContext = buildAdminLogContext(c, adminUserId);

  try {
    const systemMessages = await getAdminSystemMessages(prisma as never);

    logger.info('Admin system messages list loaded', {
      ...logContext,
      results: {
        total: systemMessages.total,
        returned: systemMessages.items.length,
      },
    });

    return c.json(
      successResponse('Admin system messages loaded', systemMessages, HTTP_STATUS.OK),
      HTTP_STATUS.OK,
    );
  } catch (error) {
    logger.error('Failed to load admin system messages', {
      ...logContext,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return c.json(
      errorResponse('Failed to load admin system messages', HTTP_STATUS.INTERNAL_SERVER_ERROR),
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}

export async function createAdminSystemMessageHandler(c) {
  const adminUserId = getAdminUserId(c);
  const logContext = buildAdminLogContext(c, adminUserId);

  try {
    const body = adminSystemMessageUpsertInputSchema.parse(await c.req.json());
    const result = await createAdminSystemMessage(prisma as never, body);

    logger.info('Admin system message created', {
      ...logContext,
      results: {
        systemMessageId: result.systemMessage.id,
      },
    });

    return c.json(
      successResponse('Admin system message created', result, HTTP_STATUS.OK),
      HTTP_STATUS.OK,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json(
        errorResponse('Invalid admin system message request', HTTP_STATUS.UNPROCESSABLE_CONTENT),
        HTTP_STATUS.UNPROCESSABLE_CONTENT,
      );
    }

    if (isAdminSystemMessageActionError(error)) {
      logger.warn('Admin system message creation rejected', {
        ...logContext,
        error: error.message,
      });

      return c.json(errorResponse(error.message, error.statusCode), error.statusCode);
    }

    logger.error('Failed to create admin system message', {
      ...logContext,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return c.json(
      errorResponse('Failed to create admin system message', HTTP_STATUS.INTERNAL_SERVER_ERROR),
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}

export async function updateAdminSystemMessageHandler(c) {
  const adminUserId = getAdminUserId(c);
  const logContext = buildAdminLogContext(c, adminUserId);

  try {
    const messageId = parseAdminSystemMessageId(c.req.param('messageId'));
    const body = adminSystemMessageUpdateInputSchema.parse(await c.req.json());
    const result = await updateAdminSystemMessage(prisma as never, {
      messageId,
      input: body,
    });

    logger.info('Admin system message updated', {
      ...logContext,
      results: {
        systemMessageId: result.systemMessage.id,
      },
    });

    return c.json(
      successResponse('Admin system message updated', result, HTTP_STATUS.OK),
      HTTP_STATUS.OK,
    );
  } catch (error) {
    if (
      error instanceof z.ZodError ||
      (error instanceof Error && error.message === 'Invalid admin system message id')
    ) {
      return c.json(
        errorResponse('Invalid admin system message request', HTTP_STATUS.UNPROCESSABLE_CONTENT),
        HTTP_STATUS.UNPROCESSABLE_CONTENT,
      );
    }

    if (isAdminSystemMessageActionError(error)) {
      logger.warn('Admin system message update rejected', {
        ...logContext,
        error: error.message,
      });

      return c.json(errorResponse(error.message, error.statusCode), error.statusCode);
    }

    logger.error('Failed to update admin system message', {
      ...logContext,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return c.json(
      errorResponse('Failed to update admin system message', HTTP_STATUS.INTERNAL_SERVER_ERROR),
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}

export async function deleteAdminSystemMessageHandler(c) {
  const adminUserId = getAdminUserId(c);
  const logContext = buildAdminLogContext(c, adminUserId);

  try {
    const messageId = parseAdminSystemMessageId(c.req.param('messageId'));
    const result = await deleteAdminSystemMessage(prisma as never, { messageId });

    logger.info('Admin system message deleted', {
      ...logContext,
      results: {
        systemMessageId: result.systemMessage.id,
      },
    });

    return c.json(
      successResponse('Admin system message deleted', result, HTTP_STATUS.OK),
      HTTP_STATUS.OK,
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid admin system message id') {
      return c.json(
        errorResponse('Invalid admin system message request', HTTP_STATUS.UNPROCESSABLE_CONTENT),
        HTTP_STATUS.UNPROCESSABLE_CONTENT,
      );
    }

    if (isAdminSystemMessageActionError(error)) {
      logger.warn('Admin system message deletion rejected', {
        ...logContext,
        error: error.message,
      });

      return c.json(errorResponse(error.message, error.statusCode), error.statusCode);
    }

    logger.error('Failed to delete admin system message', {
      ...logContext,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return c.json(
      errorResponse('Failed to delete admin system message', HTTP_STATUS.INTERNAL_SERVER_ERROR),
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}
