import { describe, expect, it } from 'vitest';

import { changelogQuerySchema } from '../event.schema.js';

describe('changelogQuerySchema', () => {
  it('parses group=true query strings as booleans', () => {
    const result = changelogQuerySchema.parse({ group: 'true' });

    expect(result.group).toBe(true);
  });

  it('parses group=false query strings as booleans', () => {
    const result = changelogQuerySchema.parse({ group: 'false' });

    expect(result.group).toBe(false);
  });

  it('rejects non-boolean group query strings', () => {
    const result = changelogQuerySchema.safeParse({ group: 'group' });

    expect(result.success).toBe(false);
  });
});
