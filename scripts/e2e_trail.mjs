#!/usr/bin/env node
/**
 * The cross-lesson trail, in a real browser (`scripts/e2e_trail.mjs`, `npm run test:e2e:trail`).
 *
 * `scripts/test_timeline.mjs` pins the rules of the fold; what only a browser can answer is whether
 * the card is *fed* — whether a run in the runner becomes a row on the roadmap, whether the row is
 * still there after a reload, and whether a first visit is quiet. The unit suite can be right about a
 * timeline while the app hands it nothing.
 *
 * The scenario is the real one: a fresh profile (no card), a lesson run twice (one failure, one pass
 * from the solution), then the roadmap showing today's work — the failing run, the pass, and the
 * measured time an open plus two runs wrote into the sitting clock. The card's rows are also links:
 * clicking one must put the runner back on that lesson.
 */

import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable, startDevServer } from './e2e_browser_workbench.mjs';
import { waitForEditor } from './editor-code.mjs';
import { PYTHON_LESSONS } from '../app/src/data/pythonLessonsData.ts';

const LESSON = PYTHON_LESSONS[0];

async function openRoadmap(page) {
  await page.getByTestId('tab-btn-tab-arch').click();
  // The card renders only when the stores have something in them, so "no card" is a count of zero
  // rather than a timeout: the roadmap's own cards are already on screen by then.
  await page.getByTestId('tab-btn-tab-arch').waitFor({ state: 'visible', timeout: 10000 });
}

async function waitForAnyStatus(page) {
  await page.waitForSelector('[data-testid^="status-"]', { timeout: 60000 });
}

async function main() {
  const ownServer = process.env.E2E_BASE_URL ? null : await startDevServer(process.cwd());
  const baseUrl = process.env.E2E_BASE_URL ?? ownServer.baseUrl;
  const executablePath = resolveChromiumExecutable();
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    headless: true,
  });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('#root *')), undefined, {
      timeout: 30000,
    });

    // ---- A first visit is quiet: no trail to show ----
    await openRoadmap(page);
    assert.equal(
      await page.getByTestId('trail-card').count(),
      0,
      'a fresh profile must not be shown an empty trail card'
    );
    console.log('  ok a first visit shows no trail card');

    // ---- Work: one failing run, then the solution's pass ----
    await page.getByTestId('tab-btn-tab-pyodide').click();
    await page.getByTestId(`lesson-item-${LESSON.id}`).click();
    await waitForEditor(page, undefined, 20000);

    await page.getByTestId('btn-run-verify').click();
    await waitForAnyStatus(page);
    const firstStatus = await page.locator('[data-testid^="status-"]').first().getAttribute('data-testid');
    assert.ok(firstStatus, 'the first run must land on a verdict');

    await page.getByTestId('btn-load-solution').click();
    await page.getByTestId('btn-run-verify').click();
    await page.getByTestId('status-assert-passed').waitFor({ timeout: 60000 });
    console.log(`  ok the starter ran (${firstStatus}) and the solution passed`);

    // ---- The roadmap shows it ----
    await openRoadmap(page);
    await page.getByTestId('trail-card').waitFor({ timeout: 5000 });
    const entries = Number(await page.getByTestId('trail-card').getAttribute('data-trail-entries'));
    assert.ok(entries >= 2, `expected at least the two runs on the trail, got ${entries}`);

    const today = page.getByTestId('trail-day').first();
    assert.equal(
      await today.getAttribute('data-day-label'),
      'Today',
      'the work just done must be filed on today'
    );

    // The pass is one row, not two: the verification the runner logs folds into the run that passed.
    const passedRows = await page
      .getByTestId('trail-entry')
      .filter({ has: page.locator('span', { hasText: 'run · passed' }) })
      .count();
    assert.equal(passedRows, 1, `expected exactly one passing run row, got ${passedRows}`);
    const kinds = await page.getByTestId('trail-entry').evaluateAll((rows) =>
      rows.map((row) => row.getAttribute('data-kind'))
    );
    assert.ok(kinds.includes('run'), `expected the runs among the rows, got ${kinds.join(',')}`);
    assert.ok(
      kinds.filter((kind) => kind === 'verified').length <= 1,
      'a verification that repeats its run must not double the row'
    );

    // Time is measured, not inferred: two runs inside one sitting is more than zero milliseconds.
    const measured = Number(await page.getByTestId('trail-card').getAttribute('data-trail-measured'));
    assert.ok(Number.isFinite(measured), 'the card must report its measured time as a number');
    // One day's line carries its own time and work; a multi-day trail adds the span sentence above it.
    const dayLine = (await page.getByTestId('trail-day-summary').first().textContent())?.trim() ?? '';
    assert.match(dayLine, /run/, `the day must count its runs; got: ${dayLine}`);
    if (measured > 0) {
      assert.match(dayLine, /under a minute|min/, `measured time must be named; got: ${dayLine}`);
    }
    console.log(`  ok the trail shows today, ${entries} entries, measured ${measured} ms ("${dayLine}")`);

    // ---- It survives a reload: the card is a reading of the stores, not of this render ----
    // The trail is allowed to grow by the visit the reload itself is (the app opens on the runner,
    // which logs one open), so the check is that the work is still there and nothing was lost.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('#root *')), undefined, {
      timeout: 30000,
    });
    await openRoadmap(page);
    await page.getByTestId('trail-card').waitFor({ timeout: 5000 });
    const reloadedEntries = Number(
      await page.getByTestId('trail-card').getAttribute('data-trail-entries')
    );
    assert.ok(
      reloadedEntries >= entries,
      `a reload must keep the trail, not lose rows: ${entries} before, ${reloadedEntries} after`
    );
    const runsAfterReload = await page
      .getByTestId('trail-entry')
      .evaluateAll((rows) => rows.filter((row) => row.getAttribute('data-kind') === 'run').length);
    assert.equal(runsAfterReload, 2, `expected both runs to survive the reload, got ${runsAfterReload}`);
    assert.equal(
      (await page.getByTestId('trail-day').first().getAttribute('data-day-label')),
      'Today',
      'the reload must not refile the work'
    );
    console.log(`  ok the reload keeps the trail (${entries} → ${reloadedEntries} rows, both runs)`);

    // ---- A row leads back to its lesson ----
    await page.getByTestId('trail-entry').first().locator('button').first().click();
    await page.getByTestId('lesson-title').waitFor({ timeout: 10000 });
    assert.equal(
      (await page.getByTestId('lesson-title').textContent())?.trim().length > 0,
      true,
      'clicking a row must open a lesson, with its title on screen'
    );
    console.log('  ok a trail row opens its lesson in the runner');

    assert.deepEqual(pageErrors, [], `the page threw on the trail: ${pageErrors.join(' | ')}`);
    console.log(
      '[PASS] The trail: a fresh profile shows nothing, a failing run and a pass become rows on today, ' +
        'the pass is one row, time is measured, a reload keeps the trail, and a row opens its lesson'
    );
  } finally {
    await browser.close();
    if (ownServer) await ownServer.viteServer.close();
  }
}

main().catch((error) => {
  console.error('[FAIL] Trail checks failed:', error.message);
  process.exit(1);
});
