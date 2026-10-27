import type { CardInsightCompetitor, DuplicateCardGroup, EventCardInsight } from '@repo/shared';

import { builder } from '../../graphql/builder.js';

const CardInsightCompetitorRef = builder
  .objectRef<CardInsightCompetitor>('CardInsightCompetitor')
  .implement({
    fields: (t) => ({
      id: t.exposeInt('id'),
      firstname: t.exposeString('firstname'),
      lastname: t.exposeString('lastname'),
      registration: t.exposeString('registration'),
      bibNumber: t.exposeInt('bibNumber', { nullable: true }),
      classId: t.exposeInt('classId'),
      className: t.exposeString('className'),
      organisation: t.exposeString('organisation', { nullable: true }),
      card: t.exposeInt('card', { nullable: true }),
    }),
  });

const DuplicateCardGroupRef = builder
  .objectRef<DuplicateCardGroup>('DuplicateCardGroup')
  .implement({
    fields: (t) => ({
      card: t.exposeInt('card'),
      competitors: t.field({
        type: [CardInsightCompetitorRef],
        resolve: (group) => group.competitors,
      }),
    }),
  });

export const EventCardInsightRef = builder
  .objectRef<EventCardInsight>('EventCardInsight')
  .implement({
    fields: (t) => ({
      missingCards: t.field({
        type: [CardInsightCompetitorRef],
        resolve: (report) => report.missingCards,
      }),
      duplicateCards: t.field({
        type: [DuplicateCardGroupRef],
        resolve: (report) => report.duplicateCards,
      }),
    }),
  });
