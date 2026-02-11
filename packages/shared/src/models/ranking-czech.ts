import { z } from "zod";

import { dateLikeSchema } from "./common";

export const rankingCzechSchema = z.object({
  id: z.number().int(),
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
