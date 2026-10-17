import { expect, test } from '@playwright/test';

test('container runtime configuration is public and uncached', async ({
  request,
}) => {
  test.skip(!process.env.E2E_BASE_URL, 'Container qualification only');
  const response = await request.get('/runtime-config.js');
  expect(response.ok()).toBeTruthy();
  expect(response.headers()['cache-control']).toContain('no-store');
  const source = await response.text();
  expect(source).toContain('__OFEED_RUNTIME_CONFIG__');
  expect(source).not.toMatch(
    /DATABASE_URL|JWT_TOKEN_SECRET_KEY|ENCRYPTION_SECRET_KEY/
  );
});

test('published board mounts and uses its configured API proxy', async ({
  page,
  request,
}) => {
  test.skip(!process.env.E2E_BOARD_URL, 'Container qualification only');
  const board = process.env.E2E_BOARD_URL!;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(board);
  await expect(page.locator('#app')).not.toBeEmpty();
  expect(errors).toEqual([]);
  const config = await request.get(`${board}/runtime-config.js`);
  expect(config.headers()['cache-control']).toContain('no-store');
  expect(await config.text()).toContain('/api/ofeed');
  expect((await request.get(`${board}/api/ofeed/readyz`)).ok()).toBeTruthy();
});
