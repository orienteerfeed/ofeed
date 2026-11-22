import { expect, test } from '@playwright/test';
import type {} from './fixtures/notifications';

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`${viewport.width}px notification inbox`, () => {
    test.use({ viewport });
    test('receives a new order, opens it and persists its read state across views', async ({
      page,
    }) => {
      await page.goto('/e2e/fixtures/notifications.html');
      await expect(
        page.getByRole('button', { name: 'Notifications: 25 unread' })
      ).toBeVisible();
      await page.evaluate(() => window.notificationFixture.add('new-order'));
      await page
        .getByRole('button', { name: 'Notifications: 26 unread' })
        .click();
      const dialog = page.getByRole('dialog');
      await expect(
        dialog.getByText('Race new-order', { exact: true })
      ).toBeVisible();
      await dialog.getByRole('button', { name: /Race new-order/ }).click();
      await expect(page).toHaveURL(/\/events\/race\/entries\/new-order$/);
      await expect(
        page.getByRole('heading', { name: 'Order detail' })
      ).toBeVisible();
      await page.goBack();
      await page
        .getByRole('button', { name: 'Notifications: 25 unread' })
        .click();
      await expect(
        page
          .getByRole('dialog')
          .getByRole('button', { name: /Race new-order/ })
          .getByLabel('Unread')
      ).toHaveCount(0);
    });
    test('paginates history, marks all read and recovers from transport failure', async ({
      page,
    }) => {
      await page.goto('/e2e/fixtures/notifications.html');
      await page
        .getByRole('button', { name: 'Notifications: 25 unread' })
        .click();
      await page.getByRole('link', { name: 'View all notifications' }).click();
      await expect(page).toHaveURL(/\/notifications$/);
      const main = page.getByRole('main');
      await expect(
        main.getByRole('button', { name: /New entry order/ })
      ).toHaveCount(20);
      await main.getByRole('button', { name: 'Next', exact: true }).click();
      await expect(
        main.getByRole('button', { name: /New entry order/ })
      ).toHaveCount(5);
      await main.getByRole('button', { name: 'Previous', exact: true }).click();
      await main.getByRole('button', { name: 'Mark all read' }).click();
      await expect(
        main.getByRole('button', { name: 'Mark all read' })
      ).toHaveCount(0);
      await page.evaluate(() => window.notificationFixture.fail(true));
      await expect(main.getByRole('alert')).toContainText(
        'Could not load notifications'
      );
      await page.evaluate(() => window.notificationFixture.fail(false));
      await expect(main.getByRole('alert')).toHaveCount(0);
      await expect(
        main.getByText('Race order-25', { exact: true })
      ).toBeVisible();
    });
  });
}
