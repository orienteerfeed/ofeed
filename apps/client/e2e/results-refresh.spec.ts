import { expect, test, type Page } from '@playwright/test';
import type {} from './fixtures/results-refresh';

// Large split tables can take longer to lay out in Firefox under parallel CI.
test.setTimeout(60000);

async function geometry(page: Page) {
  return page.evaluate(() => {
    const table = document.querySelector('table')!;
    const scroller = table.parentElement!;
    const outer = document.querySelector('[data-testid="fixture-scroll"]')!;
    const club = document.querySelector(
      '.results-viewport > [data-result-scroll]'
    );
    return {
      x: scroller.scrollLeft,
      y: outer.scrollTop,
      clubY: club?.scrollTop ?? 0,
      pageY: window.scrollY,
      columns: [...table.querySelectorAll('th')].map(
        cell => cell.getBoundingClientRect().width
      ),
      rowHeight: table.querySelector('tbody tr')!.getBoundingClientRect()
        .height,
      tableY: table.getBoundingClientRect().top,
    };
  });
}
async function scroll(page: Page) {
  await page.evaluate(() => {
    const table = document.querySelector('table')!;
    table.parentElement!.scrollLeft = 500;
    document.querySelector('[data-testid="fixture-scroll"]')!.scrollTop = 600;
    const club = document.querySelector(
      '.results-viewport > [data-result-scroll]'
    );
    if (club) club.scrollTop = 500;
    window.scrollTo(0, 180);
  });
}
function expectStable(
  before: Awaited<ReturnType<typeof geometry>>,
  after: Awaited<ReturnType<typeof geometry>>
) {
  for (const key of [
    'x',
    'y',
    'clubY',
    'pageY',
    'rowHeight',
    'tableY',
  ] as const) {
    expect(Math.abs(after[key] - before[key]), key).toBeLessThanOrEqual(1);
  }
  expect(after.columns).toEqual(before.columns);
}

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`${viewport.width}px`, () => {
    test.use({ viewport });
    for (const view of ['splits', 'category', 'club', 'relay', 'live']) {
      test(`${view} preserves scroll while polling and reordering`, async ({
        page,
      }) => {
        await page.clock.install();
        await page.goto(
          `/e2e/fixtures/results-refresh.html?view=${view}&class=H21`
        );
        await expect(page.locator('tbody tr').first()).toBeVisible();
        if (view === 'club')
          await page.getByRole('button', { name: /Club/ }).first().click();
        if (view === 'live')
          await page.getByRole('button', { name: /Live/ }).first().click();
        await expect(page.locator('tbody tr').first()).toBeVisible();
        const original = await page.locator('table').first().elementHandle();
        await scroll(page);
        let before = await geometry(page);
        if (view === 'splits') expect(before.x).toBeGreaterThan(0);
        await page.evaluate(() => window.resultsRefresh.hold());
        await page.clock.fastForward(61000);
        expectStable(before, await geometry(page));
        const counts = await page.evaluate(() => window.resultsRefresh.counts);
        if (view === 'splits')
          expect(counts.SplitPublicationStatus).toBeGreaterThan(1);
        if (view === 'club') {
          expect(counts.OrganisationNames).toBeGreaterThan(1);
          expect(counts.CompetitorsByOrganisation).toBeGreaterThan(1);
        }
        if (view === 'live')
          expect(counts.ResultFeedByEvent).toBeGreaterThan(1);
        // Scrolling during a pending request must also survive its response.
        await page.evaluate(() => {
          document.querySelector('[data-testid="fixture-scroll"]')!.scrollTop +=
            37;
          document.querySelector('table')!.parentElement!.scrollLeft += 25;
        });
        before = await geometry(page);
        await page.evaluate(() => window.resultsRefresh.update());
        await page.evaluate(() => window.resultsRefresh.release());
        await expect
          .poll(() => page.locator('tbody tr').count())
          .toBeGreaterThan(view === 'live' ? 0 : 80);
        expect(
          await original!.evaluate(
            node => node === document.querySelector('table')
          )
        ).toBe(true);
        expectStable(before, await geometry(page));
        if (view === 'splits' || view === 'category' || view === 'live') {
          await expect(page.locator('tbody tr').first()).toContainText(
            'Runner 81'
          );
        }
        // Another poll fails: retain the same table and geometry.
        await page.evaluate(() => window.resultsRefresh.hold());
        await page.clock.fastForward(61000);
        await page.evaluate(() => window.resultsRefresh.release(true));
        expect(await original!.evaluate(node => node.isConnected)).toBe(true);
        expectStable(before, await geometry(page));
      });
    }
    test('confirmed publication revocation still hides splits', async ({
      page,
    }) => {
      await page.goto(
        '/e2e/fixtures/results-refresh.html?view=splits&class=H21'
      );
      await expect(page.getByRole('table')).toBeVisible();
      await page.evaluate(() => window.resultsRefresh.revoke());
      await expect(page.getByRole('table')).toHaveCount(0);
    });
  });
}
