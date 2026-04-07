import { describe, expect, it } from 'vitest';

import { parseBooleanEnvValue } from '../env.js';

describe('parseBooleanEnvValue', () => {
  it.each([
    ['true', true],
    ['TRUE', true],
    ['1', true],
    ['yes', true],
    ['on', true],
    ['false', false],
    ['FALSE', false],
    ['0', false],
    ['no', false],
    ['off', false],
  ])('parses %s as %s', (value, expected) => {
    expect(parseBooleanEnvValue(value)).toBe(expected);
  });

  it('preserves unsupported values for schema validation', () => {
    expect(parseBooleanEnvValue('maybe')).toBe('maybe');
    expect(parseBooleanEnvValue(undefined)).toBeUndefined();
  });
});
