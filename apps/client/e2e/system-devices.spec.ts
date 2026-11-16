import { expect, test } from '@playwright/test';
import type {} from './fixtures/system-devices';

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`${viewport.width}px system devices`, () => {
    test.use({ viewport });
    test('creates, assigns, starts, stops and reuses a system device', async ({
      page,
    }) => {
      await page.goto('/e2e/fixtures/system-devices.html');
      await page
        .getByRole('button', { name: 'Add system device', exact: true })
        .click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Name', { exact: true }).fill('Platform radio');
      await dialog.getByLabel('MAC / ID').fill('DE:AD:BE:EF:12:34');
      await dialog
        .getByRole('button', { name: 'Save device', exact: true })
        .click();
      await expect(dialog).toBeHidden();
      await page.getByLabel('Event', { exact: true }).click();
      await page.getByRole('option', { name: /Race Alpha/ }).click();
      await page
        .getByRole('button', { name: 'Assign to selected event', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Start system collection', exact: true })
        .click();
      await expect(
        page.getByRole('button', { name: 'Unassign', exact: true })
      ).toBeDisabled();
      await expect(
        page.getByRole('button', {
          name: 'Stop system collection',
          exact: true,
        })
      ).toBeEnabled();
      await page.getByRole('button', { name: 'Event A fixture' }).click();
      await expect(
        page.getByRole('heading', { name: 'System devices', exact: true })
      ).toBeVisible();
      await page
        .getByRole('button', { name: 'Platform radio', exact: true })
        .click();
      await expect(
        page.getByRole('button', { name: 'Revoke device', exact: true })
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Rotate token', exact: true })
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Start YAROC reception', exact: true })
      ).toBeDisabled();
      await expect(
        page.getByRole('button', { name: 'Stop reception', exact: true })
      ).toBeDisabled();
      await page.getByRole('button', { name: 'Admin fixture' }).click();
      await page.getByLabel('Event', { exact: true }).click();
      await page.getByRole('option', { name: /Race Alpha/ }).click();
      await page
        .getByRole('button', { name: 'Stop system collection', exact: true })
        .click();
      await page.getByRole('button', { name: 'Unassign', exact: true }).click();
      await page.getByLabel('Event', { exact: true }).click();
      await page.getByRole('option', { name: /Race Beta/ }).click();
      await page
        .getByRole('button', { name: 'Assign to selected event', exact: true })
        .click();
      await page.getByRole('button', { name: 'Event A fixture' }).click();
      await expect(
        page.getByRole('heading', { name: 'System devices', exact: true })
      ).toHaveCount(0);
      await page.getByRole('button', { name: 'Event B fixture' }).click();
      await expect(
        page.getByRole('button', { name: 'Platform radio', exact: true })
      ).toBeVisible();
      await page.getByRole('button', { name: 'Admin fixture' }).click();
      await page.getByRole('button', { name: 'Unassign', exact: true }).click();
      await page.getByRole('button', { name: 'Archive', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Restore', exact: true })
      ).toBeVisible();
      await page.getByRole('button', { name: 'Restore', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Archive', exact: true })
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      ).toBe(true);
      await page.screenshot({
        path: `/private/tmp/ofeed-system-devices-${viewport.width}.png`,
        fullPage: true,
      });
    });
  });
}
