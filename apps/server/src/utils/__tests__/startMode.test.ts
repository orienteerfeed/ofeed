import { describe, expect, it } from 'vitest';

import { resolveEffectiveStartMode } from '@repo/shared';

describe('resolveEffectiveStartMode', () => {
  it('inherits the event default when the class override is null', () => {
    expect(resolveEffectiveStartMode(null, 'StartList')).toBe('StartList');
  });
  it('uses the class override when set', () => {
    expect(resolveEffectiveStartMode('FreeStart', 'StartList')).toBe('FreeStart');
  });
  it('treats undefined override as inherit', () => {
    expect(resolveEffectiveStartMode(undefined, 'MassStart')).toBe('MassStart');
  });
});
