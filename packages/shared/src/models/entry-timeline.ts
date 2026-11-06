import { z } from 'zod';

/** Calendar date (YYYY-MM-DD) in the event timezone. */
const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const entryTimelineDaySchema = z.object({
  date: localDateSchema,
  classId: z.number().int(),
  className: z.string(),
  entries: z.number().int().nonnegative(),
  lateEntries: z.number().int().nonnegative(),
});
export type EntryTimelineDay = z.infer<typeof entryTimelineDaySchema>;

export const eventEntryTimelineSchema = z.object({
  timezone: z.string(),
  entriesOpenOn: localDateSchema.nullable(),
  entriesCloseOn: localDateSchema.nullable(),
  eventOn: localDateSchema,
  days: z.array(entryTimelineDaySchema),
});
export type EventEntryTimeline = z.infer<typeof eventEntryTimelineSchema>;
