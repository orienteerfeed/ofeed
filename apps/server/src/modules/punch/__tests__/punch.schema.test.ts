import { describe, expect, it } from 'vitest';
import { punchBatchSchema } from '../punch.schema.js';
import { elapsedSeconds, matchPunch } from '../punch-matching.js';

const punch = {
  clientPunchId: 'b42c66e5-98f7-4f1b-9fd6-0d436660b624',
  card: 8123456,
  controlCode: 31,
  punchTime: '2026-05-17T11:26:15.123+02:00',
  receivedAt: '2026-05-17T09:26:16.120Z',
};

describe('punch contract', () => {
  it('accepts both sources, special codes and offset timestamps', () => {
    for (const source of ['SRR', 'READOUT'])
      for (const controlCode of [-2, -1, 0, 31]) {
        expect(
          punchBatchSchema.safeParse({
            source,
            deviceId: 'dongle',
            punches: [{ ...punch, controlCode }],
          }).success,
        ).toBe(true);
      }
  });
  it('bounds batches and rejects invalid identifiers, codes, cards and lossy timestamps', () => {
    const batch = { source: 'SRR', deviceId: 'dongle', punches: [punch] };
    for (const punches of [[], Array(201).fill(punch)])
      expect(punchBatchSchema.safeParse({ ...batch, punches }).success).toBe(false);
    expect(punchBatchSchema.safeParse({ ...batch, punches: Array(200).fill(punch) }).success).toBe(
      true,
    );
    for (const invalid of [
      { clientPunchId: 'x' },
      { card: 0 },
      { card: 4_294_967_296 },
      { controlCode: -3 },
      { controlCode: 1.5 },
      { stationSerial: -1 },
      { punchTime: '2026-05-17T11:26:15' },
      { punchTime: '2026-05-17T11:26:15.1234Z' },
    ]) {
      expect(
        punchBatchSchema.safeParse({ ...batch, punches: [{ ...punch, ...invalid }] }).success,
      ).toBe(false);
    }
  });
});

describe('card race windows', () => {
  const at = (hour: number) => new Date(`2026-05-17T${String(hour).padStart(2, '0')}:00:00Z`);
  const candidate = (id: number, start: number | null, finish: number | null) => ({
    id,
    startTime: start === null ? null : at(start),
    finishTime: finish === null ? null : at(finish),
  });
  it('matches a unique card without bounds', () => {
    expect(matchPunch(at(11), [candidate(1, null, null)])).toBe(1);
    expect(matchPunch(at(11), [])).toBeNull();
  });
  it('uses inclusive finishes and exclusive next starts', () => {
    const candidates = [candidate(1, 8, null), candidate(2, 10, 12)];
    expect(matchPunch(at(9), candidates)).toBe(1);
    expect(matchPunch(at(10), candidates)).toBe(2);
    expect(matchPunch(at(12), candidates)).toBe(2);
    expect(matchPunch(at(13), candidates)).toBeNull();
  });
  it('does not guess across overlaps, ties or missing bounds', () => {
    expect(matchPunch(at(11), [candidate(1, 8, 12), candidate(2, 10, 13)])).toBeNull();
    expect(matchPunch(at(11), [candidate(1, 8, 12), candidate(2, 8, 13)])).toBeNull();
    expect(matchPunch(at(11), [candidate(1, 8, null), candidate(2, null, null)])).toBeNull();
  });
  it('calculates whole elapsed seconds across midnight and timezone offsets', () => {
    expect(
      elapsedSeconds(
        new Date('2026-05-18T00:00:01.100+02:00'),
        new Date('2026-05-17T21:59:59.900Z'),
      ),
    ).toBe(1);
    expect(elapsedSeconds(at(8), at(9))).toBeNull();
    expect(elapsedSeconds(at(8), null)).toBeNull();
  });
});
