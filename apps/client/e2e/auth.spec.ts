import { expect, test } from '@playwright/test';
import { AuthPage } from './pages/auth.page';

test.describe('Authentication', () => {
  test('sign in page loads', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.gotoSignIn();

    await expect(auth.getEmailField()).toBeVisible();
    // Password field hidden until email filled (progressive disclosure)
    await expect(auth.getPasswordField()).not.toBeVisible();
  });

  test('password field appears after email is filled', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.gotoSignIn();

    await auth.getEmailField().fill('user@example.com');
    await expect(auth.getPasswordField()).toBeVisible();
  });

  test('forgot password link is visible after email filled', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.gotoSignIn();

    await auth.getEmailField().fill('user@example.com');
    await expect(auth.getForgotPasswordLink()).toBeVisible();
  });

  test('sign up link is present', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.gotoSignIn();

    await expect(auth.getSignUpLink()).toBeVisible();
  });

  test('forgot password page shows success state after submission', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.submitForgotPassword('user@example.com');

    // Success state shows checkmark icon
    await expect(auth.getSuccessCheckIcon()).toBeVisible({ timeout: 5000 });
  });

  test('invalid credentials show error toast', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.signIn('wrong@example.com', 'wrongpassword');

    await expect(page.getByRole('status').or(page.locator('[data-sonner-toast]'))).toBeVisible({
      timeout: 5000,
    });
  });

  test('redirect to home after successful sign in', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.signIn(
      process.env.E2E_USER_EMAIL ?? 'test@example.com',
      process.env.E2E_USER_PASSWORD ?? 'password'
    );

    await page.waitForURL('/');
    await expect(page).toHaveURL('/');
  });
});
