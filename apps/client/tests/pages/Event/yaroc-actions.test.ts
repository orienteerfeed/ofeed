import { describe, expect, it } from 'vitest';
import { yarocActionState } from '@/pages/Event/Insights/yaroc-actions';
import type { Status } from '@/pages/Event/Insights/event-device-api';
const now = new Date('2026-11-11T12:00:00Z');
const config = {
  hours: 24,
  checkCode: 3,
  startCode: 1,
  finishCode: 2,
  brokerProfile: 'default',
};
function status(): Status {
  return {
    yarocSettings: { ...config, meshtasticChannel: null },
    yarocAvailable: true,
    sessionState: 'stopped',
    sessionUntil: null,
    sessionError: null,
    monitoringUntil: null,
    monitoringStartedAt: null,
    brokerProfiles: ['default'],
    devices: [
      {
        id: 'radio',
        name: 'Radio',
        sourceType: 'yaroc',
        status: 'waiting',
        revoked: false,
        macAddress: 'deadbeef1234',
        intervalSeconds: 60,
        lastSeenAt: null,
      },
    ],
  };
}
describe('YAROC action preconditions', () => {
  it('permits a valid start but only saves changed configuration', () => {
    expect(
      yarocActionState(status(), config, 'Europe/Prague', now)
    ).toMatchObject({ canStart: true, canSave: false, canStop: false });
    expect(
      yarocActionState(status(), { ...config, hours: 12 }, 'Europe/Prague', now)
        .canSave
    ).toBe(true);
  });
  it('excludes revoked devices, invalid MACs, unknown brokers and unavailable receivers', () => {
    const revoked = status();
    revoked.devices[0]!.revoked = true;
    expect(yarocActionState(revoked, config, 'UTC', now).startIssues).toContain(
      'NoRadioDevices'
    );
    const invalid = status();
    invalid.devices[0]!.macAddress = 'bad';
    expect(yarocActionState(invalid, config, 'UTC', now).startIssues).toContain(
      'InvalidRadioDevice'
    );
    expect(
      yarocActionState(
        status(),
        { ...config, brokerProfile: 'unknown' },
        'UTC',
        now
      ).canSave
    ).toBe(false);
    const unavailable = status();
    unavailable.yarocAvailable = false;
    expect(
      yarocActionState(unavailable, { ...config, hours: 12 }, 'UTC', now)
    ).toMatchObject({ canStart: false, canSave: true });
  });
  it('blocks starts for invalid fields and DST-crossing windows', () => {
    for (const invalid of [
      { ...config, hours: 73 },
      { ...config, hours: 1.5 },
      { ...config, startCode: 3 },
      { ...config, meshtasticChannel: 'bad/channel' },
    ])
      expect(yarocActionState(status(), invalid, 'UTC', now).canStart).toBe(
        false
      );
    expect(
      yarocActionState(
        status(),
        config,
        'Europe/Prague',
        new Date('2026-10-24T23:00:00Z')
      ).startIssues
    ).toContain('TimezoneTransition');
  });
  it('allows stopping despite invalid configuration and never treats expired sessions as active', () => {
    const running = status();
    running.sessionState = 'running';
    running.sessionUntil = new Date(+now + 60_000).toISOString();
    expect(
      yarocActionState(running, { ...config, checkCode: 0 }, 'UTC', now)
    ).toMatchObject({ canSave: false, canStart: false, canStop: true });
    running.sessionUntil = now.toISOString();
    expect(yarocActionState(running, config, 'UTC', now)).toMatchObject({
      canStart: true,
      canStop: false,
    });
  });
});
