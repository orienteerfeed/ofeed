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

  it('accepts supported competition format and default start mode', () => {
    const result = eventWriteSchema.safeParse({
      ...basePayload,
      eventFormat: 'Standard',
      defaultStartMode: 'MassStart',
    });

    expect(result.success).toBe(true);
  });

  it('rejects an unsupported default start mode', () => {
    const result = eventWriteSchema.safeParse({
      ...basePayload,
      defaultStartMode: 'INTERVAL',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an unsupported competition format', () => {
    const result = eventWriteSchema.safeParse({
      ...basePayload,
      eventFormat: 'Relay',
    });

    expect(result.success).toBe(false);
  });
});
