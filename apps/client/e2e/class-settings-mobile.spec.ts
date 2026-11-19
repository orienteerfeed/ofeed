import { expect, test } from '@playwright/test';

for (const width of [320, 390, 402, 1280]) {
  test(`class editor scroll stays inside its table at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/e2e/fixtures/class-settings.html');
    const table = page.getByRole('table');
    await expect(table.getByText('D21', { exact: true })).toBeVisible();
    const tabs = page.getByRole('tablist');
    await expect(page.getByRole('tab', { selected: true })).toHaveText(
      'Kategorie'
    );
    for (const tab of await page.getByRole('tab').all())
      await expect(tab).toBeVisible();
    const before = await tabs.boundingBox();
    const geometry = await table.evaluate(element => ({
      pageWidth: document.documentElement.scrollWidth,
      scrollerWidth: element.parentElement!.clientWidth,
      contentWidth: element.parentElement!.scrollWidth,
    }));
    expect(geometry.pageWidth).toBeLessThanOrEqual(width + 1);
    if (width < 640)
      expect(geometry.contentWidth).toBeGreaterThan(geometry.scrollerWidth);
    await table.evaluate(element => {
      element.parentElement!.scrollLeft = element.parentElement!.scrollWidth;
    });
    if (width < 640)
      expect(
        await table.evaluate(element => element.parentElement!.scrollLeft)
      ).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollX)).toBe(0);
    const after = await tabs.boundingBox();
    expect(after!.x).toBeCloseTo(before!.x, 0);
    expect(after!.width).toBeCloseTo(before!.width, 0);
    const fits = await page.locator('[data-navbar]').evaluateAll(elements =>
      elements.every(element => {
        const rect = element.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= window.innerWidth + 1;
      })
    );
    expect(fits).toBe(true);
    const actions = table.locator('tbody tr').first().locator('td').last();
    await expect(actions.getByRole('button').first()).toBeInViewport();
    if (width === 390)
      await page.screenshot({
        path: test.info().outputPath('class-table-scroll.png'),
      });
  });
}
