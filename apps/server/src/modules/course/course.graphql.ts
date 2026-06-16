import { builder } from '../../graphql/builder.js';
import { rethrowAuthzOrError } from '../../graphql/errors.js';
import type { Control, EventImportState } from '../../generated/prisma/client.js';
import { requireEventOwnerOrAdmin } from '../../utils/authz.js';
import {
  assertClassCourseAccess,
  getEventFilesStatus,
  getEventImportStates,
  getLeafletCoursePointsByClassId,
  getRadioControlsByClassId,
  updateControlRadioFlag,
  type EventFilesCoursesStatus,
  type EventFilesResultsStatus,
  type EventFilesStartListStatus,
  type EventFilesStatus,
  type LeafletCoursePoint,
  type RadioCoursePoint,
} from './course.service.js';

const ControlRef = builder.objectRef<Control>('Control').implement({
  fields: (t) => ({
    id: t.exposeInt('id'),
    eventId: t.exposeString('eventId'),
    code: t.exposeString('code'),
    type: t.exposeString('type'),
    radio: t.exposeBoolean('radio'),
    name: t.exposeString('name', { nullable: true }),
    latitude: t.exposeFloat('latitude', { nullable: true }),
    longitude: t.exposeFloat('longitude', { nullable: true }),
    altitude: t.exposeFloat('altitude', { nullable: true }),
  }),
});

const LeafletCoursePointRef = builder
  .objectRef<LeafletCoursePoint>('LeafletCoursePoint')
  .implement({
    fields: (t) => ({
      sequence: t.exposeInt('sequence'),
      code: t.exposeString('code'),
      type: t.exposeString('type'),
      radio: t.exposeBoolean('radio'),
      latitude: t.exposeFloat('latitude'),
      longitude: t.exposeFloat('longitude'),
      legLength: t.exposeFloat('legLength', { nullable: true }),
    }),
  });

const RadioCoursePointRef = builder.objectRef<RadioCoursePoint>('RadioCoursePoint').implement({
  fields: (t) => ({
    sequence: t.exposeInt('sequence'),
    code: t.exposeString('code'),
    latitude: t.exposeFloat('latitude', { nullable: true }),
    longitude: t.exposeFloat('longitude', { nullable: true }),
    legLength: t.exposeFloat('legLength', { nullable: true }),
  }),
});

const EventFilesStartListStatusRef = builder
  .objectRef<EventFilesStartListStatus>('EventFilesStartListStatus')
  .implement({
    fields: (t) => ({
      available: t.exposeBoolean('available'),
      classesCount: t.exposeInt('classesCount'),
      competitorsCount: t.exposeInt('competitorsCount'),
      competitorsWithStartTimeCount: t.exposeInt('competitorsWithStartTimeCount'),
      source: t.exposeString('source', { nullable: true }),
    }),
  });

const EventFilesCoursesStatusRef = builder
  .objectRef<EventFilesCoursesStatus>('EventFilesCoursesStatus')
  .implement({
    fields: (t) => ({
      available: t.exposeBoolean('available'),
      coursesCount: t.exposeInt('coursesCount'),
      controlsCount: t.exposeInt('controlsCount'),
      courseControlsCount: t.exposeInt('courseControlsCount'),
      source: t.exposeString('source', { nullable: true }),
    }),
  });

const EventFilesResultsStatusRef = builder
  .objectRef<EventFilesResultsStatus>('EventFilesResultsStatus')
  .implement({
    fields: (t) => ({
      available: t.exposeBoolean('available'),
      competitorsCount: t.exposeInt('competitorsCount'),
      competitorsWithResultDataCount: t.exposeInt('competitorsWithResultDataCount'),
      source: t.exposeString('source', { nullable: true }),
    }),
  });

const EventFilesRadioControlRef = builder
  .objectRef<EventFilesStatus['radioControls'][number]>('EventFilesRadioControl')
  .implement({
    fields: (t) => ({
      id: t.exposeInt('id'),
      code: t.exposeString('code'),
      type: t.exposeString('type'),
      radio: t.exposeBoolean('radio'),
    }),
  });

const EventFilesStatusRef = builder.objectRef<EventFilesStatus>('EventFilesStatus').implement({
  fields: (t) => ({
    startList: t.field({
      type: EventFilesStartListStatusRef,
      resolve: (status) => status.startList,
    }),
    courses: t.field({
      type: EventFilesCoursesStatusRef,
      resolve: (status) => status.courses,
    }),
    results: t.field({
      type: EventFilesResultsStatusRef,
      resolve: (status) => status.results,
    }),
    radioControls: t.field({
      type: [EventFilesRadioControlRef],
      resolve: (status) => status.radioControls,
    }),
  }),
});

const EventImportStateRef = builder.objectRef<EventImportState>('EventImportState').implement({
  fields: (t) => ({
    sourceType: t.exposeString('sourceType'),
    payloadType: t.exposeString('payloadType'),
    rawHash: t.exposeString('rawHash'),
    creator: t.exposeString('creator', { nullable: true }),
    externalStatus: t.exposeString('externalStatus', { nullable: true }),
    lastSuccessfulImportAt: t.expose('lastSuccessfulImportAt', {
      type: 'DateTime',
      nullable: true,
    }),
    successCount: t.exposeInt('successCount'),
    skippedCount: t.exposeInt('skippedCount'),
  }),
});

builder.queryFields((t) => ({
  courseLeafletPoints: t.field({
    type: [LeafletCoursePointRef],
    args: {
      classId: t.arg.int({ required: true }),
    },
    resolve: async (_root, args, context) => {
      try {
        await assertClassCourseAccess(context.prisma, context.auth, args.classId as number);
        return await getLeafletCoursePointsByClassId(context.prisma, args.classId as number);
      } catch (err: unknown) {
        return rethrowAuthzOrError(err, 'Failed to load course points.');
      }
    },
  }),
  courseRadioControls: t.field({
    type: [RadioCoursePointRef],
    args: {
      classId: t.arg.int({ required: true }),
    },
    resolve: async (_root, args, context) => {
      try {
        await assertClassCourseAccess(context.prisma, context.auth, args.classId as number);
        return await getRadioControlsByClassId(context.prisma, args.classId as number);
      } catch (err: unknown) {
        return rethrowAuthzOrError(err, 'Failed to load radio controls.');
      }
    },
  }),
  eventFilesStatus: t.field({
    type: EventFilesStatusRef,
    args: {
      eventId: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, context) => {
      try {
        await requireEventOwnerOrAdmin(context.prisma, context.auth, args.eventId as string);
        return await getEventFilesStatus(context.prisma, args.eventId as string);
      } catch (err: unknown) {
        return rethrowAuthzOrError(err, 'Failed to load event files status.');
      }
    },
  }),
  eventImportStates: t.field({
    type: [EventImportStateRef],
    args: {
      eventId: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, context) => {
      try {
        await requireEventOwnerOrAdmin(context.prisma, context.auth, args.eventId as string);
        return await getEventImportStates(context.prisma, args.eventId as string);
      } catch (err: unknown) {
        return rethrowAuthzOrError(err, 'Failed to load event import states.');
      }
    },
  }),
}));

builder.mutationFields((t) => ({
  updateControlRadioFlag: t.field({
    type: ControlRef,
    args: {
      eventId: t.arg.string({ required: true }),
      controlId: t.arg.int({ required: true }),
      radio: t.arg.boolean({ required: true }),
    },
    resolve: async (_root, args, context) => {
      try {
        await requireEventOwnerOrAdmin(context.prisma, context.auth, args.eventId as string);
        return await updateControlRadioFlag(context.prisma, {
          eventId: args.eventId as string,
          controlId: args.controlId as number,
          radio: args.radio as boolean,
        });
      } catch (err: unknown) {
        return rethrowAuthzOrError(err, 'Failed to update control radio flag.');
      }
    },
  }),
}));
