import { expect, test } from '@playwright/test';
import { HomePage } from './pages/home.page';

test.describe('Home page', () => {
  test('loads without errors', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    await expect(home.getNavbar()).toBeVisible();
    await expect(page).toHaveURL('/');
  });

  test('event tabs are visible', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    await expect(home.getTab('ALL')).toBeVisible();
    await expect(home.getTab('TODAY')).toBeVisible();
    await expect(home.getTab('UPCOMING')).toBeVisible();
    await expect(home.getTab('RECENT')).toBeVisible();
  });

  test('switching tabs does not crash the page', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    for (const tab of ['TODAY', 'UPCOMING', 'RECENT', 'ALL'] as const) {
      await home.switchTab(tab);
      await expect(page).not.toHaveURL(/error/);
    }
  });

  test('page title is set', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    await expect(page).toHaveTitle(/.+/);
  });
});
