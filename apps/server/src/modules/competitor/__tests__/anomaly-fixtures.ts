import type { AnalysisClass, AnalysisCompetitor } from '../anomaly-analysis.js';

export const event = { defaultStartMode: 'StartList', eventFormat: 'Standard' } as const;
export const competitor = (
  id: number,
  overrides: Partial<AnalysisCompetitor> = {},
): AnalysisCompetitor => ({
  id,
  firstname: 'Jan',
  lastname: `Runner ${id}`,
  registration: `REG${id}`,
  bibNumber: id,
  card: 1000 + id,
  organisation: null,
  startTime: new Date(Date.UTC(2026, 9, 28, 10, id)),
  status: 'OK',
  splits: [{ controlCode: 31, time: 100 }],
  punches: [],
  ...overrides,
});
export const category = (overrides: Partial<AnalysisClass> = {}): AnalysisClass => ({
  id: 1,
  name: 'H21',
  startMode: null,
  resultListMode: null,
  course: {
    courseControls: [
      { controlCode: 'S', sequence: 1, type: 'START', control: null },
      { controlCode: '99', sequence: 2, type: 'CROSSING_POINT', control: null },
      { controlCode: '31', sequence: 3, type: 'CONTROL', control: null },
      { controlCode: '32', sequence: 4, type: null, control: { type: 'CONTROL' } },
      { controlCode: 'F', sequence: 5, type: 'FINISH', control: null },
    ],
  },
  competitors: Array.from({ length: 9 }, (_, index) => competitor(index + 1)),
  ...overrides,
});
