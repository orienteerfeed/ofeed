import { expect, test } from '@playwright/test';
import type {} from './fixtures/favorites';

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`${viewport.width}px competitor favorites`, () => {
    test.use({ viewport });
    test('manages persistent following from profile, including pause, resume and cancellation', async ({
      page,
    }) => {
      await page.goto('/e2e/fixtures/favorites.html?user=7');
      await page
        .getByRole('button', { name: 'Add to favorites', exact: true })
        .first()
        .click();
      await page.getByRole('link', { name: 'Manage following' }).click();
      await expect(page).toHaveURL(/\/profile$/);
      await expect(page.getByText('TST9001')).toBeVisible();
      await page
        .getByRole('button', { name: 'Pause following: Runner 1 Test' })
        .click();
      await expect(page.getByText('Paused', { exact: true })).toBeVisible();
      await page.evaluate(() => window.favoritesFixture.update(1));
      await expect(
        page.getByRole('button', { name: 'Notifications: 0 unread' })
      ).toBeVisible();
      await page
        .getByRole('button', { name: 'Resume following: Runner 1 Test' })
        .click();
      await expect(page.getByText('Active', { exact: true })).toBeVisible();
      await page.evaluate(() => window.favoritesFixture.update(1));
      await expect(
        page.getByRole('button', { name: 'Notifications: 1 unread' })
      ).toBeVisible();
      await page
        .getByRole('button', { name: 'Stop following: Runner 1 Test' })
        .click();
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Keep following' })
        .click();
      await expect(page.getByText('TST9001')).toBeVisible();
      await page
        .getByRole('button', { name: 'Stop following: Runner 1 Test' })
        .click();
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Stop following', exact: true })
        .click();
      await expect(page.getByText(/No registration follows yet/)).toBeVisible();
      await page.getByRole('link', { name: 'Back to event' }).click();
      await expect(page.getByText(/No favorites yet/)).toBeVisible();
    });
    test('persists guest stars, shows the selected competitors and removes them', async ({
      page,
    }) => {
      await page.goto('/e2e/fixtures/favorites.html');
      await page
        .getByRole('button', { name: 'Add to favorites', exact: true })
        .first()
        .click();
      await page.reload();
      await expect(
        page.getByRole('button', { name: 'Remove from favorites' })
      ).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('tab', { name: 'Favorites' }).click();
      await expect(
        page.getByRole('heading', { name: /Runner 1/ })
      ).toBeVisible();
      await expect(page.getByRole('heading', { name: /Runner 2/ })).toHaveCount(
        0
      );
      await expect(page.getByText(/only in this browser/)).toBeVisible();
      await page.getByRole('button', { name: 'Remove from favorites' }).click();
      await expect(page.getByText(/No favorites yet/)).toBeVisible();
    });
    test('keeps guest and account selection separate and opens a competitor notification', async ({
      page,
    }) => {
      await page.goto('/e2e/fixtures/favorites.html');
      await page
        .getByRole('button', { name: 'Add to favorites', exact: true })
        .first()
        .click();
      await page.evaluate(() => window.favoritesFixture.account(7));
      await expect(
        page.getByRole('button', { name: 'Add to favorites', exact: true })
      ).toHaveCount(2);
      await page
        .getByRole('button', { name: 'Add to favorites', exact: true })
        .nth(1)
        .click();
      await page.getByRole('tab', { name: 'Favorites' }).click();
      await expect(
        page.getByRole('heading', { name: /Runner 2/ })
      ).toBeVisible();
      await expect(page.getByText(/followed across events/)).toBeVisible();
      await page.evaluate(() => window.favoritesFixture.update(2));
      await page
        .getByRole('button', { name: 'Notifications: 1 unread' })
        .click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: /Result changed/ })
        .click();
      await expect(page).toHaveURL(/\/events\/race\?tab=favorites$/);
      await expect(
        page.getByRole('heading', { name: /Runner 2/ })
      ).toBeVisible();
      await page.evaluate(() => window.favoritesFixture.account(8));
      await expect(page.getByText(/No favorites yet/)).toBeVisible();
      await page.evaluate(() => window.favoritesFixture.account(null));
      await expect(
        page.getByRole('heading', { name: /Runner 1/ })
      ).toBeVisible();
      await expect(page.getByRole('heading', { name: /Runner 2/ })).toHaveCount(
        0
      );
    });
  });
}
