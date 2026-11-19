import { expect, test } from '@playwright/test';

test('club categories fill the table without a phantom column after resizing', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto(
    '/e2e/fixtures/results-refresh.html?view=club&sticky&compact&multipleClasses'
  );
  await page.getByRole('button', { name: /Club/ }).first().click();
  const table = page.locator('[data-results-table="club"]');
  await expect(table.locator('tbody')).toContainText('D21');
  await expect(table.locator('tbody')).toContainText('H21');

  for (const width of [390, 402, 767, 768, 1280, 390]) {
    await page.setViewportSize({ width, height: 874 });
    const gaps = await table.evaluate(element => {
      const right = element.getBoundingClientRect().right;
      return [
        element.querySelector('thead th:last-child')!,
        ...element.querySelectorAll('tbody tr td:last-child'),
      ].map(cell => Math.abs(right - cell.getBoundingClientRect().right));
    });
    expect(Math.max(...gaps)).toBeLessThanOrEqual(1);
  }
  await page.screenshot({
    path: test.info().outputPath('club-full-width.png'),
  });
});

test('Finished without radios or result duration precedes Active and sorts by finish timestamps', async ({
  page,
}) => {
  await page.goto(
    '/e2e/fixtures/results-refresh.html?view=category&pending&noRadioFinish&class=H21'
  );
  const rows = page.locator('table').first().locator('tbody tr');
  await expect(rows.nth(1)).toContainText('Runner 3');
  await expect(rows.nth(1)).toContainText('30:30');
  await expect(rows.nth(1).locator('td').first()).toHaveText('🏁');
  await expect(rows.last()).toContainText('Runner 2');
  await expect(rows.last().locator('td').first()).toHaveText('🏃');
});

test('pending runners keep status emojis while placed among confirmed finishers', async ({
  page,
}) => {
  await page.goto(
    '/e2e/fixtures/results-refresh.html?view=category&sticky&radio&pending&class=H21'
  );
  const rows = page.locator('table').first().locator('tbody tr');
  await expect(rows.nth(1)).toContainText('Runner 2');
  await expect(rows.nth(1).locator('td').first()).toHaveText('🏃');
  await expect(rows.nth(2)).toContainText('Runner 3');
  await expect(rows.nth(2).locator('td').first()).toHaveText('🏁');
  await expect(rows.nth(3)).toContainText('Runner 4');
  await expect(rows.nth(3).locator('td').first()).toHaveText('2.');
});

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
        if (view === 'live') {
          const categoryCell = table
            .locator('tbody tr')
            .first()
            .locator('td')
            .nth(2);
          const categoryButton = categoryCell.getByRole('button', {
            name: 'D35C',
            exact: true,
          });
          await expect(categoryButton).toBeVisible();
          const badgeFits = await categoryButton.evaluate(button => {
            const cell = button.closest('td')!;
            const badge = button.firstElementChild!;
            const cellRect = cell.getBoundingClientRect();
            const badgeRect = badge.getBoundingClientRect();
            const styles = getComputedStyle(cell);
            return (
              badgeRect.left >=
                cellRect.left + parseFloat(styles.paddingLeft) - 1 &&
              badgeRect.right <=
                cellRect.right - parseFloat(styles.paddingRight) + 1
            );
          });
          expect(badgeFits).toBe(true);
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

test('category ranking points retain a readable desktop column', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(
    '/e2e/fixtures/results-refresh.html?view=category&sticky&compact&ranking&class=H21'
  );

  const table = page.locator('table').first();
  const pointsHeader = table.getByRole('columnheader', { name: 'Points' });
  const firstPointsCell = table
    .locator('tbody tr')
    .first()
    .locator('td')
    .last();

  await expect(pointsHeader).toBeVisible();
  await expect(firstPointsCell).toHaveText('1234');
  const geometry = await pointsHeader.evaluate(header => {
    const scroller = header.closest('table')!.parentElement!;
    const headerRect = header.getBoundingClientRect();
    const cellRect = header
      .closest('table')!
      .querySelector('tbody tr td:last-child')!
      .getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    return {
      headerWidth: headerRect.width,
      headerFits: headerRect.right <= scrollerRect.right + 1,
      cellFits: cellRect.right <= scrollerRect.right + 1,
      scrollWidth: scroller.scrollWidth,
      clientWidth: scroller.clientWidth,
    };
  });
  expect(geometry.headerWidth).toBeGreaterThanOrEqual(64);
  expect(geometry.headerFits).toBe(true);
  expect(geometry.cellFits).toBe(true);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
});

test('radio split shows subdued rank and loss to the control leader', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(
    '/e2e/fixtures/results-refresh.html?view=category&sticky&radio&class=H21'
  );

  const table = page.locator('table').first();
  await expect(table.getByRole('columnheader', { name: '31' })).toBeVisible();

  const leader = table
    .locator('tbody tr')
    .first()
    .locator('td[data-col="radio"]');
  const runnerUp = table
    .locator('tbody tr')
    .nth(1)
    .locator('td[data-col="radio"]');
  await expect(leader).toHaveText('1:01(1)+0:00');
  await expect(runnerUp).toHaveText('1:02(2)+0:01');
  await expect(runnerUp.locator('span').first()).toHaveClass(/font-medium/);
  await expect(runnerUp.locator('span').nth(1)).toHaveClass(
    /font-normal.*text-muted-foreground/
  );
  await expect(runnerUp.locator('span').nth(2)).toHaveClass(
    /md:ml-1.*md:inline/
  );
  await expect(runnerUp.locator('span').nth(2)).toHaveCSS('display', 'inline');

  // Long times and a three-digit rank must fit the actual visible cell,
  // not merely exist in textContent behind overflow:hidden.
  await runnerUp
    .locator('span')
    .first()
    .evaluate(span => {
      span.textContent = '1:23:45';
    });
  await runnerUp
    .locator('span')
    .nth(1)
    .evaluate(span => {
      span.textContent = '(123)';
    });
  await runnerUp
    .locator('span')
    .nth(2)
    .evaluate(span => {
      span.textContent = '+1:23:45';
    });
  for (const width of [768, 1280, 1660]) {
    await page.setViewportSize({ width, height: 900 });
    const fits = await runnerUp.evaluate(cell => {
      const rect = cell.getBoundingClientRect();
      return [...cell.querySelectorAll('span')].every(span => {
        const text = span.getBoundingClientRect();
        return text.left >= rect.left && text.right <= rect.right;
      });
    });
    expect(fits).toBe(true);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    table.locator('tbody tr').nth(1).locator('td[data-col="radio"] span').nth(2)
  ).toHaveCSS('display', 'block');
});

test('mobile splits keep compact identities and reveal full competitor details', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 874 });
  await page.goto(
    '/e2e/fixtures/results-refresh.html?view=splits&sticky&compact&class=H21'
  );
  const table = page.locator('table').first();
  const cells = table.locator('tbody tr').first().locator('td');
  await expect(cells.nth(1)).toContainText('Verylongsurnamewithmanycharacters');
  const widths = () =>
    table.evaluate(element =>
      [...element.querySelectorAll('tbody tr:first-child td')]
        .slice(0, 2)
        .map(cell => cell.getBoundingClientRect().width)
    );
  expect(await widths()).toEqual([32, 112]);
  const clippedTimes = await table.evaluate(element =>
    [...element.querySelectorAll('tbody td:nth-child(n + 5) div.font-mono')]
      .filter(box => box.scrollWidth > box.clientWidth + 1)
      .map(box => box.textContent)
  );
  expect(clippedTimes).toEqual([]);
  await expect(cells.nth(1).getByTitle('Test club')).toBeHidden();
  await cells
    .nth(1)
    .getByRole('button', { name: 'Verylongsurnamewithmanycharacters Jan' })
    .click();
  const details = page.getByRole('dialog');
  await expect(details).toContainText('Verylongsurnamewithmanycharacters Jan');
  await expect(details).toContainText('Test club');
  await page.keyboard.press('Escape');
  await expect(details).toBeHidden();
  const clubs = page.getByRole('button', { name: 'Show clubs', exact: true });
  await clubs.click();
  await expect(clubs).toHaveAttribute('aria-pressed', 'true');
  expect(await widths()).toEqual([32, 192]);
  await expect(cells.nth(1).getByTitle('Test club')).toBeVisible();
  await clubs.click();
  await table.evaluate(element => {
    element.parentElement!.scrollLeft = 384;
  });
  const geometry = await table.evaluate(element => {
    const left = element.parentElement!.getBoundingClientRect().left;
    const row = element.querySelector('tbody tr')!;
    const headers = element.querySelectorAll('thead th');
    return [...row.children].slice(0, 2).map((cell, index) => ({
      offset: cell.getBoundingClientRect().left - left,
      headerOffset: headers[index]!.getBoundingClientRect().left - left,
    }));
  });
  expect(geometry).toEqual([
    { offset: 0, headerOffset: 0 },
    { offset: 32, headerOffset: 32 },
  ]);
  await page.screenshot({
    path: test.info().outputPath('compact-mobile-splits.png'),
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  expect(await widths()).toEqual([48, 192]);
  await expect(clubs).toBeHidden();
  await expect(cells.nth(1).getByTitle('Test club')).toBeVisible();
});

for (const ranking of [false, true]) {
  test(`one radio fits mobile results with ranking ${ranking}`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 390, height: 874 });
    await page.goto(
      `/e2e/fixtures/results-refresh.html?view=category&sticky&compact&radio&longRadio&class=H21${ranking ? '&ranking' : ''}`
    );
    const table = page.locator('[data-results-table="category"]');
    await expect(table.locator('tbody tr').first()).toBeVisible();
    for (const width of [320, 360, 390, 402]) {
      await page.setViewportSize({ width, height: 874 });
      const geometry = await table.evaluate(element => {
        const scroller = element.parentElement!;
        const numeric = [...element.querySelectorAll('tbody tr')].flatMap(row =>
          [...row.querySelectorAll('td')].filter(
            (cell, index) =>
              index !== 1 && cell.getBoundingClientRect().width > 0
          )
        );
        return {
          overflow: scroller.scrollWidth - scroller.clientWidth,
          clipped: numeric
            .filter(cell => cell.scrollWidth > cell.clientWidth + 1)
            .map(cell => cell.textContent),
          radioFits: [
            ...element.querySelectorAll('td[data-col="radio"] span'),
          ].every(span => {
            const cell = span.closest('td')!.getBoundingClientRect();
            const rect = span.getBoundingClientRect();
            return rect.left >= cell.left && rect.right <= cell.right;
          }),
        };
      });
      expect(geometry.overflow).toBeLessThanOrEqual(1);
      expect(geometry.clipped).toEqual([]);
      expect(geometry.radioFits).toBe(true);
      await expect(
        table.getByRole('columnheader', { name: 'Diff', exact: true })
      ).toBeHidden();
      const firstTime = table
        .locator('tbody tr')
        .first()
        .locator('td[data-col="time"]');
      await expect(firstTime.locator('.single-radio-loss')).toBeVisible();
      await expect(firstTime.locator('.single-radio-loss')).toHaveText('-');
      if (width === 390)
        await page.screenshot({
          path: test.info().outputPath(`one-radio-${ranking}.png`),
        });
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(
      table.getByRole('columnheader', { name: 'Diff', exact: true })
    ).toBeVisible();
    await expect(
      table.locator('tbody tr').first().locator('.single-radio-loss')
    ).toBeHidden();
  });
}

for (const width of [390, 1280]) {
  test(`Active clock advances through radio columns at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 900 });
    await page.clock.install();
    await page.goto(
      '/e2e/fixtures/results-refresh.html?view=category&sticky&radioProgress&class=H21'
    );
    const row = page
      .locator('tbody tr')
      .filter({ has: page.getByTitle('Runner 2 Jan', { exact: true }) });
    const radio = row.locator('td[data-col="radio"]');
    const finish = row.locator('td[data-col="time"]');
    await expect(radio.nth(0).locator('[data-running-time]')).toBeVisible();
    await expect(row.locator('[data-running-time]')).toHaveCount(1);
    await expect(finish).toHaveText('');
    const before = await radio
      .nth(0)
      .locator('[data-running-time]')
      .textContent();
    await page.clock.fastForward(2000);
    await expect(radio.nth(0).locator('[data-running-time]')).not.toHaveText(
      before!
    );
    await page.evaluate(() => window.resultsRefresh.advanceRadio(1));
    await expect(radio.nth(0)).toContainText('5:00');
    await expect(radio.nth(0).locator('[data-running-time]')).toHaveCount(0);
    await expect(radio.nth(1).locator('[data-running-time]')).toBeVisible();
    await expect(row.locator('[data-running-time]')).toHaveCount(1);
    await expect(finish).toHaveText('');
    await page.evaluate(() => window.resultsRefresh.advanceRadio(2));
    await expect(radio.nth(1)).toContainText('10:00');
    await expect(finish.locator('[data-running-time]')).toBeVisible();
    await expect(row.locator('[data-running-time]')).toHaveCount(1);
    // A corrected/removed radio split restores the clock to the missing radio.
    await page.evaluate(() => window.resultsRefresh.advanceRadio(0));
    await expect(radio.nth(0).locator('[data-running-time]')).toBeVisible();
    await page.evaluate(() => window.resultsRefresh.advanceRadio(2, 'OK'));
    await expect(row.locator('[data-running-time]')).toHaveCount(0);
    await expect(finish).toContainText('10:50');
    // A class without radios continues to show the same elapsed clock at finish.
    await page.goto(
      '/e2e/fixtures/results-refresh.html?view=category&sticky&pending&class=H21'
    );
    const noRadioRow = page
      .locator('tbody tr')
      .filter({ has: page.getByTitle('Runner 2 Jan', { exact: true }) });
    await expect(noRadioRow.locator('td[data-col="radio"]')).toHaveCount(0);
    await expect(
      noRadioRow.locator('td[data-col="time"] [data-running-time]')
    ).toBeVisible();
  });
}
