import { z } from 'zod';
import { cardInsightCompetitorSchema } from './card-insight.js';
import { startModeSchema } from './common.js';

export const anomalyTypes = ['FAST_FIRST_SPLIT', 'OFF_START_GRID', 'START_PUNCH'] as const;
export const anomalyCoverageStatuses = [
  'EVALUATED',
  'UNSUPPORTED_MODE',
  'NO_COURSE',
  'AMBIGUOUS_FIRST_CONTROL',
  'INSUFFICIENT_DATA',
  'NO_RELIABLE_GRID',
] as const;
export const anomalyFindingSchema = z.object({
  type: z.enum(anomalyTypes),
  controlCode: z.number().int().nullable(),
  splitSeconds: z.number().nullable(),
  medianSeconds: z.number().nullable(),
  differenceSeconds: z.number().nullable(),
  referenceCount: z.number().int().nullable(),
  intervalSeconds: z.number().nullable(),
  phaseSeconds: z.number().nullable(),
  nearestStartTime: z.string().datetime().nullable(),
  punchTimes: z.array(z.string().datetime()),
});
export type AnomalyFinding = z.infer<typeof anomalyFindingSchema>;
export const anomalyCompetitorSchema = cardInsightCompetitorSchema.extend({
  startMode: startModeSchema,
  startTime: z.string().datetime().nullable(),
  findings: z.array(anomalyFindingSchema),
});
export type AnomalyCompetitor = z.infer<typeof anomalyCompetitorSchema>;
export const anomalyCoverageSchema = z.object({
  classId: z.number().int(),
  className: z.string(),
  type: z.enum(anomalyTypes),
  status: z.enum(anomalyCoverageStatuses),
  evaluated: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type AnomalyCoverage = z.infer<typeof anomalyCoverageSchema>;
export const eventAnomalyInsightSchema = z.object({
  competitors: z.array(anomalyCompetitorSchema),
  coverage: z.array(anomalyCoverageSchema),
});
export type EventAnomalyInsight = z.infer<typeof eventAnomalyInsightSchema>;
