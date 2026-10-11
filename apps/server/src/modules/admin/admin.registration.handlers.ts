import { z } from '@hono/zod-openapi';
import { adminRegistrationSyncTriggerInputSchema } from '@repo/shared';

import { HTTP_STATUS } from '../../constants/index.js';
import { parseJsonObjectSafe } from '../../lib/http/body-parser.js';
import { logger } from '../../lib/logging.js';
import { toValidationIssues } from '../../lib/validation/zod.js';
import { getAdminUserId } from '../../middlewares/require-admin.js';
import {
  error as errorResponse,
  success as successResponse,
  validation as validationResponse,
} from '../../utils/responseApi.js';

import {
  getAdminClubs,
  getAdminRegistrationSyncStatus,
  getAdminRegistrations,
  triggerAdminRegistrationSync,
} from './admin.registration.service.js';

const adminRegistrationListQuerySchema = z.object({
  q: z.string().trim().max(64).optional(),
});

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

function parsePositiveIntegerQueryParam(value: string | undefined, defaultValue: number) {
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = value.trim();

  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
}

function handleAdminRegistrationError(
  c,
  message: string,
  logContext: Record<string, unknown>,
  error: unknown,
) {
  logger.error(message, {
    ...logContext,
    error: error instanceof Error ? error.message : 'Unknown error',
  });

  return c.json(
    errorResponse('Failed to process admin registration request', HTTP_STATUS.INTERNAL_SERVER_ERROR),
    HTTP_STATUS.INTERNAL_SERVER_ERROR,
  );
}

export async function getAdminRegistrationSyncStatusHandler(c) {
  const adminUserId = getAdminUserId(c);
  const logContext = buildAdminLogContext(c, adminUserId);

  try {
    const status = await getAdminRegistrationSyncStatus();

    logger.info('Admin registration sync status loaded', { ...logContext, results: status });

    return c.json(
      successResponse('Admin registration sync status loaded', status, HTTP_STATUS.OK),
      HTTP_STATUS.OK,
    );
  } catch (error) {
    return handleAdminRegistrationError(
      c,
      'Failed to load admin registration sync status',
      logContext,
      error,
    );
  }
}

export async function getAdminRegistrationsHandler(c) {
  const adminUserId = getAdminUserId(c);
  const logContext = buildAdminLogContext(c, adminUserId);

  const parsedQuery = adminRegistrationListQuerySchema.safeParse(c.req.query());
  if (!parsedQuery.success) {
    return c.json(
      validationResponse(toValidationIssues(parsedQuery.error.issues)),
      HTTP_STATUS.UNPROCESSABLE_CONTENT,
    );
  }

  const parsedPage = parsePositiveIntegerQueryParam(c.req.query('page'), 1);
  const parsedLimit = parsePositiveIntegerQueryParam(c.req.query('limit'), 25);
  if (parsedPage === null) {
    return c.json(validationResponse('Invalid page parameter'), HTTP_STATUS.UNPROCESSABLE_CONTENT);
  }
  if (parsedLimit === null) {
    return c.json(validationResponse('Invalid limit parameter'), HTTP_STATUS.UNPROCESSABLE_CONTENT);
  }

  const page = parsedPage;
  const limit = Math.min(200, parsedLimit);

  try {
    const registrations = await getAdminRegistrations({ page, limit, q: parsedQuery.data.q });

    logger.info('Admin registrations list loaded', {
      ...logContext,
      results: { total: registrations.total, page, limit },
    });

    return c.json(
      successResponse('Admin registrations list loaded', registrations, HTTP_STATUS.OK),
      HTTP_STATUS.OK,
    );
  } catch (error) {
    return handleAdminRegistrationError(
      c,
      'Failed to load admin registrations list',
      { ...logContext, filters: { page, limit, q: parsedQuery.data.q } },
      error,
    );
  }
}

export async function getAdminClubsHandler(c) {
  const adminUserId = getAdminUserId(c);
  const logContext = buildAdminLogContext(c, adminUserId);

  const parsedQuery = adminRegistrationListQuerySchema.safeParse(c.req.query());
  if (!parsedQuery.success) {
    return c.json(
      validationResponse(toValidationIssues(parsedQuery.error.issues)),
      HTTP_STATUS.UNPROCESSABLE_CONTENT,
    );
  }

  const parsedPage = parsePositiveIntegerQueryParam(c.req.query('page'), 1);
  const parsedLimit = parsePositiveIntegerQueryParam(c.req.query('limit'), 25);
  if (parsedPage === null) {
    return c.json(validationResponse('Invalid page parameter'), HTTP_STATUS.UNPROCESSABLE_CONTENT);
  }
  if (parsedLimit === null) {
    return c.json(validationResponse('Invalid limit parameter'), HTTP_STATUS.UNPROCESSABLE_CONTENT);
  }

  const page = parsedPage;
  const limit = Math.min(200, parsedLimit);

  try {
    const clubs = await getAdminClubs({ page, limit, q: parsedQuery.data.q });

    logger.info('Admin clubs list loaded', {
      ...logContext,
      results: { total: clubs.total, page, limit },
    });

    return c.json(successResponse('Admin clubs list loaded', clubs, HTTP_STATUS.OK), HTTP_STATUS.OK);
  } catch (error) {
    return handleAdminRegistrationError(
      c,
      'Failed to load admin clubs list',
      { ...logContext, filters: { page, limit, q: parsedQuery.data.q } },
      error,
    );
  }
}

export async function triggerAdminRegistrationSyncHandler(c) {
  const adminUserId = getAdminUserId(c);
  const logContext = buildAdminLogContext(c, adminUserId);

  const rawBody = await parseJsonObjectSafe(c);
  const parsedBody = adminRegistrationSyncTriggerInputSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return c.json(
      validationResponse(toValidationIssues(parsedBody.error.issues)),
      HTTP_STATUS.UNPROCESSABLE_CONTENT,
    );
  }

  try {
    const result = await triggerAdminRegistrationSync(parsedBody.data);

    logger.info('Admin registration ORIS sync finished', { ...logContext, results: result });

    return c.json(
      successResponse('Admin registration ORIS sync finished', result, HTTP_STATUS.OK),
      HTTP_STATUS.OK,
    );
  } catch (error) {
    return handleAdminRegistrationError(
      c,
      'Failed to synchronize admin registrations from ORIS',
      { ...logContext, sync: parsedBody.data },
      error,
    );
  }
}
