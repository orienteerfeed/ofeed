import { expect, test } from '@playwright/test';

for (const width of [320, 390, 402]) {
  test.describe(`${width}px compact results`, () => {
    test.use({ viewport: { width, height: 874 } });
    for (const view of ['category', 'club', 'relay', 'live']) {
      test(`${view} fits every mobile column inside the padded display`, async ({
        page,
      }) => {
        await page.goto(
          `/e2e/fixtures/results-refresh.html?view=${view}&sticky&compact&ranking&class=H21`
        );
        await expect(page.locator('tbody tr').first()).toBeVisible();
        if (view === 'club' || view === 'live') {
          await page
            .getByRole('button', { name: view === 'club' ? /Club/ : /Live/ })
            .first()
            .click();
        }
        const table = page.locator('table').first();
        const geometry = await table.evaluate(element => {
          const scroller = element.parentElement!;
          const visible = [...element.querySelectorAll('thead th')].filter(
            cell => cell.getBoundingClientRect().width > 0
          );
          const rows = [...element.querySelectorAll('tbody tr')];
          return {
            scrollWidth: scroller.scrollWidth,
            width: scroller.clientWidth,
            tableWidth: element.getBoundingClientRect().width,
            headers: visible.map(cell => cell.textContent?.trim()),
            // Only name cells may truncate; times/ranks must remain complete.
            clipped: rows.flatMap(row =>
              [...row.querySelectorAll('td')].flatMap((cell, index) => {
                if (index === 1 || !cell.getBoundingClientRect().width)
                  return [];
                return cell.scrollWidth > cell.clientWidth + 1
                  ? [cell.textContent]
                  : [];
              })
            ),
          };
        });
        // Below 320px of available table space, scrolling is intentional.
        if (width > 320)
          expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width + 1);
        else expect(geometry.scrollWidth).toBeGreaterThan(geometry.width);
        expect(geometry.headers.length).toBeGreaterThanOrEqual(5);
        expect(geometry.clipped).toEqual([]);
        if (view === 'category') {
          expect(geometry.headers).toContain('Points');
          await expect(table.locator('tbody tr').first()).toContainText('1234');
          await expect(
            table
              .locator('tbody tr')
              .first()
              .locator('td')
              .nth(1)
              .locator('[title]')
              .first()
          ).toHaveAttribute('title', 'Verylongsurnamewithmanycharacters Jan');
        }
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth)
        ).toBeLessThanOrEqual(width + 1);
        if (width === 402 && view === 'category') {
          await page.screenshot({
            path: test.info().outputPath('compact-results-402.png'),
          });
        }
      });
    }
  });
}

test('category results stay compact when resizing and without ranking', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(
    '/e2e/fixtures/results-refresh.html?view=category&sticky&compact&class=H21'
  );
  const table = page.locator('table').first();
  await expect(table.locator('tbody tr').first()).toBeVisible();
  for (const width of [402, 390, 360, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        table.evaluate(
          element =>
            element.parentElement!.scrollWidth -
            element.parentElement!.clientWidth
        )
      )
      .toBeLessThanOrEqual(1);
    if (width === 1280)
      await expect(
        table.getByRole('columnheader', { name: 'Start' })
      ).toBeVisible();
  }
});
