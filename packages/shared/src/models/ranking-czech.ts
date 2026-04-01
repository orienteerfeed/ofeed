import { z } from 'zod';

import { czechRankingCategorySchema, czechRankingTypeSchema, dateLikeSchema } from './common.js';

export const rankingCzechSchema = z.object({
  id: z.number().int(),
  rankingType: czechRankingTypeSchema,
  rankingCategory: czechRankingCategorySchema,
  validForMonth: dateLikeSchema,
  place: z.number().int(),
  firstName: z.string(),
  lastName: z.string(),
  registration: z.string(),
  points: z.number().int(),
  rankIndex: z.number().int(),
  createdAt: dateLikeSchema,
  updatedAt: dateLikeSchema,
});

export type RankingCzech = z.infer<typeof rankingCzechSchema>;
