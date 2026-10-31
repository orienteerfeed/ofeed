import type { EntryTimelineDay, EventEntryTimeline } from '@repo/shared';

import { builder } from '../../graphql/builder.js';

const EntryTimelineDayRef = builder.objectRef<EntryTimelineDay>('EntryTimelineDay').implement({
  fields: (t) => ({
    date: t.exposeString('date'),
    classId: t.exposeInt('classId'),
    className: t.exposeString('className'),
    entries: t.exposeInt('entries'),
    lateEntries: t.exposeInt('lateEntries'),
  }),
});

export const EventEntryTimelineRef = builder
  .objectRef<EventEntryTimeline>('EventEntryTimeline')
  .implement({
    fields: (t) => ({
      timezone: t.exposeString('timezone'),
      entriesOpenOn: t.exposeString('entriesOpenOn', { nullable: true }),
      entriesCloseOn: t.exposeString('entriesCloseOn', { nullable: true }),
      eventOn: t.exposeString('eventOn'),
      days: t.field({
        type: [EntryTimelineDayRef],
        resolve: (timeline) => timeline.days,
      }),
    }),
  });
