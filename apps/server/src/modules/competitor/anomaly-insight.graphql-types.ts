import {
  anomalyTypes,
  anomalyCoverageStatuses,
  type AnomalyFinding,
  type AnomalyCompetitor,
  type AnomalyCoverage,
  type EventAnomalyInsight,
} from '@repo/shared';
import { builder } from '../../graphql/builder.js';

const AnomalyTypeRef = builder.enumType('AnomalyType', { values: anomalyTypes });
const AnomalyCoverageStatusRef = builder.enumType('AnomalyCoverageStatus', {
  values: anomalyCoverageStatuses,
});
const AnomalyFindingRef = builder.objectRef<AnomalyFinding>('AnomalyFinding').implement({
  fields: (t) => ({
    type: t.field({ type: AnomalyTypeRef, resolve: (row) => row.type }),
    controlCode: t.exposeInt('controlCode', { nullable: true }),
    splitSeconds: t.exposeFloat('splitSeconds', { nullable: true }),
    medianSeconds: t.exposeFloat('medianSeconds', { nullable: true }),
    differenceSeconds: t.exposeFloat('differenceSeconds', { nullable: true }),
    referenceCount: t.exposeInt('referenceCount', { nullable: true }),
    intervalSeconds: t.exposeFloat('intervalSeconds', { nullable: true }),
    phaseSeconds: t.exposeFloat('phaseSeconds', { nullable: true }),
    nearestStartTime: t.exposeString('nearestStartTime', { nullable: true }),
    punchTimes: t.exposeStringList('punchTimes'),
  }),
});
const AnomalyCompetitorRef = builder.objectRef<AnomalyCompetitor>('AnomalyCompetitor').implement({
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
    startMode: t.exposeString('startMode'),
    startTime: t.exposeString('startTime', { nullable: true }),
    findings: t.field({ type: [AnomalyFindingRef], resolve: (row) => row.findings }),
  }),
});
const AnomalyCoverageRef = builder.objectRef<AnomalyCoverage>('AnomalyCoverage').implement({
  fields: (t) => ({
    classId: t.exposeInt('classId'),
    className: t.exposeString('className'),
    type: t.field({ type: AnomalyTypeRef, resolve: (row) => row.type }),
    status: t.field({ type: AnomalyCoverageStatusRef, resolve: (row) => row.status }),
    evaluated: t.exposeInt('evaluated'),
    total: t.exposeInt('total'),
  }),
});
export const EventAnomalyInsightRef = builder
  .objectRef<EventAnomalyInsight>('EventAnomalyInsight')
  .implement({
    fields: (t) => ({
      competitors: t.field({
        type: [AnomalyCompetitorRef],
        resolve: (report) => report.competitors,
      }),
      coverage: t.field({ type: [AnomalyCoverageRef], resolve: (report) => report.coverage }),
    }),
  });
