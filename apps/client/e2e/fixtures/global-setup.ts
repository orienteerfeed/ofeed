import { chromium } from '@playwright/test';
import { AUTH_FILE } from './auth.fixture';

// Runs once before all tests — saves authenticated session to disk
async function globalSetup() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('http://localhost:3000/auth/signin');
  await page.locator('input[type="email"]').fill(process.env.E2E_USER_EMAIL ?? 'test@example.com');
  await page.locator('input[type="password"]').fill(process.env.E2E_USER_PASSWORD ?? 'password');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('/');

  await page.context().storageState({ path: AUTH_FILE });
  await browser.close();
}

export default globalSetup;
