import {
  EventDiscipline,
  ExternalSource,
  SplitPublicationMode,
} from '../../generated/prisma/enums.js';
import { builder } from '../../graphql/builder.js';
import { requireEventOwnerOrAdmin } from '../../utils/authz.js';
import { normalizeUtcTimeString } from '../../utils/time.js';

import { getDecryptedEventPassword } from './event.service.js';
import { EVENT_OPENAPI } from './event.openapi.js';
import { getEventStatusSummary, type EventStatusSummary } from './event.status.service.js';

const ExternalEventProviderRef = builder.enumType(ExternalSource, {
  name: 'ExternalEventProvider',
});

const EventDisciplineRef = builder.enumType(EventDiscipline, {
  name: 'EventDiscipline',
});

const EventLifecycleStatusRef = builder.enumType('EventLifecycleStatus', {
  values: ['DRAFT', 'UPCOMING', 'LIVE', 'DONE'] as const,
});

const EventPrimaryStatusRef = builder.enumType('EventPrimaryStatus', {
  values: ['DRAFT', 'UPCOMING', 'LIVE', 'DONE'] as const,
});

const EventResultsStatusRef = builder.enumType('EventResultsStatus', {
  values: ['NONE', 'LIVE', 'UNOFFICIAL', 'OFFICIAL'] as const,
});

const EventEntriesStatusRef = builder.enumType('EventEntriesStatus', {
  values: ['CLOSED', 'OPEN'] as const,
});

const EventOfficialResultsSourceRef = builder.enumType('EventOfficialResultsSource', {
  values: ['ORIS', 'EVENTOR', 'LOCAL'] as const,
});

export const SplitPublicationModeRef = builder.enumType(SplitPublicationMode, {
  name: 'SplitPublicationMode',
});

const EventStatusSummaryRef = builder
  .objectRef<EventStatusSummary>('EventStatusSummary')
  .implement({
    fields: (t) => ({
      primary: t.field({
        type: EventPrimaryStatusRef,
        resolve: (summary) => summary.primary,
      }),
      lifecycle: t.field({
        type: EventLifecycleStatusRef,
        resolve: (summary) => summary.lifecycle,
      }),
      results: t.field({
        type: EventResultsStatusRef,
        resolve: (summary) => summary.results,
      }),
      entries: t.field({
        type: EventEntriesStatusRef,
        resolve: (summary) => summary.entries,
      }),
      entriesConfigured: t.exposeBoolean('entriesConfigured'),
      officialResultsUrl: t.exposeString('officialResultsUrl', { nullable: true }),
      officialResultsSource: t.field({
        type: EventOfficialResultsSourceRef,
        nullable: true,
        resolve: (summary) => summary.officialResultsSource,
      }),
      resultsOfficialAt: t.expose('resultsOfficialAt', { type: 'DateTime', nullable: true }),
      resultsOfficialCheckedAt: t.expose('resultsOfficialCheckedAt', {
        type: 'DateTime',
        nullable: true,
      }),
    }),
  });

const EventPasswordRef = builder.prismaObject('EventPassword', {
  fields: (t) => ({
    id: t.exposeString('id'),
    eventId: t.exposeString('eventId'),
    password: t.exposeString('password'),
    expiresAt: t.expose('expiresAt', { type: 'DateTime' }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    event: t.relation('event'),
  }),
});

function buildPublicImageUrl(key: string | null | undefined, eventId: string | null | undefined) {
  if (!key || !eventId) {
    return null;
  }

  return `${EVENT_OPENAPI.basePath}/${eventId}/image`;
}

export const EventRef = builder.prismaObject('Event', {
  findUnique: (event) => ({ id: event.id }),
  fields: (t) => ({
    id: t.exposeString('id'),
    slug: t.exposeString('slug', { nullable: true }),
    sportId: t.exposeInt('sportId'),
    name: t.exposeString('name'),
    organizer: t.exposeString('organizer', { nullable: true }),
    date: t.expose('date', { type: 'DateTime' }),
    timezone: t.exposeString('timezone'),
    zeroTime: t.string({
      select: { date: true },
      resolve: (event) => normalizeUtcTimeString(event.date) ?? '00:00:00',
    }),
    externalSource: t.field({
      type: ExternalEventProviderRef,
      nullable: true,
      resolve: (event) => event.externalSource,
    }),
    externalEventId: t.exposeString('externalEventId', { nullable: true }),
    location: t.exposeString('location', { nullable: true }),
    latitude: t.exposeFloat('latitude', { nullable: true }),
    longitude: t.exposeFloat('longitude', { nullable: true }),
    relay: t.exposeBoolean('relay'),
    discipline: t.field({
      type: EventDisciplineRef,
      resolve: (event) => event.discipline,
    }),
    ranking: t.exposeBoolean('ranking'),
    coefRanking: t.exposeFloat('coefRanking', { nullable: true }),
    hundredthPrecision: t.exposeBoolean('hundredthPrecision'),
    startMode: t.string({
      resolve: (event) => event.startMode,
    }),
    countryId: t.exposeString('countryId', { nullable: true }),
    published: t.exposeBoolean('published'),
    demo: t.exposeBoolean('demo'),
    entriesOpenAt: t.expose('entriesOpenAt', { type: 'DateTime', nullable: true }),
    entriesCloseAt: t.expose('entriesCloseAt', { type: 'DateTime', nullable: true }),
    splitPublicationMode: t.field({
      type: SplitPublicationModeRef,
      resolve: (event) => event.splitPublicationMode,
    }),
    splitPublicationAt: t.expose('splitPublicationAt', { type: 'DateTime', nullable: true }),
    resultsOfficialAt: t.expose('resultsOfficialAt', { type: 'DateTime', nullable: true }),
    resultsOfficialManuallySetAt: t.expose('resultsOfficialManuallySetAt', {
      type: 'DateTime',
      nullable: true,
    }),
    authorId: t.exposeInt('authorId', { nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    classes: t.relation('classes', { nullable: true }),
    sport: t.relation('sport'),
    country: t.relation('country', { nullable: true }),
    user: t.relation('author', { nullable: true }),
    eventPassword: t.field({
      type: EventPasswordRef,
      nullable: true,
      select: { id: true },
      resolve: async (event, _args, context) => {
        await requireEventOwnerOrAdmin(context.prisma, context.auth, event.id);
        return (await getDecryptedEventPassword(event.id)) ?? null;
      },
    }),
    featuredImageKey: t.exposeString('featuredImageKey', { nullable: true }),
    featuredImage: t.string({
      nullable: true,
      select: { id: true, featuredImageKey: true },
      resolve: (event) => buildPublicImageUrl(event.featuredImageKey, event.id),
    }),
    statusSummary: t.field({
      type: EventStatusSummaryRef,
      select: {
        id: true,
        published: true,
        date: true,
        timezone: true,
        entriesOpenAt: true,
        entriesCloseAt: true,
        resultsOfficialAt: true,
        resultsOfficialManuallySetAt: true,
        externalSource: true,
        externalEventId: true,
      },
      resolve: (event, _args, context) => getEventStatusSummary(context.prisma, event),
    }),
  }),
});
