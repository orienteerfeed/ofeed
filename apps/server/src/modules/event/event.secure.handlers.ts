import path from 'path';
import { z } from "@hono/zod-openapi";
import type { Context, Handler } from "hono";
import sharp from 'sharp';

import { AuthenticationError, DatabaseError, ValidationError } from '../../exceptions/index.js';
import { parseJsonObjectSafe, parseMultipartPayload, type MultipartFile } from '../../lib/http/body-parser.js';
import { toLowerCaseHeaderRecord } from '../../lib/http/headers.js';
import { toValidationIssues, type ValidationIssue } from '../../lib/validation/zod.js';
import {
  error as errorResponse,
  success as successResponse,
  validation as validationResponse,
} from '../../utils/responseApi.js';

import prisma from '../../utils/context.js';
import {
  ensureEventOwner,
  isAuthzError,
  requireEventOwner,
  type EventOwnerOptions,
} from '../../utils/authz.js';
import { createCompetitorSchema, updateCompetitorSchema } from '../../utils/validateCompetitor.js';
import eventWriteSchema from '../../utils/validateEvent.js';
import { encodeBase64, encrypt } from '../../utils/cryptoUtils.js';
import { formatErrors } from '../../utils/errors.js';
import {
  deletePublicObject,
  deletePublicObjectsByPrefix,
  putPublicObject,
} from '../../utils/s3Storage.js';
import {
  changeCompetitorStatus,
  deleteAllEventData,
  deleteEventCompetitor,
  deleteEventCompetitors,
  getDecryptedEventPassword,
  storeCompetitor,
  updateCompetitor,
} from './event.service.js';
import type { AppBindings } from "../../types";
import {
  changelogQuerySchema,
  eventCompetitorExternalParamsSchema,
  eventCompetitorParamsSchema,
  eventIdParamsSchema,
} from "./event.schema.js";

type BodyMode = "auto" | "json" | "form" | "none";

type SecureFile = MultipartFile;

type EventRouteRequest = {
  params: any;
  query: any;
  body: any;
  headers: Record<string, string>;
  auth?: AppBindings["Variables"]["authContext"];
  jwtDecoded?: {
    userId?: string;
  };
  eventId?: string;
  file?: SecureFile;
  __validationIssues: ValidationIssue[];
};

type RouteJsonResponder = {
  statusCode: number;
  status: (code: number) => RouteJsonResponder;
  json: (payload: unknown) => Response;
};

function createRouteJsonResponder(c: Context<AppBindings>): RouteJsonResponder {
  const responder: RouteJsonResponder = {
    statusCode: 200,
    status(code: number) {
      responder.statusCode = code;
      return responder;
    },
    json(payload: unknown) {
      return c.json(payload as any, responder.statusCode as any);
    },
  };

  return responder;
}

type EventRouteHandler = (context: {
  c: Context<AppBindings>;
  req: EventRouteRequest;
  res: RouteJsonResponder;
}) => Promise<unknown> | unknown;

type EventRouteOptions = {
  bodyMode?: BodyMode;
  paramsSchema?: z.ZodTypeAny;
  querySchema?: z.ZodTypeAny;
  bodySchema?: z.ZodTypeAny;
};

async function buildEventRouteRequest(c: Context<AppBindings>, bodyMode: BodyMode): Promise<EventRouteRequest> {
  const params = c.req.param();
  const query = c.req.query();
  const method = c.req.method.toUpperCase();
  const contentType = c.req.header("content-type") ?? "";

  let body: Record<string, unknown> = {};
  let file: SecureFile | undefined;

  if (bodyMode !== "none" && method !== "GET" && method !== "HEAD") {
    const shouldParseForm =
      bodyMode === "form" ||
      (bodyMode === "auto" &&
        (contentType.includes("multipart/form-data") ||
          contentType.includes("application/x-www-form-urlencoded")));

    if (shouldParseForm) {
      const parsed = await parseMultipartPayload(c);
      body = parsed.body;
      file = parsed.file as SecureFile | undefined;
    } else {
      body = await parseJsonObjectSafe(c);
    }
  }

  const auth = c.get("authContext");
  const req: EventRouteRequest = {
    params,
    query,
    body,
    headers: toLowerCaseHeaderRecord(c.req.raw.headers),
    auth,
    __validationIssues: [],
  };

  if (auth?.isAuthenticated) {
    req.jwtDecoded = { userId: auth.userId };
    if (auth.type === "eventBasic") {
      req.eventId = auth.eventId;
    }
  }

  if (file) {
    req.file = file;
  }

  return req;
}

function applySchema<T extends z.ZodTypeAny>(
  req: EventRouteRequest,
  value: unknown,
  schema: T | undefined,
  target: "params" | "query" | "body",
) {
  if (!schema) {
    return;
  }

  const parsed = schema.safeParse(value);

  if (!parsed.success) {
    req.__validationIssues.push(...toValidationIssues(parsed.error));
    return;
  }

  req[target] = parsed.data as any;
}

function getValidationResult(req: EventRouteRequest) {
  return {
    isEmpty: () => req.__validationIssues.length === 0,
    array: () => req.__validationIssues,
  };
}

async function authorizeOwnedEvent(
  req: EventRouteRequest,
  res: RouteJsonResponder,
  eventId: string,
  options?: EventOwnerOptions,
) {
  try {
    const ownership = await ensureEventOwner(prisma, req.auth, eventId, options);
    return { ok: true as const, ...ownership };
  } catch (error) {
    if (isAuthzError(error)) {
      return {
        ok: false as const,
        response: res.status(error.statusCode).json(errorResponse(error.message, error.statusCode)),
      };
    }

    throw error;
  }
}

function routeWithValidation(options: EventRouteOptions, handler: EventRouteHandler): Handler<AppBindings>;
function routeWithValidation(handler: EventRouteHandler): Handler<AppBindings>;
function routeWithValidation(
  first: EventRouteOptions | EventRouteHandler,
  second?: EventRouteHandler,
): Handler<AppBindings> {
  const options = typeof first === "function" ? {} : first;
  const handler = typeof first === "function" ? first : second;

  if (!handler) {
    throw new Error("routeWithValidation: missing handler");
  }

  return async c => {
    const req = await buildEventRouteRequest(c, options.bodyMode ?? "auto");
    const res = createRouteJsonResponder(c);

    applySchema(req, req.params, options.paramsSchema, "params");
    applySchema(req, req.query, options.querySchema, "query");
    applySchema(req, req.body, options.bodySchema, "body");

    const response = await handler({ c, req, res });

    if (response instanceof Response) {
      return response;
    }

    if (response === undefined) {
      return res.json(null);
    }

    if (typeof response === "string") {
      return new Response(response, { status: res.statusCode });
    }

    return c.json(response as any, res.statusCode as any);
  };
}

export function registerSecureEventRoutes(router) {
const eventBodySchema = eventWriteSchema;

const generatePasswordBodySchema = z.object({
  eventId: z.string().min(1),
});

const validInputOrigin = ['START'];
const validInputStatus = ['Inactive', 'Active', 'DidNotStart', 'Cancelled', 'LateStart'];

const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

const maxImageSizeBytes = 2 * 1024 * 1024;

function validateImageFile(file?: SecureFile) {
  if (!file) {
    throw new Error('No file uploaded');
  }

  if (!allowedImageTypes.has(file.mimetype)) {
    throw new Error('Invalid image type');
  }

  if (file.size > maxImageSizeBytes) {
    throw new Error('File too large');
  }
}

const getImageFormat = (file: SecureFile) => {
  switch (file.mimetype) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/jpeg':
    default:
      return 'jpeg';
  }
};

const getImageExtension = (format: "png" | "webp" | "jpeg") => {
  switch (format) {
    case 'png':
      return '.png';
    case 'webp':
      return '.webp';
    case 'jpeg':
    default:
      return '.jpg';
  }
};

const stateChangeBodySchema = z.object({
  origin: z.enum(validInputOrigin as [string, ...string[]]),
  status: z.enum(validInputStatus as [string, ...string[]]),
});

const createCompetitorBodySchema = createCompetitorSchema;
const updateCompetitorBodySchema = updateCompetitorSchema;

const externalCompetitorUpdateBodySchema = updateCompetitorBodySchema.extend({
  useExternalId: z.boolean(),
  classExternalId: z.string().max(191).optional().nullable(),
}).refine(
  value => !(value.classId && value.classExternalId),
  { message: 'Only one of classId or classExternalId should be provided, not both.', path: ['classId'] },
);

// Readable password generator for Node.js backend service
const generatePassword = (wordCount = 3) => {
  const wordList = [
    'forest',
    'map',
    'rock',
    'boulder',
    'tree',
    'north',
    'east',
    'west',
    'south',
    'start',
    'finish',
    'control',
    'medal',
    'compass',
    'gps',
    'blueberry',
    'hill',
    'knoll',
    'pit',
    'cliff',
    'saddle',
    'cave',
    'lake',
    'waterhole',
    'stream',
    'river',
    'ditch',
    'marsh',
    'spring',
    'clearing',
    'thicket',
    'road',
    'ride',
    'path',
    'fence',
    'canopy',
  ];

  // Ensure wordCount is a positive integer greater than 0
  if (!Number.isInteger(wordCount) || wordCount < 1) {
    throw new Error('wordCount must be a positive integer');
  }

  let password = '';
  for (let i = 0; i < wordCount; i++) {
    const randomIndex = Math.floor(Math.random() * wordList.length);
    password += wordList[randomIndex] + (i < wordCount - 1 ? '-' : '');
  }

  const randomNumber = Math.floor(Math.random() * 100);
  const symbols = '!@#$%^&*';
  const randomSymbol = symbols.charAt(Math.floor(Math.random() * symbols.length));

  return `${password}${randomNumber}${randomSymbol}`;
};

/**
 * @swagger
 * /rest/v1/events:
 *  post:
 *    summary: Create a new event
 *    description: This route creates a new event. The event data should be sent in the request body (typically in JSON format).
 *    tags:
 *      - Events
 *    security:
 *      - bearerAuth: []  # Require user login with Bearer token
 *    requestBody:
 *      required: true
 *      content:
 *        application/json:
 *          schema:
 *            type: object
 *            required:
 *              - name
 *              - date
 *              - timezone
 *              - organizer
 *              - location
 *              - zeroTime
 *              - sportId
 *              - countryCode
 *            properties:
 *              name:
 *                type: string
 *                description: The name of the event.
 *              date:
 *                type: string
 *                format: date-time
 *                description: The date and time of the event (ISO 8601 format).
 *              timezone:
 *                type: string
 *                description: "Time zone identifier based on the IANA database (e.g., 'Europe/Prague'). Used to correctly localize event times."
 *                example: "Europe/Prague"
 *              organizer:
 *                type: string
 *                description: The name of the event organizer.
 *              location:
 *                type: string
 *                description: The location where the event will take place.
 *              latitude:
 *                type: number
 *                format: float
 *                description: "Geographical latitude of the event location, ranging from -90 to 90 degrees."
 *                example: 50.0755
 *              longitude:
 *                type: number
 *                format: float
 *                description: "Geographical longitude of the event location, ranging from -180 to 180 degrees."
 *                example: 14.4378
 *              countryCode:
 *                type: string
 *                description: Optional 2-character country code. Must exist in the table of countries.
 *                minLength: 2
 *                maxLength: 2
 *                example: US
 *              zeroTime:
 *                type: string
 *                format: date-time
 *                description: The event's zero time (reference time point).
 *              published:
 *                type: boolean
 *                description: Whether the event is published or not.
 *              sportId:
 *                type: integer
 *                description: The ID of the sport associated with the event.
 *              ranking:
 *                type: boolean
 *                description: Optional boolean flag for ranking status.
 *                example: true
 *              coefRanking:
 *                type: number
 *                format: float
 *                description: Optional ranking coefficient (float number).
 *                example: 1.05
 *              startMode:
 *                type: string
 *                description: Optional start mode (e.g. Individual, Mass, etc.).
 *                example: Individual
 *              relay:
 *                type: boolean
 *                description: Whether the event is a relay event.
 *              hundredthPrecision:
 *                type: boolean
 *                description: "Indicates whether the event timing should be recorded with hundredth-of-a-second precision."
 *                example: true
 *    responses:
 *      200:
 *        description: Event created successfully
 *      401:
 *        description: Not authenticated (missing or invalid Bearer token)
 *      422:
 *        description: Validation Error
 *      500:
 *        description: Internal Server Error
 *    securitySchemes:
 *      bearerAuth:
 *        type: http
 *        scheme: bearer
 *        bearerFormat: JWT
 */
router.post(
  "/",
  routeWithValidation({ bodySchema: eventBodySchema }, async ({ req, res }) => {
  // Destructure the body object to create variables
  const {
    name,
    date,
    timezone,
    organizer,
    location,
    latitude,
    longitude,
    countryCode,
    zeroTime,
    ranking,
    coefRanking,
    startMode,
    hundredthPrecision,
    published,
    sportId,
    relay,
  } = req.body;

  const { userId } = req.jwtDecoded;

  //TODO: Check user permissions

  // Everything went fine.
  try {
    const dateTime = new Date(date);
    const insertedEventId = await prisma.event.create({
      data: {
        name,
        date: dateTime,
        timezone,
        organizer,
        location,
        latitude,
        longitude,
        countryId: countryCode,
        zeroTime: new Date(zeroTime),
        ranking,
        coefRanking,
        startMode,
        hundredthPrecision,
        published,
        sportId,
        relay,
        authorId: userId,
      },
    });
    return res.status(200).json(successResponse('OK', { data: insertedEventId }, res.statusCode));
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(422).json(validationResponse(error.message, res.statusCode));
    } else if (error instanceof AuthenticationError) {
      return res.status(401).json(errorResponse(error.message, res.statusCode));
    }
    return res.status(500).json(errorResponse('Internal Server Error', res.statusCode));
  }
  }),
);

/**
 * @swagger
 * /rest/v1/events/{eventId}/image:
 *  post:
 *    summary: Upload event featured image
 *    description: Upload an image and store its key on the event.
 *    tags:
 *      - Events
 *    security:
 *      - bearerAuth: []
 *    parameters:
 *      - in: path
 *        name: eventId
 *        required: true
 *        description: The ID of the event to update.
 *        schema:
 *          type: string
 *    requestBody:
 *      required: true
 *      content:
 *        multipart/form-data:
 *          schema:
 *            type: object
 *            required:
 *              - file
 *            properties:
 *              file:
 *                type: string
 *                format: binary
 *    responses:
 *      200:
 *        description: Image uploaded successfully
 *      401:
 *        description: Not authenticated
 *      403:
 *        description: Not authorized
 *      404:
 *        description: Event not found
 *      422:
 *        description: Validation Error
 *      500:
 *        description: Internal Server Error
 */
router.post("/:eventId/image", routeWithValidation(
  { paramsSchema: eventIdParamsSchema, bodyMode: "form" },
  async ({ req, res }) => {
    try {
      validateImageFile(req.file);
    } catch (error) {
      return res
        .status(422)
        .json(validationResponse(error instanceof Error ? error.message : "Validation error", res.statusCode));
    }

    const { eventId } = req.params;
    const uploadedFile = req.file as SecureFile;

    try {
      await requireEventOwner(prisma, req.auth, eventId);

      const format = getImageFormat(uploadedFile);
      const prefix = `events/${eventId}/featured-`;

      const existingEvent = await prisma.event.findUnique({
        where: { id: eventId },
        select: { featuredImageKey: true },
      });

      const ext = getImageExtension(format);
      const key = `${prefix}${Date.now()}${ext}`;

      const baseImage = sharp(uploadedFile.buffer)
        .rotate()
        .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true });

      const resizedBuffer =
        format === 'png'
          ? await baseImage.png({ compressionLevel: 9 }).toBuffer()
          : await baseImage.toFormat(format, { quality: 80 }).toBuffer();

      const contentType = `image/${format === 'jpeg' ? 'jpeg' : format}`;

      await putPublicObject({
        key,
        body: resizedBuffer,
        contentType,
      });

      await prisma.event.update({
        where: { id: eventId },
        data: { featuredImageKey: key, updatedAt: new Date() },
      });

      if (existingEvent?.featuredImageKey && existingEvent.featuredImageKey !== key) {
        await deletePublicObject(existingEvent.featuredImageKey);
      }

      return res.status(200).json(successResponse('OK', { featuredImageKey: key }, res.statusCode));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal Server Error';
      if (message === 'Event not found') {
        return res.status(404).json(errorResponse(message, res.statusCode));
      }
      if (message.startsWith('Unauthorized') || message === 'Not authorized for this event') {
        return res.status(403).json(errorResponse(message, res.statusCode));
      }
      return res.status(500).json(errorResponse(message, res.statusCode));
    }
  },
));

/**
 * @swagger
 * /rest/v1/events/{eventId}:
 *  put:
 *    summary: Edit an existing event
 *    description: This route updates an existing event. The event ID is passed in the URL, and the updated event data should be sent in the request body (typically in JSON format).
 *    tags:
 *      - Events
 *    security:
 *      - bearerAuth: []  # Require user login with Bearer token
 *    parameters:
 *      - in: path
 *        name: eventId
 *        required: true
 *        description: The ID of the event to update.
 *        schema:
 *          type: integer
 *    requestBody:
 *      required: true
 *      content:
 *        application/json:
 *          schema:
 *            type: object
 *            required:
 *              - name
 *              - date
 *              - timezone
 *              - organizer
 *              - location
 *              - zeroTime
 *              - sportId
 *            properties:
 *              name:
 *                type: string
 *                description: The name of the event.
 *              date:
 *                type: string
 *                format: date-time
 *                description: The date and time of the event (ISO 8601 format).
 *              timezone:
 *                type: string
 *                description: "Time zone identifier based on the IANA database (e.g., 'Europe/Prague'). Used to correctly localize event times."
 *                example: "Europe/Prague"
 *              organizer:
 *                type: string
 *                description: The name of the event organizer.
 *              location:
 *                type: string
 *                description: The location where the event will take place.
 *              latitude:
 *                type: number
 *                format: float
 *                description: "Geographical latitude of the event location, ranging from -90 to 90 degrees."
 *                example: 50.0755
 *              longitude:
 *                type: number
 *                format: float
 *                description: "Geographical longitude of the event location, ranging from -180 to 180 degrees."
 *                example: 14.4378
 *              country:
 *                type: string
 *                description: Optional 2-character country code. Must exist in the table of countries.
 *                minLength: 2
 *                maxLength: 2
 *                example: US
 *              zeroTime:
 *                type: string
 *                format: date-time
 *                description: The event's zero time (reference time point).
 *              published:
 *                type: boolean
 *                description: Whether the event is published or not.
 *              sportId:
 *                type: integer
 *                description: The ID of the sport associated with the event.
 *              ranking:
 *                type: boolean
 *                description: Optional boolean flag for ranking status.
 *                example: true
 *              coefRanking:
 *                type: number
 *                format: float
 *                description: Optional ranking coefficient (float number).
 *                example: 1.05
 *              startMode:
 *                type: string
 *                description: Optional start mode (e.g. Individual, Mass, etc.).
 *                example: Individual
 *              relay:
 *                type: boolean
 *                description: Whether the event is a relay event.
 *              hundredthPrecision:
 *                type: boolean
 *                description: "Indicates whether the event timing should be recorded with hundredth-of-a-second precision."
 *                example: true
 *    responses:
 *      200:
 *        description: Event updated successfully
 *      401:
 *        description: Not authenticated (missing or invalid Bearer token)
 *      422:
 *        description: Validation Error
 *      404:
 *        description: Event not found
 *      500:
 *        description: Internal Server Error
 *    securitySchemes:
 *      bearerAuth:
 *        type: http
 *        scheme: bearer
 *        bearerFormat: JWT
 */
router.put(
  "/:eventId",
  routeWithValidation(
    { paramsSchema: eventIdParamsSchema, bodySchema: eventBodySchema },
    async ({ req, res }) => {
  const { eventId } = req.params;
  const {
    name,
    date,
    organizer,
    location,
    latitude,
    longitude,
    country,
    zeroTime,
    ranking,
    coefRanking,
    startMode,
    published,
    sportId,
    relay,
  } = req.body;

  const ownership = await authorizeOwnedEvent(req, res, eventId, {
    eventNotFoundMessage: 'Event not found',
    forbiddenMessage: 'Not authorized',
  });

  if (!ownership.ok) {
    return ownership.response;
  }

  const { userId } = ownership;

  try {
    // TODO: Add permission checks to ensure the user is allowed to edit the event

    // 🔥 Normalize latitude and longitude
    const dbLatitude =
      latitude === '' || latitude === null || Number(latitude) === 0 ? null : Number(latitude);
    const dbLongitude =
      longitude === '' || longitude === null || Number(longitude) === 0 ? null : Number(longitude);

    const updatedEvent = await prisma.event.update({
      where: { id: eventId },
      data: {
        name,
        date: new Date(date),
        organizer,
        location,
        latitude: dbLatitude,
        longitude: dbLongitude,
        countryId: country,
        zeroTime: new Date(zeroTime),
        ranking,
        coefRanking,
        startMode,
        published,
        sportId,
        relay,
        authorId: userId,
      },
    });

    return res.status(200).json(successResponse('OK', { data: updatedEvent }, res.statusCode));
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(422).json(validationResponse(error.message, res.statusCode));
    } else if (error instanceof AuthenticationError) {
      return res.status(401).json(errorResponse(error.message, res.statusCode));
    }
    return res.status(500).json(errorResponse('Internal Server Error', res.statusCode));
  }
    },
  ),
);

/**
 * @swagger
 * /rest/v1/events/{eventId}:
 *  delete:
 *    summary: Delete an event
 *    description: Deletes the event specified by the event ID.
 *    tags:
 *       - Events
 *    security:
 *       - bearerAuth: []  # Require user login with Bearer token
 *    parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         description: The ID of the event to delete.
 *         schema:
 *           type: string
 *    responses:
 *        200:
 *          description: Event successfully deleted
 *        401:
 *          description: Not authenticated
 *        403:
 *          description: Forbidden - Not enough permissions
 *        404:
 *          description: Event not found
 *        422:
 *          description: Validation Error
 *        500:
 *          description: Internal Server Error
 *    securitySchemes:
 *      bearerAuth:
 *        type: http
 *        scheme: bearer
 *        bearerFormat: JWT
 */
router.delete("/:eventId", routeWithValidation({ paramsSchema: eventIdParamsSchema }, async ({ req, res }) => {
  const { eventId } = req.params;

  // TODO: Add permission check to ensure the user can delete this event

  try {
    const ownership = await authorizeOwnedEvent(req, res, eventId, {
      select: { featuredImageKey: true },
      eventNotFoundStatus: 403,
      eventNotFoundMessage: 'Event not found',
      forbiddenStatus: 403,
      forbiddenMessage: 'Event not found',
    });

    if (!ownership.ok) {
      return ownership.response;
    }

    await deleteAllEventData(eventId);

    await deletePublicObjectsByPrefix(`events/${eventId}/`);

    await prisma.event.delete({
      where: { id: eventId },
    });

    return res.status(200).json(successResponse('Event successfully deleted', {}, res.statusCode));
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(422).json(validationResponse(error.message, res.statusCode));
    } else if (error instanceof AuthenticationError) {
      return res.status(401).json(errorResponse(error.message, res.statusCode));
    }
    return res.status(500).json(errorResponse('Internal Server Error', res.statusCode));
  }
}));

/**
 * @swagger
 * /rest/v1/events/generate-password:
 *  post:
 *    summary: Set or create an event password
 *    description: Creates and stores an event password for an event.
 *    tags:
 *       - Events
 *    security:
 *       - bearerAuth: []  # Require user login with Bearer token
 *    parameters:
 *       - in: body
 *         name: eventId
 *         required: true
 *         description: The ID of the event for which to create the password.
 *         schema:
 *           type: string
 *    responses:
 *        200:
 *          description: Event password successfully stored
 *        401:
 *          description: Not authenticated
 *        403:
 *          description: Forbidden - Not enough permissions
 *        404:
 *          description: Event not found
 *        500:
 *          description: Internal Server Error
 */

router.post(
  "/generate-password",
  routeWithValidation({ bodySchema: generatePasswordBodySchema }, async ({ req, res }) => {
  const { eventId } = req.body;

  const eventPassword = generatePassword(3);

  // Encrypt the password and passphrase
  const encryptedPassword =
    typeof eventPassword !== 'undefined' ? encodeBase64(encrypt(eventPassword)) : undefined;

  const ownership = await authorizeOwnedEvent(req, res, eventId, {
    eventNotFoundStatus: 403,
    eventNotFoundMessage: 'Event not found or you don`t have a permissions',
    forbiddenStatus: 403,
    forbiddenMessage: 'Event not found or you don`t have a permissions',
  });

  if (!ownership.ok) {
    return ownership.response;
  }

  try {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

    await prisma.eventPassword.upsert({
      where: { eventId }, // eventId must be unique in your schema
      update: {
        password: encryptedPassword, // Update the encrypted password
        expiresAt, // Update the expiration
        updatedAt: new Date(), // Automatically updated
      },
      create: {
        event: { connect: { id: eventId } }, // Connect the existing event by its ID
        password: encryptedPassword, // Store the encrypted password
        expiresAt, // Set the expiration time
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return res
      .status(200)
      .json(
        successResponse(
          'OK',
          { data: { password: eventPassword, expiresAt: expiresAt } },
          res.statusCode
        )
      );
  } catch (error) {
    console.error(error);
    return res.status(500).json(errorResponse('Internal Server Error', res.statusCode));
  }
  }),
);

/**
 * @swagger
 * /rest/v1/events/revoke-password:
 *  post:
 *    summary: Delete an event password
 *    description: Revoke access to the event via event password.
 *    tags:
 *       - Events
 *    security:
 *       - bearerAuth: []  # Require user login with Bearer token
 *    parameters:
 *       - in: body
 *         name: eventId
 *         required: true
 *         description: The ID of the event for which to create the password.
 *         schema:
 *           type: string
 *    responses:
 *        200:
 *          description: Event password successfully revoked
 *        401:
 *          description: Not authenticated
 *        403:
 *          description: Forbidden - Not enough permissions
 *        404:
 *          description: Event not found
 *        500:
 *          description: Internal Server Error
 */

router.post(
  "/revoke-password",
  routeWithValidation({ bodySchema: generatePasswordBodySchema }, async ({ req, res }) => {
  const { eventId } = req.body;

  const ownership = await authorizeOwnedEvent(req, res, eventId, {
    eventNotFoundStatus: 404,
    eventNotFoundMessage: 'Event not found or you don`t have a permissions',
    forbiddenStatus: 404,
    forbiddenMessage: 'Event not found or you don`t have a permissions',
  });

  if (!ownership.ok) {
    return ownership.response;
  }

  try {
    const deletedEventPassword = await prisma.eventPassword.delete({
      where: { eventId }, // eventId must be unique in your schema
    });

    return res
      .status(200)
      .json(successResponse('OK', { data: { ...deletedEventPassword } }, res.statusCode));
  } catch (error) {
    console.error(error);
    return res.status(500).json(errorResponse('Internal Server Error', res.statusCode));
  }
  }),
);

/**
 * @swagger
 * /rest/v1/events/{eventId}/password:
 *  get:
 *    summary: Get the event password
 *    description: Retrieve the stored password for an event.
 *    tags:
 *       - Events
 *    security:
 *       - bearerAuth: []  # Require user login with Bearer token
 *    parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         description: The ID of the event for which to retrieve the password.
 *         schema:
 *           type: string
 *    responses:
 *        200:
 *          description: Event password retrieved
 *        401:
 *          description: Not authenticated
 *        403:
 *          description: Forbidden - Not enough permissions
 *        404:
 *          description: Event not found
 *        500:
 *          description: Internal Server Error
 */
router.get(
  "/:eventId/password",
  routeWithValidation({ paramsSchema: eventIdParamsSchema }, async ({ req, res }) => {
  const { eventId } = req.params;

  const ownership = await authorizeOwnedEvent(req, res, eventId, {
    eventNotFoundMessage: 'Event not found',
    forbiddenMessage: 'Not authorized',
  });

  if (!ownership.ok) {
    return ownership.response;
  }

  try {
    const eventPassword = await getDecryptedEventPassword(eventId);

    // Check if eventPassword exists, if not, return an empty data object
    const responseData = eventPassword
      ? {
          password: eventPassword.password,
          expiresAt: eventPassword.expiresAt,
        }
      : {}; // Empty object if eventPassword is null or undefined
    return res.status(200).json(
      successResponse(
        'OK',
        {
          data: responseData,
        },
        res.statusCode
      )
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(422).json(validationResponse(error.message, res.statusCode));
    } else if (error instanceof AuthenticationError) {
      return res.status(401).json(errorResponse(error.message, res.statusCode));
    }
    return res.status(500).json(errorResponse('Internal Server Error', res.statusCode));
  }
  }),
);

/**
 * @swagger
 * /rest/v1/events/{eventId}/competitors/{competitorId}/status-change:
 *  post:
 *    summary: Update competitor status
 *    description: Change competitor status. For example from the start procecudere set status Active or DidNotStart
 *    tags:
 *       - Events
 *    parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         description: String ID of the event to retrieve.
 *         schema:
 *           type: string
 *       - in: path
 *         name: competitorId
 *         required: true
 *         description: ID of the competitor whose status you want to change.
 *         schema:
 *           type: integer
 *       - in: body
 *         name: origin
 *         required: true
 *         description: Origin point from the change comes (e.g. START).
 *         schema:
 *           type: string
 *       - in: body
 *         name: status
 *         required: true
 *         description: New compoetitor status (e.g. Inactive, Active, DidNotStart,  LateStart or Cancelled).
 *         schema:
 *           type: string
 *    responses:
 *        200:
 *          description: Return successful message
 *        401:
 *          description: Not authenticated
 *        422:
 *          description: Validation Error
 *        500:
 *          description: Internal Server Error
 */
router.post(
  "/:eventId/competitors/:competitorId/status-change",
  routeWithValidation(
    {
      paramsSchema: eventCompetitorParamsSchema,
      bodySchema: stateChangeBodySchema,
    },
    async ({ req, res }) => {
    const errors = getValidationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json(validationResponse(formatErrors(errors)));
    }
    const { eventId, competitorId } = req.params;
    const { status, origin } = req.body;
    const { userId } = req.jwtDecoded;

    const ownership = await authorizeOwnedEvent(req, res, eventId, {
      forbiddenMessage: 'Not authorized',
    });

    if (!ownership.ok) {
      return ownership.response;
    }

    // Everything went fine.
    try {
      const statusChangeMessage = await changeCompetitorStatus(
        eventId,
        parseInt(competitorId),
        origin,
        status,
        userId
      );
      return res
        .status(200)
        .json(successResponse('OK', { data: statusChangeMessage }, res.statusCode));
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(422).json(validationResponse(error.message, res.statusCode));
      } else if (error instanceof AuthenticationError) {
        return res.status(401).json(errorResponse(error.message, res.statusCode));
      }
      return res.status(500).json(errorResponse('Internal Server Error', res.statusCode));
    }
    }
  )
);

/**
 * @swagger
 * /rest/v1/events/{eventId}/competitors:
 *  post:
 *    summary: Store a new competitor
 *    description: Add a new competitor to an event's class
 *    tags:
 *       - Events
 *    parameters:
 *      - in: path
 *        name: eventId
 *        required: true
 *        description: String ID of the event.
 *        schema:
 *          type: string
 *    requestBody:
 *      required: true
 *      content:
 *        application/json:
 *          schema:
 *            type: object
 *            required:
 *              - classId
 *              - origin
 *              - firstname
 *              - lastname
 *            oneOf:
 *              - required: [classId]
 *              - required: [classExternalId]
 *            properties:
 *              classId:
 *                type: integer
 *                description: ID of the competitor's class.
 *                example: 5
 *              classExternalId:
 *                type: string
 *                maxLength: 191
 *                description: External identifier of the competitor's class (from import or external system).
 *                example: "182725"
 *              origin:
 *                type: string
 *                description: Origin of the request (e.g., START).
 *                enum: ["START", "FINISH", "IT", "OFFICE"]
 *                example: "START"
 *              firstname:
 *                type: string
 *                description: First name of the competitor.
 *                maxLength: 255
 *                example: "Martin"
 *              lastname:
 *                type: string
 *                description: Last name of the competitor.
 *                maxLength: 255
 *                example: "Krivda"
 *              bibNumber:
 *                type: integer
 *                description: The competitor's bib number.
 *                example: 123
 *              nationality:
 *                type: string
 *                description: 3-letter country code of nationality.
 *                maxLength: 3
 *                example: "CZE"
 *              registration:
 *                type: string
 *                description: Registration number of the competitor.
 *                maxLength: 10
 *                example: "MKR2024"
 *              license:
 *                type: string
 *                description: License type (single character).
 *                maxLength: 1
 *                example: "A"
 *              ranking:
 *                type: integer
 *                description: Ranking position.
 *                example: 7563
 *              rankPointsAvg:
 *                type: integer
 *                description: Average ranking points.
 *                example: 8500
 *              organisation:
 *                type: string
 *                description: Organisation name.
 *                maxLength: 255
 *                example: "K.O.B. Choceň"
 *              shortName:
 *                type: string
 *                description: Short name of the competitor.
 *                maxLength: 10
 *                example: "CHC"
 *              card:
 *                type: integer
 *                description: SI card number.
 *                example: 123456
 *              startTime:
 *                type: string
 *                format: date-time
 *                description: Start time in ISO 8601 format.
 *                example: "2025-04-10T08:30:00Z"
 *              finishTime:
 *                type: string
 *                format: date-time
 *                description: Finish time in ISO 8601 format.
 *                example: null
 *              time:
 *                type: integer
 *                description: Time taken in seconds.
 *                example: null
 *              teamId:
 *                type: integer
 *                description: ID of the competitor's team.
 *                example: null
 *              leg:
 *                type: integer
 *                description: Leg number in relay.
 *                example: null
 *              status:
 *                type: string
 *                description: Status of the competitor.
 *                enum:
 *                  - Inactive
 *                  - Active
 *                  - DidNotStart
 *                  - Finished
 *                  - OK
 *                  - MissingPunch
 *                  - Disqualified
 *                  - DidNotFinish
 *                  - OverTime
 *                  - SportingWithdrawal
 *                  - NotCompeting
 *                  - Moved
 *                  - MovedUp
 *                  - DidNotEnter
 *                  - Cancelled
 *                example: "Inactive"
 *              lateStart:
 *                type: boolean
 *                description: Whether the competitor had a late start.
 *                example: false
 *              note:
 *                type: string
 *                description: Additional notes about the competitor.
 *                maxLength: 255
 *                example: "Elite runner"
 *              externalId:
 *                type: string
 *                description: ID of the main source system.
 *                maxLength: 191
 *                example: "27"
 *              splits:
 *                type: array
 *                description: List of split times (controls visited by the competitor).
 *                items:
 *                  type: object
 *                  properties:
 *                    controlCode:
 *                      type: integer
 *                      description: Code of the control point.
 *                      example: 31
 *                    time:
 *                      type: integer
 *                      nullable: true
 *                      description: Time (in seconds or milliseconds) the competitor reached the control. Can be null if unknown.
 *                      example: 125
 *    responses:
 *        200:
 *          description: Successfully stored a new competitor.
 *        401:
 *          description: Not authenticated.
 *        403:
 *          description: User not authorized to add a competitor to this event.
 *        422:
 *          description: Validation Error.
 *        500:
 *          description: Internal Server Error.
 */
router.post(
  "/:eventId/competitors",
  routeWithValidation(
    {
      paramsSchema: eventIdParamsSchema,
      bodySchema: createCompetitorBodySchema,
    },
    async ({ req, res }) => {
    const errors = getValidationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json(validationResponse(errors.array()));
    }

    const { eventId } = req.params;
    const { userId } = req.jwtDecoded;
    const { origin, classExternalId } = req.body;

    const ownership = await authorizeOwnedEvent(req, res, eventId, {
      eventNotFoundStatus: 404,
      eventNotFoundMessage: 'Event not found',
      forbiddenStatus: 403,
      forbiddenMessage: 'Not authorized to add a competitor',
    });

    if (!ownership.ok) {
      return ownership.response;
    }

    try {
      if (classExternalId) {
        try {
          const dbClassResponse = await prisma.class.findFirst({
            where: {
              eventId: eventId,
              externalId: classExternalId,
            },
            select: {
              id: true,
            },
          });

          if (!dbClassResponse) {
            return res.status(404).json(errorResponse('Class not found', res.statusCode));
          }
          req.body.classId = dbClassResponse.id;
        } catch (error) {
          console.error(error);
          return res.status(500).json(errorResponse('Internal Server Error', res.statusCode));
        }
      }

      const competitorData = req.body;

      // Store competitor
      const storeCompetitorMessage = await storeCompetitor(eventId, competitorData, userId, origin);

      return res.status(200).json(successResponse('OK', { data: storeCompetitorMessage }, 200));
    } catch (error) {
      console.error(error);

      if (error instanceof ValidationError) {
        return res.status(422).json(validationResponse(error.message, 422));
      } else if (error instanceof AuthenticationError) {
        return res.status(401).json(errorResponse(error.message, 401));
      } else if (error instanceof DatabaseError) {
        return res.status(500).json(errorResponse(error.message, 500));
      }

      return res.status(500).json(errorResponse('Internal Server Error', 500));
    }
    }
  )
);

/**
 * Handles the validation and update of a competitor's information.
 *
 * @param {Object} routeContext - Route context object.
 * @param {Object} routeContext.req - Parsed request payloads.
 * @param {Object} routeContext.res - JSON responder bound to Hono context.
 * @param {string} competitorId - The ID of the competitor to be updated.
 * @returns {Promise<void>} - A promise that resolves when the operation is complete.
 */
const handleValidateAndUpdateCompetitor = async (
  routeContext: { req: EventRouteRequest; res: RouteJsonResponder },
  competitorId: number | string,
) => {
  const { req, res } = routeContext;
  const { eventId } = req.params;
  const { origin } = req.body;
  const ownership = await authorizeOwnedEvent(req, res, eventId, {
    forbiddenMessage: 'Not authorized',
  });

  if (!ownership.ok) {
    return ownership.response;
  }

  const { userId } = ownership;

  // Everything went fine.
  try {
    // Build update object conditionally
    const fieldTypes = {
      classId: 'number',
      firstname: 'string',
      lastname: 'string',
      nationality: 'string',
      registration: 'string',
      license: 'string',
      organisation: 'string',
      shortName: 'string',
      card: 'number',
      bibNumber: 'number',
      startTime: 'date',
      finishTime: 'date',
      time: 'number',
      status: 'string',
      lateStart: 'boolean',
      teamId: 'number',
      leg: 'number',
      note: 'string',
      externalId: 'string',
      splits: 'array',
    };

    const updateData = Object.keys(req.body).reduce((acc, field) => {
      if (req.body[field] !== undefined && fieldTypes[field]) {
        switch (fieldTypes[field]) {
          case 'number':
            acc[field] = parseInt(req.body[field], 10);
            break;
          case 'boolean':
            acc[field] = Boolean(req.body[field]);
            break;
          case 'date':
            acc[field] = new Date(req.body[field]);
            break;
          case 'array':
            acc[field] = Array.isArray(req.body[field]) ? req.body[field] : [req.body[field]];
            break;
          default:
            acc[field] = req.body[field];
        }
      }
      return acc;
    }, {});

    const updateCompetitorMessage = await updateCompetitor(
      eventId,
      competitorId,
      origin,
      updateData,
      userId
    );
    return res
      .status(200)
      .json(successResponse('OK', { data: updateCompetitorMessage }, res.statusCode));
  } catch (error) {
    console.error(error);
    if (error instanceof ValidationError) {
      return res.status(422).json(validationResponse(error.message, res.statusCode));
    } else if (error instanceof AuthenticationError) {
      return res.status(401).json(errorResponse(error.message, res.statusCode));
    } else if (error instanceof DatabaseError) {
      return res.status(500).json(errorResponse(error.message, res.statusCode));
    }
    return res.status(500).json(errorResponse('Internal Server Error', res.statusCode));
  }
};

/**
 * @swagger
 * /rest/v1/events/{eventId}/competitors/{competitorId}:
 *  put:
 *    summary: Update competitor's data
 *    description: Change competitor's data by internal id
 *    tags:
 *       - Events
 *    parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         description: String ID of the event to retrieve.
 *         schema:
 *           type: string
 *       - in: path
 *         name: competitorId
 *         required: true
 *         description: ID of the competitor whose data you want to change.
 *         schema:
 *           type: integer
 *    requestBody:
 *      required: true
 *      content:
 *        application/json:
 *          schema:
 *            type: object
 *            required:
 *              - origin
 *            properties:
 *              classId:
 *                type: integer
 *                description: ID of the competitor's class.
 *                example: 5
 *              origin:
 *                type: string
 *                description: Origin of the request (e.g., START).
 *                enum: ["START", "FINISH", "IT", "OFFICE"]
 *                example: "START"
 *              firstname:
 *                type: string
 *                description: First name of the competitor.
 *                maxLength: 255
 *                example: "Martin"
 *              lastname:
 *                type: string
 *                description: Last name of the competitor.
 *                maxLength: 255
 *                example: "Krivda"
 *              bibNumber:
 *                type: integer
 *                description: The competitor's bib number.
 *                example: 123
 *              nationality:
 *                type: string
 *                description: 3-letter country code of nationality.
 *                maxLength: 3
 *                example: "CZE"
 *              registration:
 *                type: string
 *                description: Registration number of the competitor.
 *                maxLength: 10
 *                example: "MKR2024"
 *              license:
 *                type: string
 *                description: License type (single character).
 *                maxLength: 1
 *                example: "A"
 *              ranking:
 *                type: integer
 *                description: Ranking position.
 *                example: 7563
 *              rankPointsAvg:
 *                type: integer
 *                description: Average ranking points.
 *                example: 8500
 *              organisation:
 *                type: string
 *                description: Organisation name.
 *                maxLength: 255
 *                example: "K.O.B. Choceň"
 *              shortName:
 *                type: string
 *                description: Short name of the competitor.
 *                maxLength: 10
 *                example: "CHC"
 *              card:
 *                type: integer
 *                description: SI card number.
 *                example: 123456
 *              startTime:
 *                type: string
 *                format: date-time
 *                description: Start time in ISO 8601 format.
 *                example: "2025-04-10T08:30:00Z"
 *              finishTime:
 *                type: string
 *                format: date-time
 *                description: Finish time in ISO 8601 format.
 *                example: null
 *              time:
 *                type: integer
 *                description: Time taken in seconds.
 *                example: null
 *              teamId:
 *                type: integer
 *                description: ID of the competitor's team.
 *                example: null
 *              leg:
 *                type: integer
 *                description: Leg number in relay.
 *                example: null
 *              status:
 *                type: string
 *                description: Status of the competitor.
 *                enum:
 *                  - Inactive
 *                  - Active
 *                  - DidNotStart
 *                  - Finished
 *                  - OK
 *                  - MissingPunch
 *                  - Disqualified
 *                  - DidNotFinish
 *                  - OverTime
 *                  - SportingWithdrawal
 *                  - NotCompeting
 *                  - Moved
 *                  - MovedUp
 *                  - DidNotEnter
 *                  - Cancelled
 *                example: "Active"
 *              lateStart:
 *                type: boolean
 *                description: Whether the competitor had a late start.
 *                example: false
 *              note:
 *                type: string
 *                description: Additional notes about the competitor.
 *                maxLength: 255
 *                example: "Elite runner"
 *              externalId:
 *                type: string
 *                description: ID of the main source system.
 *                maxLength: 191
 *                example: "27"
 *              splits:
 *                type: array
 *                description: List of split times (controls visited by the competitor).
 *                items:
 *                  type: object
 *                  properties:
 *                    controlCode:
 *                      type: integer
 *                      description: Code of the control point.
 *                      example: 31
 *                    time:
 *                      type: integer
 *                      nullable: true
 *                      description: Time (in seconds or milliseconds) the competitor reached the control. Can be null if unknown.
 *                      example: 125
 *    responses:
 *        200:
 *          description: Return successful message
 *        401:
 *          description: Not authenticated
 *        422:
 *          description: Validation Error
 *        500:
 *          description: Internal Server Error
 */
router.put(
  "/:eventId/competitors/:competitorId",
  routeWithValidation(
    {
      paramsSchema: eventCompetitorParamsSchema,
      bodySchema: updateCompetitorBodySchema,
    },
    async ({ req, res }) => {
    const errors = getValidationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json(validationResponse(formatErrors(errors)));
    }
    const { competitorId } = req.params;
    return handleValidateAndUpdateCompetitor({ req, res }, competitorId);
    }
  )
);

/**
 * @swagger
 * /rest/v1/events/{eventId}/competitors/{competitorExternalId}/external-id:
 *  put:
 *    summary: Update competitor's data using external id
 *    description: Change competitor data by the external ID (for cases that you don't know the competitor's ID in OrienteerFeed).
 *    tags:
 *       - Events
 *    parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         description: String ID of the event to retrieve.
 *         schema:
 *           type: string
 *       - in: path
 *         name: competitorExternalId
 *         required: true
 *         description: External ID of the competitor whose data you want to change.
 *         schema:
 *           type: string
 *    requestBody:
 *      required: true
 *      content:
 *        application/json:
 *          schema:
 *            type: object
 *            required:
 *              - origin
 *              - useExternalId
 *            properties:
 *              useExternalId:
 *                type: boolean
 *                description: Explicitly declare that the ExternalId column should be used as the competitor identifier.
 *                example: true
 *              classId:
 *                type: integer
 *                description: ID of the competitor's class.
 *                example: 5
 *              classExternalId:
 *                type: string
 *                description: ID of the competitor's class in external system.
 *                example: "182725"
 *              origin:
 *                type: string
 *                description: Origin of the request (e.g., START).
 *                enum: ["START", "FINISH", "IT", "OFFICE"]
 *                example: "START"
 *              firstname:
 *                type: string
 *                description: First name of the competitor.
 *                maxLength: 255
 *                example: "Martin"
 *              lastname:
 *                type: string
 *                description: Last name of the competitor.
 *                maxLength: 255
 *                example: "Krivda"
 *              bibNumber:
 *                type: integer
 *                description: The competitor's bib number.
 *                example: 123
 *              nationality:
 *                type: string
 *                description: 3-letter country code of nationality.
 *                maxLength: 3
 *                example: "CZE"
 *              registration:
 *                type: string
 *                description: Registration number of the competitor.
 *                maxLength: 10
 *                example: "MKR2024"
 *              license:
 *                type: string
 *                description: License type (single character).
 *                maxLength: 1
 *                example: "A"
 *              ranking:
 *                type: integer
 *                description: Ranking position.
 *                example: 7563
 *              rankPointsAvg:
 *                type: integer
 *                description: Average ranking points.
 *                example: 8500
 *              organisation:
 *                type: string
 *                description: Organisation name.
 *                maxLength: 255
 *                example: "K.O.B. Choceň"
 *              shortName:
 *                type: string
 *                description: Short name of the competitor.
 *                maxLength: 10
 *                example: "CHC"
 *              card:
 *                type: integer
 *                description: SI card number.
 *                example: 123456
 *              startTime:
 *                type: string
 *                format: date-time
 *                description: Start time in ISO 8601 format.
 *                example: "2025-04-10T08:30:00Z"
 *              finishTime:
 *                type: string
 *                format: date-time
 *                description: Finish time in ISO 8601 format.
 *                example: null
 *              time:
 *                type: integer
 *                description: Time taken in seconds.
 *                example: null
 *              teamId:
 *                type: integer
 *                description: ID of the competitor's team.
 *                example: null
 *              leg:
 *                type: integer
 *                description: Leg number in relay.
 *                example: null
 *              status:
 *                type: string
 *                description: Status of the competitor.
 *                enum:
 *                  - Inactive
 *                  - Active
 *                  - DidNotStart
 *                  - Finished
 *                  - OK
 *                  - MissingPunch
 *                  - Disqualified
 *                  - DidNotFinish
 *                  - OverTime
 *                  - SportingWithdrawal
 *                  - NotCompeting
 *                  - Moved
 *                  - MovedUp
 *                  - DidNotEnter
 *                  - Cancelled
 *                example: "Active"
 *              lateStart:
 *                type: boolean
 *                description: Whether the competitor had a late start.
 *                example: false
 *              note:
 *                type: string
 *                description: Additional notes about the competitor.
 *                maxLength: 255
 *                example: "Elite runner"
 *              externalId:
 *                type: string
 *                description: ID of the main source system.
 *                maxLength: 191
 *                example: "27"
 *              splits:
 *                type: array
 *                description: List of split times (controls visited by the competitor).
 *                items:
 *                  type: object
 *                  properties:
 *                    controlCode:
 *                      type: integer
 *                      description: Code of the control point.
 *                      example: 31
 *                    time:
 *                      type: integer
 *                      nullable: true
 *                      description: Time (in seconds or milliseconds) the competitor reached the control. Can be null if unknown.
 *                      example: 125
 *    responses:
 *        200:
 *          description: Return successful message
 *        401:
 *          description: Not authenticated
 *        422:
 *          description: Validation Error
 *        500:
 *          description: Internal Server Error
 */
router.put(
  "/:eventId/competitors/:competitorExternalId/external-id",
  routeWithValidation(
    {
      paramsSchema: eventCompetitorExternalParamsSchema,
      bodySchema: externalCompetitorUpdateBodySchema,
    },
    async ({ req, res }) => {
    const errors = getValidationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json(validationResponse(formatErrors(errors)));
    }
    const { eventId, competitorExternalId } = req.params;
    const { useExternalId, classExternalId } = req.body;

    if (!useExternalId) {
      return res
        .status(422)
        .json(errorResponse('The useExternalId parameter must be set to true', res.statusCode));
    }

    let dbCompetitorResponse;
    try {
      dbCompetitorResponse = await prisma.competitor.findFirst({
        where: {
          class: { eventId: eventId },
          externalId: competitorExternalId,
        },
        select: {
          id: true,
        },
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json(errorResponse('Internal Server Error', res.statusCode));
    }

    if (!dbCompetitorResponse) {
      return res.status(404).json(errorResponse('Competitor not found', res.statusCode));
    }

    if (classExternalId) {
      try {
        const dbClassResponse = await prisma.class.findFirst({
          where: {
            eventId: eventId,
            externalId: classExternalId,
          },
          select: {
            id: true,
          },
        });

        if (!dbClassResponse) {
          return res.status(404).json(errorResponse('Class not found', res.statusCode));
        }
        req.body.classId = dbClassResponse.id;
      } catch (error) {
        console.error(error);
        return res.status(500).json(errorResponse('Internal Server Error', res.statusCode));
      }
    }
    return handleValidateAndUpdateCompetitor({ req, res }, dbCompetitorResponse.id);
    }
  )
);

/**
 * @swagger
 * /rest/v1/events/{eventId}/changelog:
 *  get:
 *    summary: Get changelog for the event
 *    description: Get protocol of all changes in competitor's data
 *    tags:
 *       - Events
 *    parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         description: String ID of the event to retrieve the protocol.
 *         schema:
 *           type: string
 *       - in: query
 *         name: since
 *         required: false
 *         description: Return only changes created after this ISO 8601 datetime (UTC).
 *         schema:
 *           type: string
 *           format: date-time
 *           example: "2025-03-10T00:00:00Z"
 *       - in: query
 *         name: origin
 *         required: false
 *         description: Filter changes by origin (e.g. START, FINISH, IT, OFFICE).
 *         schema:
 *           type: string
 *           enum: ["START", "FINISH", "IT", "OFFICE"]
 *           example: "START"
 *       - in: query
 *         name: classId
 *         required: false
 *         description: Filter changes by classId.
 *         schema:
 *           type: integer
 *           example: 5
 *       - in: query
 *         name: group
 *         required: false
 *         description: Group changes by competitor (aggregating fields per competitorId).
 *         schema:
 *           type: boolean
 *           example: true
 *    responses:
 *        200:
 *          description: Return successful message
 *        401:
 *          description: Not authenticated
 *        422:
 *          description: Validation Error
 *        500:
 *          description: Internal Server Error
 */
router.get(
  "/:eventId/changelog",
  routeWithValidation(
    {
      paramsSchema: eventIdParamsSchema,
      querySchema: changelogQuerySchema,
    },
    async ({ req, res }) => {
    const errors = getValidationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json(validationResponse(formatErrors(errors)));
    }
    const { eventId } = req.params;
    const { since, origin, group, classId } = req.query;
    const shouldGroup = group === 'true' || group === true;

    const ownership = await authorizeOwnedEvent(req, res, eventId, {
      forbiddenMessage: 'Not authorized',
    });

    if (!ownership.ok) {
      return ownership.response;
    }

    // Build filters for the query
    const filters = {
      eventId: eventId,
    };

    if (since) {
      filters.createdAt = { gte: new Date(since) };
    }

    if (origin) {
      filters.origin = origin;
    }

    if (classId) {
      filters.competitor = { classId: Number(classId) };
    }

    // Fetch the protocol data
    let dbProtocolResponse;
    try {
      dbProtocolResponse = await prisma.protocol.findMany({
        where: filters,
        orderBy: [
          {
            createdAt: 'asc',
          },
        ],
        select: {
          id: true,
          competitorId: true,
          competitor: {
            select: {
              lastname: true,
              firstname: true,
              classId: true,
            },
          },
          origin: true,
          type: true,
          previousValue: true,
          newValue: true,
          author: {
            select: {
              lastname: true,
              firstname: true,
            },
          },
          createdAt: true,
        },
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json(errorResponse(`An error occurred: ` + err.message));
    }

    if (shouldGroup) {
      const grouped = {};

      for (const entry of dbProtocolResponse) {
        const { competitorId } = entry;

        if (!grouped[competitorId]) {
          grouped[competitorId] = {
            competitorId,
            competitor: entry.competitor,
            changes: [],
          };
        }

        grouped[competitorId].changes.push({
          id: entry.id,
          origin: entry.origin,
          type: entry.type,
          previousValue: entry.previousValue,
          newValue: entry.newValue,
          author: entry.author,
          createdAt: entry.createdAt,
        });
      }

      return res
        .status(200)
        .json(successResponse('OK', { data: Object.values(grouped) }, res.statusCode));
    }

    return res
      .status(200)
      .json(successResponse('OK', { data: dbProtocolResponse }, res.statusCode));
    }
  )
);

/**
 * @swagger
 * /rest/v1/events/{eventId}/competitors:
 *  delete:
 *    summary: Delete all competitors for an event
 *    description: Remove all competitors and protocol records associated with a given event ID.
 *    tags:
 *       - Events
 *    security:
 *       - bearerAuth: []  # Require user login with Bearer token
 *    parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         description: ID of the event for which competitors should be deleted.
 *         schema:
 *           type: string
 *    responses:
 *        200:
 *          description: Successfully deleted competitors and protocol records
 *        401:
 *          description: Not authenticated
 *        403:
 *          description: Not authorized
 *        422:
 *          description: Validation Error
 *        500:
 *          description: Internal Server Error
 *    securitySchemes:
 *      bearerAuth:
 *        type: http
 *        scheme: bearer
 *        bearerFormat: JWT
 */
router.delete(
  "/:eventId/competitors",
  routeWithValidation({ paramsSchema: eventIdParamsSchema }, async ({ req, res }) => {
    const errors = getValidationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json(validationResponse(formatErrors(errors)));
    }
    const { eventId } = req.params;

    try {
      const ownership = await authorizeOwnedEvent(req, res, eventId, {
        forbiddenMessage: 'Not authorized',
      });

      if (!ownership.ok) {
        return ownership.response;
      }

      // Call deleteEventCompetitors function
      const deleteMessage = await deleteEventCompetitors(eventId);

      return res.status(200).json(successResponse('OK', { data: deleteMessage }, res.statusCode));
    } catch (error) {
      console.error(error);
      if (error instanceof DatabaseError) {
        return res.status(500).json(errorResponse(error.message, res.statusCode));
      }
      return res.status(500).json(errorResponse('Internal Server Error', res.statusCode));
    }
  })
);

/**
 * @swagger
 * /rest/v1/events/{eventId}/competitors/{competitorId}:
 *  delete:
 *    summary: Delete competitor
 *    description: Remove a competitor and associated protocol records for a given event ID and competitor ID.
 *    tags:
 *       - Events
 *    security:
 *       - bearerAuth: []  # Require user login with Bearer token
 *    parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         description: ID of the event for which the competitor should be deleted.
 *         schema:
 *           type: string
 *       - in: path
 *         name: competitorId
 *         required: true
 *         description: ID of the competitor to be deleted.
 *         schema:
 *           type: string
 *    responses:
 *        200:
 *          description: Successfully deleted competitor and protocol records
 *        401:
 *          description: Not authenticated
 *        403:
 *          description: Not authorized
 *        404:
 *          description: Competitor not found
 *        422:
 *          description: Validation Error
 *        500:
 *          description: Internal Server Error
 */
router.delete(
  "/:eventId/competitors/:competitorId",
  routeWithValidation({ paramsSchema: eventCompetitorParamsSchema }, async ({ req, res }) => {
    const errors = getValidationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json(validationResponse(formatErrors(errors)));
    }
    const { eventId } = req.params;
    const competitorId = parseInt(req.params.competitorId, 10);

    try {
      const ownership = await authorizeOwnedEvent(req, res, eventId, {
        forbiddenMessage: 'Not authorized',
      });

      if (!ownership.ok) {
        return ownership.response;
      }

      // Call deleteCompetitor function
      const deleteMessage = await deleteEventCompetitor(eventId, competitorId);

      return res.status(200).json(successResponse('OK', { data: deleteMessage }, res.statusCode));
    } catch (error) {
      console.error(error);
      if (error instanceof DatabaseError) {
        return res.status(500).json(errorResponse(error.message, res.statusCode));
      }
      return res.status(500).json(errorResponse('Internal Server Error', res.statusCode));
    }
  })
);

/**
 * @swagger
 * /rest/v1/events/{eventId}/competitors/{competitorExternalId}/external-id:
 *  delete:
 *    summary: Delete competitor by external id
 *    description: Remove a competitor and associated protocol records for a given event ID and competitor external ID (useful when you don't know the internal competitor ID in OFeed).
 *    tags:
 *       - Events
 *    parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         description: String ID of the event.
 *         schema:
 *           type: string
 *       - in: path
 *         name: competitorExternalId
 *         required: true
 *         description: External ID of the competitor to delete.
 *         schema:
 *           type: string
 *    responses:
 *        200:
 *          description: Competitor successfully deleted
 *        404:
 *          description: Competitor not found
 *        401:
 *          description: Not authenticated
 *        500:
 *          description: Internal Server Error
 */
router.delete(
  "/:eventId/competitors/:competitorExternalId/external-id",
  routeWithValidation({ paramsSchema: eventCompetitorExternalParamsSchema }, async ({ req, res }) => {
    const errors = getValidationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json(validationResponse(formatErrors(errors)));
    }

    const { eventId, competitorExternalId } = req.params;

    try {
      const ownership = await authorizeOwnedEvent(req, res, eventId, {
        forbiddenMessage: 'Not authorized',
      });

      if (!ownership.ok) {
        return ownership.response;
      }

      // Get competitor id
      const dbCompetitorResponse = await prisma.competitor.findFirst({
        where: {
          class: { eventId: eventId },
          externalId: competitorExternalId,
        },
        select: {
          id: true,
        },
      });

      if (!dbCompetitorResponse) {
        return res.status(404).json(errorResponse('Competitor not found', res.statusCode));
      }

      // Call deleteCompetitor by externalId function
      const deleteMessage = await deleteEventCompetitor(eventId, dbCompetitorResponse.id);

      return res.status(200).json(successResponse('OK', { data: deleteMessage }, res.statusCode));
    } catch (error) {
      console.error(error);
      if (error instanceof DatabaseError) {
        return res.status(500).json(errorResponse(error.message, res.statusCode));
      }
      return res.status(500).json(errorResponse('Internal Server Error', res.statusCode));
    }
  })
);

/**
 * @swagger
 * /rest/v1/events/{eventId}/delete-data:
 *  delete:
 *    summary: Delete all event-related data
 *    description: Remove all competitors, protocol records, classes, and event password associated with a given event ID.
 *    tags:
 *       - Events
 *    security:
 *       - bearerAuth: []  # Require user login with Bearer token
 *    parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         description: ID of the event for which all related data should be deleted.
 *         schema:
 *           type: string
 *    responses:
 *        200:
 *          description: Successfully deleted all event-related data
 *        401:
 *          description: Not authenticated
 *        403:
 *          description: Not authorized
 *        422:
 *          description: Validation Error
 *        500:
 *          description: Internal Server Error
 *    securitySchemes:
 *      bearerAuth:
 *        type: http
 *        scheme: bearer
 *        bearerFormat: JWT
 */
router.delete(
  "/:eventId/delete-data",
  routeWithValidation({ paramsSchema: eventIdParamsSchema }, async ({ req, res }) => {
    const errors = getValidationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json(validationResponse(formatErrors(errors)));
    }
    const { eventId } = req.params;

    try {
      const ownership = await authorizeOwnedEvent(req, res, eventId, {
        eventNotFoundMessage: 'Event not found',
        forbiddenMessage: 'Not authorized',
      });

      if (!ownership.ok) {
        return ownership.response;
      }

      // Call deleteEventData function
      const deleteMessage = await deleteAllEventData(eventId);

      return res.status(200).json(successResponse('OK', { data: deleteMessage }, res.statusCode));
    } catch (error) {
      console.error(error);
      if (error instanceof DatabaseError) {
        return res.status(500).json(errorResponse(error.message, res.statusCode));
      }
      return res.status(500).json(errorResponse('Internal Server Error', res.statusCode));
    }
  })
);

}
