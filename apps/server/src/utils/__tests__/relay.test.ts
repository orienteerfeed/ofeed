import { describe, expect, it } from 'vitest';

import { isRelayDiscipline } from '../relay.js';

describe('isRelayDiscipline', () => {
  it.each(['RELAY', 'SPRINT_RELAY', 'TEAMS'])('returns true for %s', (discipline) => {
    expect(isRelayDiscipline(discipline)).toBe(true);
  });

  it.each(['SPRINT', 'MIDDLE', 'LONG', 'OTHER', null, undefined])(
    'returns false for %s',
    (discipline) => {
      expect(isRelayDiscipline(discipline)).toBe(false);
    },
  );
});
