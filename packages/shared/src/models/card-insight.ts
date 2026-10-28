import { z } from 'zod';

export const cardInsightCompetitorSchema = z.object({
  id: z.number().int(),
  firstname: z.string(),
  lastname: z.string(),
  registration: z.string(),
  bibNumber: z.number().int().nullable(),
  classId: z.number().int(),
  className: z.string(),
  organisation: z.string().nullable(),
  card: z.number().int().nullable(),
});
export type CardInsightCompetitor = z.infer<typeof cardInsightCompetitorSchema>;

export const duplicateCardGroupSchema = z.object({
  card: z.number().int().positive(),
  competitors: z.array(cardInsightCompetitorSchema),
});
export type DuplicateCardGroup = z.infer<typeof duplicateCardGroupSchema>;

export const eventCardInsightSchema = z.object({
  missingCards: z.array(cardInsightCompetitorSchema),
  duplicateCards: z.array(duplicateCardGroupSchema),
});
export type EventCardInsight = z.infer<typeof eventCardInsightSchema>;
