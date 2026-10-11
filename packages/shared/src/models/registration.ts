import { z } from 'zod';

import { sexSchema } from './common.js';
import { registrationPattern } from './entry.js';

/**
 * Provenance of a cached registration/club record. Mirrors the Prisma enum
 * `ExternalSource` (already used by `Event.externalSource`). Only `'ORIS'`
 * is populated today; `'EVENTOR'` is a reserved extension point for a future
 * Eventor / Swedish Eventor source, added without changing this contract.
 */
export const externalSourceSchema = z.enum(['ORIS', 'EVENTOR']);
export type ExternalSourceValue = z.infer<typeof externalSourceSchema>;

/**
 * Orienteering disciplines used by the registration cache — deliberately
 * independent of any source system's own numbering (e.g. ORIS uses
 * `sport=1..4` internally; that mapping lives only in the ORIS sync code).
 */
export const registrationSportSchema = z.enum(['OB', 'LOB', 'MTBO', 'TRAIL']);
export type RegistrationSport = z.infer<typeof registrationSportSchema>;

export const registrationLookupItemSchema = z.object({
  source: externalSourceSchema,
  externalId: z.string(),
  registration: z.string(),
  firstname: z.string(),
  lastname: z.string(),
  birthYear: z.number().int().nullable(),
  license: z.string().nullable(),
  organisation: z.string().nullable(),
  gender: sexSchema.nullable(),
  /**
   * SI card number. Populated only when the lookup was performed by
   * `registration` code — a card-number lookup never echoes it back, since
   * the caller already supplied it. Data minimization on a public,
   * unauthenticated endpoint: knowing the registration code already reveals
   * name/club/birth year, so also returning the card doesn't meaningfully
   * increase exposure for that lookup mode.
   */
  card: z.number().int().nullable(),
});

export type RegistrationLookupItem = z.infer<typeof registrationLookupItemSchema>;

export const registrationLookupResponseSchema = z.array(registrationLookupItemSchema);

export const registrationLookupQuerySchema = z
  .object({
    registration: z
      .string()
      .trim()
      .toUpperCase()
      .regex(registrationPattern, 'Invalid registration format.')
      .optional(),
    card: z
      .string()
      .trim()
      .regex(/^\d{1,9}$/, 'Invalid card number.')
      .optional(),
    sport: registrationSportSchema.default('OB'),
    source: externalSourceSchema.default('ORIS'),
  })
  .superRefine((value, ctx) => {
    if (value.registration === undefined && value.card === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Either registration or card is required.',
        path: ['registration'],
      });
    }
    if (value.registration !== undefined && value.card !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide either registration or card, not both.',
        path: ['card'],
      });
    }
  });

export type RegistrationLookupQuery = z.infer<typeof registrationLookupQuerySchema>;

export const clubListItemSchema = z.object({
  source: externalSourceSchema,
  externalId: z.string(),
  name: z.string(),
  abbr: z.string(),
  region: z.string().nullable(),
});

export type ClubListItem = z.infer<typeof clubListItemSchema>;

export const clubListResponseSchema = z.array(clubListItemSchema);

export const clubListQuerySchema = z.object({
  q: z.string().trim().max(64).optional(),
});

export type ClubListQuery = z.infer<typeof clubListQuerySchema>;
