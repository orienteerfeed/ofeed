import { z } from '@hono/zod-openapi';

import { HTTP_STATUS } from '../../constants/index.js';
import { NotFoundError } from '../../exceptions/index.js';
import { parseMultipartPayload, parseJsonObjectSafe } from '../../lib/http/body-parser.js';
import { logger } from '../../lib/logging.js';
import { toValidationIssues } from '../../lib/validation/zod.js';
import { getAdminUserId } from '../../middlewares/require-admin.js';
import {
  error as errorResponse,
  success as successResponse,
  validation,
} from '../../utils/responseApi.js';
import prisma from '../../utils/context.js';

import {
  clearAdminCzechRankingEventResults,
  clearAdminCzechRankingSnapshots,
  getAdminCzechRankingEventDetail,
  getAdminCzechRankingOverview,
  getAdminCzechRankingSnapshotDetail,
  syncAdminCzechRankingEventResults,
  uploadAdminCzechRankingSnapshot,
} from './admin.czech-ranking.service.js';

const adminCzechRankingSnapshotQuerySchema = z.object({
  rankingType: z.enum(['FOREST', 'SPRINT']),
  rankingCategory: z.enum(['M', 'F']),
  validForMonth: z.string().regex(/^\d{4}-\d{2}$/),
});

const adminCzechRankingSnapshotClearQuerySchema = adminCzechRankingSnapshotQuerySchema.partial();

const adminCzechRankingEventQuerySchema = z.object({
  externalEventId: z.string().min(1),
  rankingType: z.enum(['FOREST', 'SPRINT']),
  rankingCategory: z.enum(['M', 'F']),
});

const adminCzechRankingEventClearQuerySchema = adminCzechRankingEventQuerySchema.partial();

const adminCzechRankingSyncBodySchema = z.object({
  scope: z.enum(['ALL', 'FOREST', 'SPRINT']).default('ALL'),
});

const adminCzechRankingUploadBodySchema = z.object({
  rankingType: z.enum(['FOREST', 'SPRINT']),
  rankingCategory: z.enum(['M', 'F']),
  validForMonth: z.string().regex(/^\d{4}-\d{2}$/),
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

function normalizeCzechRankingMonthInput(input: string): Date | null {
  if (!/^\d{4}-\d{2}$/.test(input)) {
    return null;
  }

  const [yearRaw, monthRaw] = input.split('-');
  const year = Number.parseInt(yearRaw ?? '', 10);
  const month = Number.parseInt(monthRaw ?? '', 10);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
}

function handleAdminCzechRankingError(
  c,
  message: string,
  logContext: Record<string, unknown>,
  error: unknown,
) {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';

  if (error instanceof NotFoundError) {
    logger.warn(message, {
      ...logContext,
      error: errorMessage,
      response: {
        statusCode: error.statusCode,
      },
    });

    return c.json(errorResponse(error.message, error.statusCode), error.statusCode);
  }

  logger.error(message, {
    ...logContext,
    error: errorMessage,
  });

  return c.json(
    errorResponse(
      'Failed to process admin Czech ranking request',
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    ),
    HTTP_STATUS.INTERNAL_SERVER_ERROR,
  );
}

export async function getAdminCzechRankingOverviewHandler(c) {
  const adminUserId = getAdminUserId(c);
  const logContext = buildAdminLogContext(c, adminUserId);

  try {
    const overview = await getAdminCzechRankingOverview(prisma);

    logger.info('Admin Czech ranking overview loaded', {
      ...logContext,
      results: overview.summary,
    });

    return c.json(
      successResponse('Admin Czech ranking overview loaded', overview, HTTP_STATUS.OK),
      HTTP_STATUS.OK,
    );
  } catch (error) {
    return handleAdminCzechRankingError(
      c,
      'Failed to load admin Czech ranking overview',
      logContext,
      error,
    );
  }
}

export async function getAdminCzechRankingSnapshotDetailHandler(c) {
  const adminUserId = getAdminUserId(c);
  const logContext = buildAdminLogContext(c, adminUserId);
  const parsedQuery = adminCzechRankingSnapshotQuerySchema.safeParse(c.req.query());

  if (!parsedQuery.success) {
    return c.json(
      validation(toValidationIssues(parsedQuery.error.issues)),
      HTTP_STATUS.UNPROCESSABLE_CONTENT,
    );
  }

  const validForMonth = normalizeCzechRankingMonthInput(parsedQuery.data.validForMonth);
  if (!validForMonth) {
    return c.json(
      validation('Invalid validForMonth. Expected YYYY-MM', HTTP_STATUS.UNPROCESSABLE_CONTENT),
      HTTP_STATUS.UNPROCESSABLE_CONTENT,
    );
  }

  try {
    const detail = await getAdminCzechRankingSnapshotDetail(prisma, {
      rankingType: parsedQuery.data.rankingType,
      rankingCategory: parsedQuery.data.rankingCategory,
      validForMonth,
    });

    logger.info('Admin Czech ranking snapshot detail loaded', {
      ...logContext,
      results: {
        rankingType: detail.dataset.rankingType,
        rankingCategory: detail.dataset.rankingCategory,
        validForMonth: detail.dataset.validForMonth,
        entriesCount: detail.dataset.entriesCount,
      },
    });

    return c.json(
      successResponse('Admin Czech ranking snapshot detail loaded', detail, HTTP_STATUS.OK),
      HTTP_STATUS.OK,
    );
  } catch (error) {
    return handleAdminCzechRankingError(
      c,
      'Failed to load admin Czech ranking snapshot detail',
      {
        ...logContext,
        filters: parsedQuery.data,
      },
      error,
    );
  }
}

export async function uploadAdminCzechRankingSnapshotHandler(c) {
  const adminUserId = getAdminUserId(c);
  const logContext = buildAdminLogContext(c, adminUserId);
  const { body, file } = await parseMultipartPayload(c);

  if (!file) {
    return c.json(
      validation('No file uploaded', HTTP_STATUS.UNPROCESSABLE_CONTENT),
      HTTP_STATUS.UNPROCESSABLE_CONTENT,
    );
  }

  const parsedBody = adminCzechRankingUploadBodySchema.safeParse(body);
  if (!parsedBody.success) {
    return c.json(
      validation(toValidationIssues(parsedBody.error.issues)),
      HTTP_STATUS.UNPROCESSABLE_CONTENT,
    );
  }

  if (file.size > 2_000_000) {
    return c.json(
      validation('File is too large. Allowed size is up to 2MB', HTTP_STATUS.UNPROCESSABLE_CONTENT),
      HTTP_STATUS.UNPROCESSABLE_CONTENT,
    );
  }

  try {
    const result = await uploadAdminCzechRankingSnapshot({
      csvData: file.buffer.toString('utf-8'),
      rankingType: parsedBody.data.rankingType,
      rankingCategory: parsedBody.data.rankingCategory,
      validForMonthInput: parsedBody.data.validForMonth,
    });

    logger.info('Admin Czech ranking snapshot uploaded', {
      ...logContext,
      upload: {
        rankingType: result.rankingType,
        rankingCategory: result.rankingCategory,
        validForMonth: result.validForMonth,
        importedEntries: result.importedEntries,
        fileName: file.originalname,
        fileSizeBytes: file.size,
      },
    });

    return c.json(
      successResponse('Admin Czech ranking snapshot uploaded', result, HTTP_STATUS.OK),
      HTTP_STATUS.OK,
    );
  } catch (error) {
    return handleAdminCzechRankingError(
      c,
      'Failed to upload admin Czech ranking snapshot',
      {
        ...logContext,
        upload: {
          fileName: file.originalname,
          fileSizeBytes: file.size,
          ...parsedBody.data,
        },
      },
      error,
    );
  }
}

export async function clearAdminCzechRankingSnapshotsHandler(c) {
  const adminUserId = getAdminUserId(c);
  const logContext = buildAdminLogContext(c, adminUserId);
  const parsedQuery = adminCzechRankingSnapshotClearQuerySchema.safeParse(c.req.query());

  if (!parsedQuery.success) {
    return c.json(
      validation(toValidationIssues(parsedQuery.error.issues)),
      HTTP_STATUS.UNPROCESSABLE_CONTENT,
    );
  }

  const validForMonth =
    parsedQuery.data.validForMonth != null
      ? normalizeCzechRankingMonthInput(parsedQuery.data.validForMonth)
      : undefined;

  if (parsedQuery.data.validForMonth != null && !validForMonth) {
    return c.json(
      validation('Invalid validForMonth. Expected YYYY-MM', HTTP_STATUS.UNPROCESSABLE_CONTENT),
      HTTP_STATUS.UNPROCESSABLE_CONTENT,
    );
  }

  try {
    const result = await clearAdminCzechRankingSnapshots(prisma, {
      ...(parsedQuery.data.rankingType ? { rankingType: parsedQuery.data.rankingType } : {}),
      ...(parsedQuery.data.rankingCategory
        ? { rankingCategory: parsedQuery.data.rankingCategory }
        : {}),
      ...(validForMonth ? { validForMonth } : {}),
    });

    logger.info('Admin Czech ranking snapshots cleared', {
      ...logContext,
      filters: parsedQuery.data,
      results: result,
    });

    return c.json(
      successResponse('Admin Czech ranking snapshots cleared', result, HTTP_STATUS.OK),
      HTTP_STATUS.OK,
    );
  } catch (error) {
    return handleAdminCzechRankingError(
      c,
      'Failed to clear admin Czech ranking snapshots',
      {
        ...logContext,
        filters: parsedQuery.data,
      },
      error,
    );
  }
}

export async function getAdminCzechRankingEventDetailHandler(c) {
  const adminUserId = getAdminUserId(c);
  const logContext = buildAdminLogContext(c, adminUserId);
  const parsedQuery = adminCzechRankingEventQuerySchema.safeParse(c.req.query());

  if (!parsedQuery.success) {
    return c.json(
      validation(toValidationIssues(parsedQuery.error.issues)),
      HTTP_STATUS.UNPROCESSABLE_CONTENT,
    );
  }

  try {
    const detail = await getAdminCzechRankingEventDetail(prisma, parsedQuery.data);

    logger.info('Admin Czech ranking event result detail loaded', {
      ...logContext,
      results: {
        externalEventId: detail.dataset.externalEventId,
        rankingType: detail.dataset.rankingType,
        rankingCategory: detail.dataset.rankingCategory,
        resultCount: detail.dataset.resultCount,
      },
    });

    return c.json(
      successResponse('Admin Czech ranking event result detail loaded', detail, HTTP_STATUS.OK),
      HTTP_STATUS.OK,
    );
  } catch (error) {
    return handleAdminCzechRankingError(
      c,
      'Failed to load admin Czech ranking event result detail',
      {
        ...logContext,
        filters: parsedQuery.data,
      },
      error,
    );
  }
}

export async function syncAdminCzechRankingEventResultsHandler(c) {
  const adminUserId = getAdminUserId(c);
  const logContext = buildAdminLogContext(c, adminUserId);
  const rawBody = await parseJsonObjectSafe(c);
  const parsedBody = adminCzechRankingSyncBodySchema.safeParse(rawBody);

  if (!parsedBody.success) {
    return c.json(
      validation(toValidationIssues(parsedBody.error.issues)),
      HTTP_STATUS.UNPROCESSABLE_CONTENT,
    );
  }

  try {
    const result = await syncAdminCzechRankingEventResults(parsedBody.data.scope);

    logger.info('Admin Czech ranking ORIS sync finished', {
      ...logContext,
      results: result,
    });

    return c.json(
      successResponse('Admin Czech ranking ORIS sync finished', result, HTTP_STATUS.OK),
      HTTP_STATUS.OK,
    );
  } catch (error) {
    return handleAdminCzechRankingError(
      c,
      'Failed to synchronize admin Czech ranking event results from ORIS',
      {
        ...logContext,
        sync: parsedBody.data,
      },
      error,
    );
  }
}

export async function clearAdminCzechRankingEventResultsHandler(c) {
  const adminUserId = getAdminUserId(c);
  const logContext = buildAdminLogContext(c, adminUserId);
  const parsedQuery = adminCzechRankingEventClearQuerySchema.safeParse(c.req.query());

  if (!parsedQuery.success) {
    return c.json(
      validation(toValidationIssues(parsedQuery.error.issues)),
      HTTP_STATUS.UNPROCESSABLE_CONTENT,
    );
  }

  try {
    const result = await clearAdminCzechRankingEventResults(prisma, parsedQuery.data);

    logger.info('Admin Czech ranking event results cleared', {
      ...logContext,
      filters: parsedQuery.data,
      results: result,
    });

    return c.json(
      successResponse('Admin Czech ranking event results cleared', result, HTTP_STATUS.OK),
      HTTP_STATUS.OK,
    );
  } catch (error) {
    return handleAdminCzechRankingError(
      c,
      'Failed to clear admin Czech ranking event results',
      {
        ...logContext,
        filters: parsedQuery.data,
      },
      error,
    );
  }
}
