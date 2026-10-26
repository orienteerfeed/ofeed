import { expect, test } from './fixtures/auth.fixture';

test.describe('Device sessions', () => {
  test('restores authentication after reload and renews concurrent tabs', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/profile');
    await expect(page).toHaveURL('/profile');
    await page.reload();
    await expect(page.getByRole('tab', { name: /security/i })).toBeVisible();
    const other = await page.context().newPage();
    await Promise.all([page.reload(), other.goto('/profile')]);
    await expect(other.getByRole('tab', { name: /security/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /security/i })).toBeVisible();
    await other.close();
  });

  test('shows the current device and revokes it from profile settings', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/profile');
    await page.getByRole('tab', { name: /security/i }).click();
    await expect(
      page.getByText('Device sessions', { exact: true })
    ).toBeVisible();
    const current = page
      .getByRole('group')
      .filter({ hasText: '(This device)' });
    await current.getByRole('button', { name: 'Revoke device' }).click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Revoke device' })
      .click();
    await page.reload();
    await expect(page).toHaveURL(/\/auth\/signin/);
  });
});
