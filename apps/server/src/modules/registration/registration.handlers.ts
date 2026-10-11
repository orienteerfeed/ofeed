import { getErrorDetails, logEndpoint } from '../../lib/http/endpoint-logger.js';
import { toValidationIssues as zodToValidationIssues } from '../../lib/validation/zod.js';
import { error, success, validation } from '../../utils/responseApi.js';

import {
  clubListQuerySchema,
  REGISTRATION_CLUB_SEARCH_LIMIT,
  registrationLookupQuerySchema,
} from './registration.schema.js';
import {
  ensureClubsSynchronized,
  ensureRegistrationsSynchronized,
  lookupByCard,
  lookupByRegistration,
  searchClubs,
} from './registration.service.js';

function responseValidationIssues(issues: Parameters<typeof zodToValidationIssues>[0]) {
  return validation(zodToValidationIssues(issues));
}

export function registerRegistrationRoutes(router) {
  router.get('/lookup', async (c) => {
    const parsedQuery = registrationLookupQuerySchema.safeParse(c.req.query());
    if (!parsedQuery.success) {
      return c.json(responseValidationIssues(parsedQuery.error.issues), 422);
    }

    const { registration, card, sport, source } = parsedQuery.data;
    const year = new Date().getFullYear();

    if (source === 'ORIS') {
      try {
        await ensureRegistrationsSynchronized({ sport, year });
      } catch (err) {
        // Serve whatever is already cached rather than failing the request —
        // the sync failure is logged and cooled down inside the service.
        logEndpoint(c, 'warn', 'Registration ORIS sync failed, serving cached data', {
          sport,
          year,
          ...getErrorDetails(err),
        });
      }
    }

    try {
      const items = registration
        ? await lookupByRegistration(registration, { source, sport, year })
        : await lookupByCard(Number.parseInt(card as string, 10), { source, sport, year });

      return c.json(success('OK', { data: items }, 200), 200);
    } catch (err) {
      logEndpoint(c, 'error', 'Registration lookup query failed', {
        source,
        sport,
        year,
        ...getErrorDetails(err),
      });
      return c.json(error('Failed to load registration data', 500), 500);
    }
  });

  router.get('/clubs', async (c) => {
    const parsedQuery = clubListQuerySchema.safeParse(c.req.query());
    if (!parsedQuery.success) {
      return c.json(responseValidationIssues(parsedQuery.error.issues), 422);
    }

    try {
      await ensureClubsSynchronized();
    } catch (err) {
      logEndpoint(c, 'warn', 'Club ORIS sync failed, serving cached data', getErrorDetails(err));
    }

    try {
      const clubs = await searchClubs(parsedQuery.data.q, REGISTRATION_CLUB_SEARCH_LIMIT);
      return c.json(success('OK', { data: clubs }, 200), 200);
    } catch (err) {
      logEndpoint(c, 'error', 'Club list query failed', getErrorDetails(err));
      return c.json(error('Failed to load club list', 500), 500);
    }
  });
}
