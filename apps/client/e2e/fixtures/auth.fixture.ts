import { test as base, type Page } from '@playwright/test';
import { AuthPage } from '../pages/auth.page';

// Each context owns a fresh token family. Reusing saved rotating refresh cookies
// across parallel tests would correctly trigger refresh-token reuse detection.
export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await new AuthPage(page).signIn(
      process.env.E2E_USER_EMAIL ?? 'test@example.com',
      process.env.E2E_USER_PASSWORD ?? 'password'
    );
    await page.waitForURL('/');
    await use(page);
    await context.close();
  },
});
export { expect } from '@playwright/test';
