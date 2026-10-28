import { expect, test } from '@playwright/test';

for (const width of [1280, 390]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    for (const view of ['splits', 'category', 'club', 'relay', 'live']) {
      test(`${view} pins its real header below the navbar`, async ({
        page,
      }) => {
        await page.goto(
          `/e2e/fixtures/results-refresh.html?view=${view}&sticky&class=H21`
        );
        await expect(page.locator('tbody tr').first()).toBeVisible();
        if (view === 'club' || view === 'live') {
          await page
            .getByRole('button', { name: view === 'club' ? /Club/ : /Live/ })
            .first()
            .click();
        }
        const table = page.locator('table').first();
        const header = table.locator('thead');
        const navbar = page.locator('[data-navbar]');
        if (view === 'club') {
          await page
            .locator('.results-viewport > [data-result-scroll]')
            .evaluate(element => {
              element.scrollTop = 300;
            });
        }
        await table.evaluate(element => {
          window.scrollBy(0, element.getBoundingClientRect().top + 300);
          element.parentElement!.scrollLeft = 500;
        });
        await expect
          .poll(async () => {
            return Math.abs(
              (await header.boundingBox())!.y -
                (await navbar.boundingBox())!.height
            );
          })
          .toBeLessThanOrEqual(1);
        // The real cells move together horizontally; hidden responsive cells
        // are deliberately excluded from this geometry comparison.
        const aligned = await table.evaluate(element => {
          const headings = [...element.querySelectorAll('thead th')];
          const cells = [
            ...element.querySelectorAll('tbody tr:first-child td'),
          ];
          return headings.every((heading, index) => {
            if (!heading.getBoundingClientRect().width) return true;
            return (
              Math.abs(
                heading.getBoundingClientRect().left -
                  cells[index]!.getBoundingClientRect().left
              ) <= 1
            );
          });
        });
        expect(aligned).toBe(true);
        await navbar.evaluate(element => {
          element.style.height = '80px';
        });
        await expect
          .poll(async () => (await header.boundingBox())!.y)
          .toBeCloseTo(80, 0);
        if (view === 'splits') {
          await table.evaluate(element => {
            element.parentElement!.scrollLeft = 0;
          });
          await header.getByRole('button', { name: '#' }).click();
          await expect(table.locator('tbody tr').first()).toContainText(
            'Runner 80'
          );
        }
        if (view === 'club') {
          await page
            .locator('.results-viewport > [data-result-scroll]')
            .evaluate(element => {
              element.scrollTop = element.scrollHeight;
            });
        }
        await table.evaluate(element => {
          window.scrollBy(0, element.getBoundingClientRect().bottom - 80 - 10);
        });
        await expect
          .poll(async () => {
            const head = (await header.boundingBox())!;
            const body = (await table.boundingBox())!;
            return Math.abs(head.y + head.height - body.y - body.height);
          })
          .toBeLessThanOrEqual(1);
        await page.evaluate(() => window.scrollTo(0, 0));
        if (view === 'club') {
          await page
            .locator('.results-viewport > [data-result-scroll]')
            .evaluate(element => {
              element.scrollTop = 0;
            });
        }
        await expect
          .poll(async () => header.evaluate(element => element.style.transform))
          .toBe('translateY(0px)');
      });
    }
  });
}
