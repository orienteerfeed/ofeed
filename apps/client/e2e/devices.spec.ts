import { expect, test } from '@playwright/test';
import type {} from './fixtures/devices';

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`${viewport.width}px guided device settings`, () => {
    test.use({ viewport });
    test('registers a pasted ID and keeps monitoring independent from reception', async ({
      page,
    }) => {
      await page.goto('/e2e/fixtures/devices.html');
      await expect(
        page.getByRole('heading', { name: 'Devices and radio controls' })
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Register device' })
      ).toBeDisabled();
      await expect(
        page.getByLabel('Heartbeat interval (seconds)', { exact: true })
      ).toBeHidden();
      await expect(page.getByLabel('Meshtastic channel')).toHaveCount(0);
      await page.getByLabel('MAC', { exact: true }).fill('DE:AD:BE:EF:12:34');
      await expect(page.getByLabel('Name (optional)')).toHaveAttribute(
        'placeholder',
        'YAROC deadbeef1234'
      );
      await page.getByRole('button', { name: 'Register device' }).click();
      await expect(
        page.getByRole('button', { name: 'YAROC deadbeef1234', exact: true })
      ).toBeVisible();
      await expect(page.getByText('fixture-token')).toBeHidden();
      await page
        .getByLabel('Monitoring duration (hours, maximum 72)', { exact: true })
        .click();
      await page.getByRole('option', { name: '12 hours', exact: true }).click();
      await page
        .getByRole('button', { name: 'Start monitoring', exact: true })
        .click();
      await expect(
        page.getByLabel('Reception duration (hours, maximum 72)', {
          exact: true,
        })
      ).toHaveText(/24 hours/);
      await expect(
        page.getByRole('button', { name: 'Save YAROC configuration' })
      ).toBeDisabled();
      await page.getByRole('button', { name: 'Start YAROC reception' }).click();
      await expect(
        page.getByRole('button', { name: 'Stop reception' })
      ).toBeEnabled();
      await expect(
        page.getByLabel('Reception duration (hours, maximum 72)', {
          exact: true,
        })
      ).toBeDisabled();
      await page.getByRole('button', { name: 'Stop reception' }).click();
      await expect(
        page.getByLabel('Reception duration (hours, maximum 72)', {
          exact: true,
        })
      ).toBeEnabled();
      const calls = await page.evaluate(
        () => window.deviceSettingsFixture.calls
      );
      expect(
        calls.find(call => call.operation === 'RegisterLiveDevice')?.variables
      ).toMatchObject({
        name: 'YAROC deadbeef1234',
        macAddress: 'deadbeef1234',
        intervalSeconds: 60,
      });
      expect(
        calls.find(call => call.operation === 'StartLiveMonitoring')?.variables
          .hours
      ).toBe(12);
      expect(
        calls.find(call => call.operation === 'StartYaroc')?.variables.hours
      ).toBe(24);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      ).toBe(true);
    });
    test('supports a Meshtastic ID, a custom duration and another broker', async ({
      page,
    }) => {
      await page.goto('/e2e/fixtures/devices.html');
      await page.getByLabel('Device type', { exact: true }).click();
      await page
        .getByRole('option', { name: 'Meshtastic', exact: true })
        .click();
      await page.getByLabel('MAC', { exact: true }).fill('!DEADBEEF');
      await page.getByRole('button', { name: 'Register device' }).click();
      await expect(
        page.getByRole('button', { name: 'Meshtastic deadbeef', exact: true })
      ).toBeVisible();
      await page.getByLabel('Meshtastic channel').fill('club');
      await page
        .getByLabel('Reception duration (hours, maximum 72)', { exact: true })
        .click();
      await page
        .getByRole('option', { name: 'Custom value', exact: true })
        .click();
      await page
        .getByLabel('Reception duration (hours, maximum 72) — Custom value')
        .fill('7');
      await page
        .getByText('Advanced: MQTT connection', { exact: true })
        .click();
      await page.getByLabel('MQTT broker profile').click();
      await page.getByRole('option', { name: 'club', exact: true }).click();
      await page
        .getByRole('button', { name: 'Save YAROC configuration' })
        .click();
      await expect(
        page.getByRole('button', { name: 'Save YAROC configuration' })
      ).toBeDisabled();
      const calls = await page.evaluate(
        () => window.deviceSettingsFixture.calls
      );
      expect(
        calls.find(call => call.operation === 'UpdateEventYarocSettings')
          ?.variables
      ).toMatchObject({
        hours: 7,
        brokerProfile: 'club',
        meshtasticChannel: 'club',
      });
      await page.screenshot({
        path: `/private/tmp/ofeed-device-settings-${viewport.width}.png`,
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      ).toBe(true);
    });
  });
}
