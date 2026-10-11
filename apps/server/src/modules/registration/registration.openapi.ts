import { API_DEFAULTS } from '../../constants/index.js';
import { okJson } from '../../config/openapi.helpers.js';

export const REGISTRATION_OPENAPI = {
  tag: 'Registration',
  basePath: `${API_DEFAULTS.BASE_PATH}/registration`,
} as const;

const registrationBase = REGISTRATION_OPENAPI.basePath;

export const REGISTRATION_OPENAPI_PATHS = {
  [`${registrationBase}/lookup`]: {
    get: {
      tags: [REGISTRATION_OPENAPI.tag],
      operationId: 'registrationLookup',
      summary: 'Look up an athlete registration by registration code or SI card number',
      description:
        'Searches a locally cached, periodically refreshed copy of the ČSOS (ORIS) registration ' +
        'list for the current season. Exactly one of `registration` or `card` must be provided. ' +
        'The SI card number is included in the response only for a registration-code lookup ' +
        '(so an entry form can auto-fill it); a card-number lookup never echoes it back, since ' +
        'the caller already supplied it. No authentication required.',
      security: [],
      parameters: [
        {
          name: 'registration',
          in: 'query',
          required: false,
          schema: { type: 'string' },
          description: 'Registration code, e.g. CHC9501.',
        },
        {
          name: 'card',
          in: 'query',
          required: false,
          schema: { type: 'string' },
          description: 'SI card (control card) number.',
        },
        {
          name: 'sport',
          in: 'query',
          required: false,
          schema: { type: 'string', enum: ['OB', 'LOB', 'MTBO', 'TRAIL'], default: 'OB' },
        },
        {
          name: 'source',
          in: 'query',
          required: false,
          schema: { type: 'string', enum: ['ORIS', 'EVENTOR'], default: 'ORIS' },
          description:
            'Registration source to search. ORIS is refreshed lazily; other sources are read from the local cache only.',
        },
      ],
      responses: {
        200: okJson('Registration matches'),
        422: okJson('Validation error'),
        500: okJson('Internal server error'),
      },
    },
  },
  [`${registrationBase}/clubs`]: {
    get: {
      tags: [REGISTRATION_OPENAPI.tag],
      operationId: 'registrationClubs',
      summary: 'List/search the club directory',
      description:
        'Searches a locally cached, periodically refreshed copy of the ORIS club directory. ' +
        'No authentication required.',
      security: [],
      parameters: [
        {
          name: 'q',
          in: 'query',
          required: false,
          schema: { type: 'string' },
          description: 'Free-text filter matched against club name and abbreviation.',
        },
      ],
      responses: {
        200: okJson('Club list'),
        422: okJson('Validation error'),
        500: okJson('Internal server error'),
      },
    },
  },
};
