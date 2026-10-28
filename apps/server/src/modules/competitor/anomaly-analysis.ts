import {
  resolveEffectiveStartMode,
  type AnomalyCompetitor,
  type AnomalyCoverage,
  type AnomalyFinding,
  type EventAnomalyInsight,
  type StartMode,
} from '@repo/shared';

export type AnalysisCompetitor = {
  id: number;
  firstname: string;
  lastname: string;
  registration: string;
  bibNumber: number | null;
  card: number | null;
  organisation: { name: string } | null;
  startTime: Date | null;
  status: string;
  splits: { controlCode: number; time: number | null }[];
  punches: { punchTime: Date }[];
};
export type AnalysisClass = {
  id: number;
  name: string;
  startMode: StartMode | null;
  resultListMode: string | null;
  course: {
    courseControls: {
      controlCode: string;
      sequence: number;
      type: string | null;
      control: { type: string } | null;
    }[];
  } | null;
  competitors: AnalysisCompetitor[];
};

const finding = (
  type: AnomalyFinding['type'],
  evidence: Partial<AnomalyFinding>,
): AnomalyFinding => ({
  type,
  controlCode: null,
  splitSeconds: null,
  medianSeconds: null,
  differenceSeconds: null,
  referenceCount: null,
  intervalSeconds: null,
  phaseSeconds: null,
  nearestStartTime: null,
  punchTimes: [],
  ...evidence,
});
const median = (sorted: number[]) =>
  (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2;
const modulo = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;

/** Sorted absolute timestamps; duplicate wave times do not weight the inference. */
export function inferStartGrid(timestamps: number[]): { interval: number; phase: number } | null {
  const times = [...new Set(timestamps)].sort((a, b) => a - b);
  if (times.length < 5) return null;
  const gaps = new Map<number, number>();
  for (let i = 1; i < times.length; i++) {
    const gap = times[i] - times[i - 1];
    gaps.set(gap, (gaps.get(gap) ?? 0) + 1);
  }
  const ranked = [...gaps].sort((a, b) => b[1] - a[1]);
  const [interval, count] = ranked[0];
  if (interval < 10_000 || count < 3 || ranked[1]?.[1] === count) return null;

  const phases = new Map<number, number>();
  for (const time of times) {
    const phase = modulo(time, interval);
    phases.set(phase, (phases.get(phase) ?? 0) + 1);
  }
  const rankedPhases = [...phases].sort((a, b) => b[1] - a[1]);
  const [phase, phaseCount] = rankedPhases[0];
  if (rankedPhases[1]?.[1] === phaseCount) return null;
  const support = times.filter((time) => {
    const remainder = modulo(time - phase, interval);
    return Math.min(remainder, interval - remainder) <= 1000;
  }).length;
  if (support / times.length < 0.8) return null;
  return { interval, phase };
}

function firstControl(category: AnalysisClass): {
  code: number | null;
  status: AnomalyCoverage['status'];
} {
  const ordinary = category.course?.courseControls
    .filter((control) => (control.type ?? control.control?.type ?? 'CONTROL') === 'CONTROL')
    .sort((a, b) => a.sequence - b.sequence);
  if (!ordinary?.length || !/^\d+$/.test(ordinary[0].controlCode)) {
    return { code: null, status: 'NO_COURSE' };
  }
  const code = Number(ordinary[0].controlCode);
  if (code <= 0 || code > 2_147_483_647) return { code: null, status: 'NO_COURSE' };
  if (ordinary.filter((control) => Number(control.controlCode) === code).length !== 1) {
    return { code: null, status: 'AMBIGUOUS_FIRST_CONTROL' };
  }
  return { code, status: 'EVALUATED' };
}

export function analyzeEventAnomalies(
  event: { defaultStartMode: StartMode; eventFormat: string },
  classes: AnalysisClass[],
): EventAnomalyInsight {
  const competitors: AnomalyCompetitor[] = [];
  const coverage: AnomalyCoverage[] = [];
  for (const category of classes) {
    const mode = resolveEffectiveStartMode(category.startMode, event.defaultStartMode);
    const rows = new Map(
      category.competitors.map((competitor) => [
        competitor.id,
        {
          id: competitor.id,
          firstname: competitor.firstname,
          lastname: competitor.lastname,
          registration: competitor.registration,
          bibNumber: competitor.bibNumber,
          card: competitor.card,
          organisation: competitor.organisation?.name ?? null,
          classId: category.id,
          className: category.name,
          startMode: mode,
          startTime: competitor.startTime?.toISOString() ?? null,
          findings: [] as AnomalyFinding[],
        },
      ]),
    );
    const record = (
      type: AnomalyFinding['type'],
      status: AnomalyCoverage['status'],
      evaluated = 0,
    ) =>
      coverage.push({
        classId: category.id,
        className: category.name,
        type,
        status,
        evaluated,
        total: category.competitors.length,
      });

    const first = firstControl(category);
    const ordered =
      event.eventFormat === 'Standard' &&
      (!category.resultListMode || category.resultListMode === 'Default');
    if (!ordered || first.code === null) {
      record('FAST_FIRST_SPLIT', !ordered ? 'UNSUPPORTED_MODE' : first.status);
    } else {
      const valid = category.competitors.flatMap((competitor) => {
        const matching = competitor.splits.filter((split) => split.controlCode === first.code);
        const time = matching[0]?.time;
        return matching.length === 1 && time !== null && time !== undefined && time > 0
          ? [{ competitor, time }]
          : [];
      });
      const references = valid
        .filter(({ competitor }) => ['OK', 'Finished'].includes(competitor.status))
        .sort((a, b) => a.time - b.time || a.competitor.id - b.competitor.id);
      const positions = new Map(references.map(({ competitor }, index) => [competitor.id, index]));
      let evaluated = 0;
      for (const { competitor, time } of valid) {
        const excluded = positions.get(competitor.id);
        const size = references.length - (excluded === undefined ? 0 : 1);
        if (size < 8) continue;
        evaluated++;
        // Leave-one-out median in constant time; MAD is needed only for fast candidates.
        const at = (index: number) =>
          references[index + (excluded !== undefined && index >= excluded ? 1 : 0)].time;
        const center = (at(Math.floor((size - 1) / 2)) + at(Math.floor(size / 2))) / 2;
        if (time >= center * 0.5 || center - time < 30) continue;
        const deviations = references
          .filter((_, index) => index !== excluded)
          .map((reference) => Math.abs(reference.time - center))
          .sort((a, b) => a - b);
        if (time < center - 3 * median(deviations)) {
          rows.get(competitor.id)!.findings.push(
            finding('FAST_FIRST_SPLIT', {
              controlCode: first.code,
              splitSeconds: time,
              medianSeconds: center,
              differenceSeconds: center - time,
              referenceCount: size,
            }),
          );
        }
      }
      record('FAST_FIRST_SPLIT', evaluated ? 'EVALUATED' : 'INSUFFICIENT_DATA', evaluated);
    }

    if (mode === 'StartList' || mode === 'WaveStart') {
      const timed = category.competitors.filter((competitor) => competitor.startTime !== null);
      const grid = inferStartGrid(timed.map((competitor) => competitor.startTime!.getTime()));
      if (grid) {
        for (const competitor of timed) {
          const time = competitor.startTime!.getTime();
          const nearest =
            Math.round((time - grid.phase) / grid.interval) * grid.interval + grid.phase;
          if (Math.abs(time - nearest) > 1000) {
            rows.get(competitor.id)!.findings.push(
              finding('OFF_START_GRID', {
                intervalSeconds: grid.interval / 1000,
                phaseSeconds: grid.phase / 1000,
                differenceSeconds: (time - nearest) / 1000,
                nearestStartTime: new Date(nearest).toISOString(),
              }),
            );
          }
        }
      }
      record(
        'OFF_START_GRID',
        grid
          ? 'EVALUATED'
          : new Set(timed.map((competitor) => competitor.startTime!.getTime())).size < 5
            ? 'INSUFFICIENT_DATA'
            : 'NO_RELIABLE_GRID',
        grid ? timed.length : 0,
      );
      let observed = 0;
      for (const competitor of category.competitors) {
        if (!competitor.punches.length) continue;
        observed++;
        rows.get(competitor.id)!.findings.push(
          finding('START_PUNCH', {
            punchTimes: competitor.punches.map((punch) => punch.punchTime.toISOString()).sort(),
          }),
        );
      }
      // Only competitors with actual observations have evidence for this check.
      record('START_PUNCH', observed ? 'EVALUATED' : 'INSUFFICIENT_DATA', observed);
    } else {
      record('OFF_START_GRID', 'UNSUPPORTED_MODE');
      record('START_PUNCH', 'UNSUPPORTED_MODE');
    }
    competitors.push(...[...rows.values()].filter((row) => row.findings.length > 0));
  }
  competitors.sort(
    (a, b) =>
      a.className.localeCompare(b.className) ||
      a.lastname.localeCompare(b.lastname) ||
      a.firstname.localeCompare(b.firstname) ||
      a.id - b.id,
  );
  coverage.sort(
    (a, b) =>
      a.className.localeCompare(b.className) ||
      a.classId - b.classId ||
      a.type.localeCompare(b.type),
  );
  return { competitors, coverage };
}
