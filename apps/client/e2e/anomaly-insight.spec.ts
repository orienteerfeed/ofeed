import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type {} from './fixtures/anomaly-insight';

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`anomaly insight ${viewport.width}px`, () => {
    test.use({ viewport });
    test('catalog navigation, evidence, filters, pagination and responsive layout', async ({
      page,
    }, testInfo) => {
      await page.goto('/e2e/fixtures/anomaly-insight.html');
      await expect(
        page.getByRole('heading', { name: 'Insights', exact: true })
      ).toBeVisible();
      await page
        .locator('a[href="/events/fixture/insights/anomalies"]')
        .click();
      await expect(page).toHaveURL(/\/events\/fixture\/insights\/anomalies$/);
      const table = page.getByRole('table', { name: 'Findings', exact: true });
      await expect(table.getByRole('row')).toHaveCount(26);
      await expect(page.getByText('Timezone: Europe/Prague')).toBeVisible();
      await table
        .locator('summary')
        .filter({ hasText: 'Start outside class grid' })
        .click();
      await expect(table.getByText(/Interval: 60 s/)).toBeVisible();
      await page.getByRole('button', { name: 'Next page' }).click();
      await expect(table.getByRole('row')).toHaveCount(6);
      await page.getByLabel('Class', { exact: true }).selectOption('2');
      await expect(table.getByRole('row')).toHaveCount(11);
      await page.getByLabel('Finding type').selectOption('START_PUNCH');
      await page.getByLabel('Search', { exact: true }).fill('REG30');
      await expect(table.getByRole('row')).toHaveCount(2);
      await table
        .locator('summary')
        .filter({ hasText: 'Unusually fast first split' })
        .click();
      await expect(table.getByText(/Reference competitors: 8/)).toBeVisible();
      await expect(table.getByRole('link', { name: 'D21' })).toHaveAttribute(
        'href',
        '/events/fixture?tab=results&class=D21'
      );
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth
          )
        )
        .toBe(true);
      // Capture from the top, after interactions that can scroll the sticky
      // navbar and the report's horizontal table viewport.
      await table.evaluate(element => {
        element.parentElement!.scrollLeft = 0;
      });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: testInfo.outputPath('anomaly-report.png'),
        fullPage: true,
      });
      await page.getByLabel('Search', { exact: true }).fill('not present');
      await expect(
        page.getByText('No issues match the selected filters.')
      ).toBeVisible();
      await page.getByRole('link', { name: 'Insights', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Insights', exact: true })
      ).toBeVisible();
    });
    test('CSV download contains all rows, evidence, coverage and protected formulas', async ({
      page,
    }) => {
      await page.goto('/e2e/fixtures/anomaly-insight.html?report');
      const exportButton = page.getByRole('button', { name: 'Export CSV' });
      await expect(exportButton).toBeEnabled();
      const downloaded = page.waitForEvent('download');
      await exportButton.click();
      const download = await downloaded;
      expect(download.suggestedFilename()).toBe('anomalies-fixture.csv');
      const csv = await readFile((await download.path())!, 'utf8');
      expect(csv).toContain('Runner-20');
      expect(csv).toContain('Runner-29');
      expect(csv).toContain("'=SUM(1) Jan");
      expect(csv).toContain('Reference competitors: 8');
      expect(csv).toContain('No reliable start grid');
      expect(csv).toContain('Europe/Prague');
      expect(csv).toContain('"Affected competitors";"30"');
    });
    test('print popup contains all rows and safely escaped text', async ({
      page,
    }) => {
      await page.goto('/e2e/fixtures/anomaly-insight.html?report');
      await expect(
        page.getByRole('button', { name: 'Print', exact: true })
      ).toBeEnabled();
      // Keep the native system print dialog out of automation while checking the
      // real popup and the report passed to it by the product.
      await page.evaluate(() => {
        const open = window.open.bind(window);
        window.open = (...args) => {
          const popup = open(...args);
          if (popup)
            popup.print = () => {
              popup.document.documentElement.dataset.printRequested = 'true';
            };
          return popup;
        };
      });
      const opened = page.waitForEvent('popup');
      await page.getByRole('button', { name: 'Print', exact: true }).click();
      const popup = await opened;
      await expect(
        popup.getByRole('heading', { name: 'Anomaly analysis', exact: true })
      ).toBeVisible();
      await expect(popup.locator('html')).toHaveAttribute(
        'data-print-requested',
        'true'
      );
      await expect(popup.locator('body')).toContainText('Runner-20');
      await expect(popup.locator('body')).toContainText('Runner-29');
      await expect(popup.locator('body')).toContainText(
        '<script>example</script>'
      );
      await expect(popup.locator('script')).toHaveCount(0);
      await expect(popup.locator('body')).toContainText(
        'No reliable start grid'
      );
      await expect(popup.locator('body')).toContainText('Europe/Prague');
      await popup.close();
    });
    test('refresh failures retain stale evidence and disable export until recovery', async ({
      page,
    }) => {
      await page.goto('/e2e/fixtures/anomaly-insight.html?report');
      await expect(
        page.getByRole('table', { name: 'Findings', exact: true })
      ).toBeVisible();
      await page.evaluate(() => window.anomalyFixture.setFailure(true));
      await page.getByRole('button', { name: 'Refresh', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText(
        'Displayed data is out of date'
      );
      await expect(
        page.getByRole('table', { name: 'Findings', exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Export CSV' })
      ).toBeDisabled();
      await expect(
        page.getByRole('button', { name: 'Print', exact: true })
      ).toBeDisabled();
      await page.getByRole('button', { name: 'Try again' }).click();
      await expect(page.getByRole('alert')).toContainText(
        'Displayed data is out of date'
      );
      await page.evaluate(() => window.anomalyFixture.setFailure(false));
      await page.getByRole('button', { name: 'Try again' }).click();
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Export CSV' })
      ).toBeEnabled();
      await expect(
        page.getByRole('button', { name: 'Print', exact: true })
      ).toBeEnabled();
    });
  });
}
