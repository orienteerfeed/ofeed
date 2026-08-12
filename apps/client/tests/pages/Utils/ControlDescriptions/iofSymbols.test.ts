import { describe, expect, it } from 'vitest';

import {
  collectUnmappedSymbols,
  IOF_2004_TO_2018,
  resolve2018Ref,
  START_SYMBOL,
  SYMBOL_URLS,
} from '../../../../src/pages/Utils/ControlDescriptions/iofSymbols';
import type { Course } from '../../../../src/pages/Utils/ControlDescriptions/ppen';

describe('resolve2018Ref', () => {
  it('keeps the direction of column C arrows apart', () => {
    // The Python original collapsed these onto one key, printing an arbitrary direction.
    expect(resolve2018Ref('0.1E')).toBe('0.1E');
    expect(resolve2018Ref('0.1N')).toBe('0.1N');
    expect(resolve2018Ref('0.1S')).toBe('0.1S');
    expect(resolve2018Ref('0.1W')).toBe('0.1W');
    expect(resolve2018Ref('0.2NE')).toBe('0.2NE');
  });

  it('passes through references numbered the same in both standards', () => {
    expect(resolve2018Ref('1.10')).toBe('1.10');
    expect(resolve2018Ref('5.19')).toBe('5.19');
    expect(resolve2018Ref('8.6')).toBe('8.6');
    expect(resolve2018Ref('10.2')).toBe('10.2');
  });

  it('renumbers column G, keeping the direction', () => {
    expect(resolve2018Ref('11.2W')).toBe('12.2W');
    expect(resolve2018Ref('11.1NE')).toBe('12.1NE');
    expect(resolve2018Ref('11.4N')).toBe('12.4N');
    expect(resolve2018Ref('11.6S')).toBe('12.6S');
    expect(resolve2018Ref('11.8N')).toBe('12.7N');
    expect(resolve2018Ref('11.14S')).toBe('12.12S');
  });

  it('renumbers non-directional column G references', () => {
    expect(resolve2018Ref('11.11')).toBe('12.10');
    expect(resolve2018Ref('11.13')).toBe('12.11');
    expect(resolve2018Ref('11.15')).toBe('12.14');
  });

  it('renumbers column H', () => {
    expect(resolve2018Ref('12.1')).toBe('13.1');
    expect(resolve2018Ref('12.2')).toBe('13.2');
    expect(resolve2018Ref('12.3')).toBe('13.3');
  });

  it('maps the finish group instead of matching 2018 "timed start"', () => {
    // 2018 names 14.1 "Timed start to start triangle", so an exact match here would
    // print a start symbol on the finish row.
    expect(resolve2018Ref('14.1')).toBe('16.1');
    expect(resolve2018Ref('14.3')).toBe('16.3');
  });

  it('returns null for references it cannot map with confidence', () => {
    expect(resolve2018Ref('13.6')).toBeNull();
    expect(resolve2018Ref('11.7')).toBeNull();
    expect(resolve2018Ref('11.12')).toBeNull();
    expect(resolve2018Ref('99.9')).toBeNull();
    expect(resolve2018Ref('')).toBeNull();
  });

  it('does not drop a direction to reach a bare symbol', () => {
    // 11.1 means "side" in 2004, but a bare 12.1 does not exist and the file keyed 11.1
    // is "Bend" - printing either would be wrong, so it stays unresolved.
    expect(resolve2018Ref('11.1')).toBeNull();
  });
});

describe('symbol assets', () => {
  it('bundles the start triangle and the full symbol set', () => {
    expect(Object.keys(SYMBOL_URLS)).toContain(START_SYMBOL);
    expect(Object.keys(SYMBOL_URLS).length).toBeGreaterThan(170);
  });

  it('has an asset behind every mapping table target', () => {
    // Guards the table against typos and against the asset set changing underneath it.
    const keys = Object.keys(SYMBOL_URLS);
    const directional = /^(\d+\.\d+)$/;

    for (const target of Object.values(IOF_2004_TO_2018)) {
      const exists =
        keys.includes(target) ||
        keys.some(key => directional.test(target) && key.startsWith(target));
      expect(exists, `no asset for mapping target ${target}`).toBe(true);
    }
  });
});

const courseWith = (name: string, refs: string[]): Course => ({
  id: 1,
  name,
  length: 1,
  climb: null,
  rows: refs.map((ref, index) => ({
    order: index + 1,
    code: 30 + index,
    boxes: { G: ref },
    allBox: null,
  })),
});

describe('collectUnmappedSymbols', () => {
  it('reports each unmapped reference once, with a count', () => {
    const unmapped = collectUnmappedSymbols([
      courseWith('Trať 1', ['11.2W', '13.6', '13.6']),
      courseWith('Trať 2', ['13.6', '11.7']),
    ]);

    expect(unmapped).toEqual([
      { ref: '13.6', count: 3 },
      { ref: '11.7', count: 1 },
    ]);
  });

  it('says nothing when every reference resolves', () => {
    expect(collectUnmappedSymbols([courseWith('Trať 1', ['11.2W'])])).toEqual(
      []
    );
  });
});
