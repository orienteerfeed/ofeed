import { z } from '@hono/zod-openapi';

const nullableDateInputSchema = z.union([z.date(), z.string()]).nullable().optional();

export const statusChangeInputSchema = z.object({
  eventId: z.string().min(1),
  competitorId: z.number().int(),
  origin: z.enum(['START']),
  status: z.enum(['Active', 'Inactive', 'DidNotStart', 'LateStart']),
});

export const updateCompetitorInputSchema = z.object({
  eventId: z.string().min(1),
  competitorId: z.number().int(),
  origin: z.enum(['START', 'FINISH', 'IT', 'OFFICE']),
  classId: z.number().int().nullable().optional(),
  firstname: z.string().nullable().optional(),
  lastname: z.string().nullable().optional(),
  bibNumber: z.number().int().nullable().optional(),
  nationality: z.string().nullable().optional(),
  registration: z.string().nullable().optional(),
  license: z.string().nullable().optional(),
  rankingPoints: z.number().int().nullable().optional(),
  rankingReferenceValue: z.number().int().nullable().optional(),
  organisation: z.string().nullable().optional(),
  shortName: z.string().nullable().optional(),
  card: z.number().int().nullable().optional(),
  startTime: nullableDateInputSchema,
  finishTime: nullableDateInputSchema,
  time: z.number().int().nullable().optional(),
  teamId: z.number().int().nullable().optional(),
  leg: z.number().int().nullable().optional(),
  status: z.string().nullable().optional(),
  lateStart: z.boolean().nullable().optional(),
  note: z.string().nullable().optional(),
  externalId: z.string().nullable().optional(),
});

export const storeCompetitorInputSchema = updateCompetitorInputSchema
  .omit({ competitorId: true })
  .extend({
    classId: z.number().int(),
    firstname: z.string(),
    lastname: z.string(),
    origin: z.string().min(1),
  });

export const competitorsByOrganisationInputSchema = z.object({
  eventId: z.string(),
  organisation: z.string().nullable().optional(),
  organisationId: z.number().int().nullable().optional(),
});

export const organisationNamesInputSchema = z.object({
  eventId: z.string(),
});

export const searchOrganisationNamesInputSchema = z.object({
  eventId: z.string(),
  q: z.string(),
});

export const organisationsInputSchema = z.object({
  eventId: z.string(),
});

export type StatusChangeInput = z.infer<typeof statusChangeInputSchema>;
export type UpdateCompetitorInput = z.infer<typeof updateCompetitorInputSchema>;
export type StoreCompetitorInput = z.infer<typeof storeCompetitorInputSchema>;
export type CompetitorsByOrganisationInput = z.infer<typeof competitorsByOrganisationInputSchema>;
export type OrganisationNamesInput = z.infer<typeof organisationNamesInputSchema>;
export type SearchOrganisationNamesInput = z.infer<typeof searchOrganisationNamesInputSchema>;
export type OrganisationsInput = z.infer<typeof organisationsInputSchema>;
