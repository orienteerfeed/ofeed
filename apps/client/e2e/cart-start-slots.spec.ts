import { expect, test } from '@playwright/test';
import type {} from './fixtures/cart-start-slots';

for (const width of [1280, 390]) {
  test(`cart slots stay exclusive at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/e2e/fixtures/cart-start-slots.html');
    const select = page.locator('button[role="combobox"]');
    await page.locator('input[name="firstname"]').fill('Jan');
    await page.locator('input[name="lastname"]').fill('Novak');
    await page.locator('input[name="birthYear"]').fill('1995');
    await page.getByRole('checkbox').check();
    await select.click();
    await expect(page.getByRole('option')).toHaveCount(2);
    const firstTime = await page.getByRole('option').first().innerText();
    await page.getByRole('option').first().click();
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(
      page.getByRole('heading', { name: 'Entry is in the cart' })
    ).toBeVisible();
    await expect(page.getByTestId('cart-count')).toHaveText('1');

    // Reload uses the unchanged persisted cart format and server availability.
    await page.reload();
    await select.click();
    await expect(page.getByRole('option')).toHaveCount(1);
    await expect(page.getByRole('option')).not.toHaveText(firstTime);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Remove first item' }).click();
    await page.getByRole('button', { name: 'Open entry form' }).click();
    await select.click();
    await expect(page.getByRole('option')).toHaveCount(2);
    await page.getByRole('option', { name: firstTime, exact: true }).click();
    // Another add in this browser invalidates a selection in an open dialog.
    await page.evaluate(() => window.claimFirstCartSlot());
    await expect(select).toContainText('Select a start time');
    await select.click();
    await expect(page.getByRole('option')).toHaveCount(1);
    await expect(page.getByRole('option')).not.toHaveText(firstTime);
  });
}
