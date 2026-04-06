import { describe, expect, it } from 'vitest';

import { eventWriteSchema } from '../validateEvent.js';

describe('eventWriteSchema', () => {
  const basePayload = {
    sportId: 1,
    name: 'Postman Event',
    date: '2026-04-06T12:00:00.000Z',
    timezone: 'Europe/Prague',
    organizer: 'Postman Club',
    location: 'Prague',
    zeroTime: '10:00:00',
  };

  it('accepts supported start modes', () => {
    const result = eventWriteSchema.safeParse({
      ...basePayload,
      startMode: 'Individual',
    });

    expect(result.success).toBe(true);
  });

  it('rejects unsupported start modes', () => {
    const result = eventWriteSchema.safeParse({
      ...basePayload,
      startMode: 'INTERVAL',
    });

    expect(result.success).toBe(false);
  });
});
