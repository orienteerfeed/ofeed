import type { AppPrismaClient } from '../../db/prisma-client.js';
import type { ControlType } from '../../generated/prisma/client.js';
import { COMPETITORS_BY_CLASS_UPDATED, pubsub as defaultPubsub } from '../../lib/pubsub.js';
import type { GraphQLAuthContext } from '../../graphql/context.types.js';
import {
  assertSplitPublicationAccessible,
  assertSplitPublicationAccessibleForCompetitor,
  getSplitPublicationStatus,
} from '../event/split-publication.service.js';
import { findCompetitorsByClassWithLegacyShape } from '../competitor/competitor.service.js';
import { getCourseByClassId } from '../course/course.service.js';
import type { CompetitorSplitsInput, SplitPublicationStatusInput } from './split.schema.js';

export type SplitCompetitorsByClassUpdatedPayload = {
  splitCompetitorsByClassUpdated: Awaited<ReturnType<typeof findCompetitorsByClassWithLegacyShape>>;
};

export type SplitCourseDistances = {
  totalLength: number;
  controls: Array<{ controlCode: string; distance: number }>;
};

type SplitCourseControlInput = {
  type: ControlType | null;
  legLength: number | null;
  controlCode: string;
  control: { code: string; type: ControlType } | null;
};

/**
 * Running sum of `legLength` over the course, exposing the cumulative distance
 * (metres from the start) of every control. `LegLength` in IOF CourseData is the
 * distance of the leg *into* that control, so the sum up to control N is exactly
 * how far into the course control N sits.
 *
 * Every control is returned, not just the radio ones: which controls produce a
 * split is decided by the timing system, while `Control.radio` is a manual display
 * flag, so the client matches recorded splits against the full course order.
 *
 * Returns null when the legs cannot describe the whole course (a missing
 * `legLength` on anything but the start, or no total length), which the client
 * reads as "keep the evenly-spaced axis".
 */
export function computeSplitCourseDistances(
  courseControls: readonly SplitCourseControlInput[],
  courseLength: number | null,
): SplitCourseDistances | null {
  const controls: SplitCourseDistances['controls'] = [];
  let cumulative = 0;
  let finishLength: number | null = null;

  for (const courseControl of courseControls) {
    const type = courseControl.type ?? courseControl.control?.type ?? 'CONTROL';

    if (type === 'START') {
      // IOF CourseData omits LegLength on the start control.
      continue;
    }
    if (courseControl.legLength === null) {
      return null;
    }
    cumulative += courseControl.legLength;

    if (type === 'FINISH') {
      finishLength = cumulative;
      continue;
    }

    const controlCode = courseControl.control?.code ?? courseControl.controlCode;
    controls.push({ controlCode, distance: cumulative });
  }

  const totalLength = finishLength ?? courseLength ?? 0;
  if (totalLength <= 0 || controls.length === 0) {
    return null;
  }

  return { totalLength, controls };
}

/**
 * Cumulative course distance of every control on a class's course, so the split
 * chart can space legs by real distance instead of evenly. Returns null when the
 * class has no course or its legs are incomplete.
 *
 * Gated by the same split publication check as the split data itself.
 */
export async function findSplitCourseDistances(
  prisma: AppPrismaClient,
  auth: GraphQLAuthContext,
  classId: number,
): Promise<SplitCourseDistances | null> {
  const splitPublicationAuth = auth as Parameters<typeof assertSplitPublicationAccessible>[1];
  await assertSplitPublicationAccessible(prisma, splitPublicationAuth, classId);

  const cls = await getCourseByClassId(prisma, classId);
  if (!cls?.course) {
    return null;
  }

  return computeSplitCourseDistances(cls.course.courseControls, cls.course.length);
}

export async function findSplitsByCompetitor(
  prisma: AppPrismaClient,
  auth: GraphQLAuthContext,
  input: CompetitorSplitsInput,
) {
  const splitPublicationAuth = auth as Parameters<
    typeof assertSplitPublicationAccessibleForCompetitor
  >[1];
  const { competitorId } = input;

  await assertSplitPublicationAccessibleForCompetitor(prisma, splitPublicationAuth, competitorId);

  return prisma.split.findMany({
    where: { competitorId },
    orderBy: { id: 'asc' },
  });
}

export function findSplitPublicationStatus(
  prisma: AppPrismaClient,
  auth: GraphQLAuthContext,
  input: SplitPublicationStatusInput,
) {
  const splitPublicationAuth = auth as Parameters<typeof getSplitPublicationStatus>[1];

  return getSplitPublicationStatus(prisma, splitPublicationAuth, input.classId);
}

export async function* subscribeSplitCompetitorsByClassUpdated(
  prisma: AppPrismaClient,
  auth: GraphQLAuthContext,
  classId: number,
  pubsub: typeof defaultPubsub = defaultPubsub,
): AsyncIterable<SplitCompetitorsByClassUpdatedPayload> {
  const splitPublicationAuth = auth as Parameters<typeof assertSplitPublicationAccessible>[1];

  await assertSplitPublicationAccessible(prisma, splitPublicationAuth, classId);

  yield {
    splitCompetitorsByClassUpdated: await findCompetitorsByClassWithLegacyShape(
      prisma,
      classId,
      true,
    ),
  };

  const topic = `${COMPETITORS_BY_CLASS_UPDATED}_${classId}`;
  const asyncIterableIterator = pubsub.asyncIterableIterator([topic]) as AsyncIterable<unknown>;

  for await (const _payload of asyncIterableIterator) {
    await assertSplitPublicationAccessible(prisma, splitPublicationAuth, classId);

    yield {
      splitCompetitorsByClassUpdated: await findCompetitorsByClassWithLegacyShape(
        prisma,
        classId,
        true,
      ),
    };
  }
}
