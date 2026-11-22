import { z } from 'zod';

export const eventFavoritesInputSchema = z.object({ eventId: z.string().min(1).max(191) });
export const setCompetitorFavoriteInputSchema = eventFavoritesInputSchema.extend({
  competitorId: z.number().int().positive().max(2147483647),
  favorite: z.boolean(),
});
export type SetCompetitorFavoriteInput = z.infer<typeof setCompetitorFavoriteInputSchema>;
export const eventFavoriteSelectionSchema = eventFavoritesInputSchema.extend({
  competitorIds: z.array(z.number().int().positive().max(2147483647)).max(1000),
});

export const athleteFollowSourceSchema = z.enum(['ORIS', 'EVENTOR', 'LOCAL']);
export const athleteFollowIdSchema = z.object({ id: z.string().min(1).max(191) });
export const athleteFollowPauseSchema = athleteFollowIdSchema.extend({ paused: z.boolean() });
export const athleteFollowSchema = z.object({
  id: z.string(),
  registration: z.string(),
  source: athleteFollowSourceSchema,
  displayName: z.string(),
  pausedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type AthleteFollow = z.infer<typeof athleteFollowSchema>;
