#!/usr/bin/env node
/**
 * Focus mode and the sitting clock, in a real browser (`scripts/e2e_focus.mjs`,
 * `npm run test:e2e:focus`).
 *
 * The unit suite pins the clock's rules and the focus store against a fake bucket. What only a
 * browser can answer is what the mode actually hides and — the part that matters more — what it
 * leaves reachable. So this suite measures the chrome before and after the toggle with
 * `isVisible()`, asserts the editor and the study card survive, and then proves all three exits:
 * Escape, `⌘.`, and the pill. A focus mode with no exit is a trap, and a screenshot cannot tell the
 * difference.
 *
 * It also reads the clock where the learner's own numbers come from: opening the lesson writes one
 * sitting naming that lesson, and the study panel prints a duration instead of a blank line.
 */

import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { readBulk, waitForBulk } from './bulk_store_page.mjs';
import { resolveChromiumExecutable, startDevServer } from './e2e_browser_workbench.mjs';
import { waitForEditor } from './editor-code.mjs';
import { PYTHON_LESSONS } from '../app/src/data/pythonLessonsData.ts';

const LESSON = PYTHON_LESSONS[0];
const CHROME = ['header', 'rail', 'footer', 'lesson-list', 'mode-bar'];
const SITTINGS_KEY = 'mechalab_sittings_v1';
const LOG_KEY = 'mechalab.learningLog.v1';

async function focusOn(page) {
  return (await page.locator('#top').getAttribute('data-focus')) === 'on';
}

/** Each chrome region's visibility, as one object, so a failure names the region that leaked. */
async function chromeState(page) {
  const state = {};
  for (const region of CHROME) {
    state[region] = await page.locator(`[data-chrome="${region}"]`).first().isVisible();
  }
  return state;
}

async function waitForFocus(page, on) {
  await page.waitForFunction(
    (expected) => document.querySelector('#top')?.getAttribute('data-focus') === (expected ? 'on' : 'off'),
    on,
    { timeout: 10000 }
  );
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
    await page.getByTestId('tab-btn-tab-pyodide').click();
    await page.getByTestId(`lesson-item-${LESSON.id}`).click();
    await waitForEditor(page, undefined, 20000);

    // ---- The clock: opening a lesson is one sitting, and the panel says so ----
    // Sittings are in IndexedDB (`app/src/bulkStorage.ts`): the open is written on a tick, so the read
    // waits for the store rather than for a fixed sleep.
    const sittings = await waitForBulk(page, SITTINGS_KEY, (list) => Array.isArray(list) && list.length === 1);
    assert.equal(sittings.length, 1, `expected one sitting after opening a lesson, got ${sittings.length}`);
    assert.equal(sittings[0].lessons.includes(LESSON.id), true, 'the sitting must name the lesson opened');
    assert.ok(sittings[0].end >= sittings[0].start, 'a sitting cannot end before it starts');
    const sittingLine = (await page.getByTestId('study-sitting').textContent())?.trim() ?? '';
    assert.match(
      sittingLine,
      /(under a minute|min)/,
      `the study panel must print the measured time, not a blank line; got: ${sittingLine}`
    );
    console.log(`  ok opening ${LESSON.id} wrote one sitting and the panel says "${sittingLine}"`);

    // ---- One visit is one open, even in development ----
    // The dev server mounts under `React.StrictMode`, which replays every effect; the runner's open is
    // guarded so the replay is a no-op. Unguarded, this visit files two `lesson_open` events ~7 ms
    // apart and a pilot exporting from `npm run dev` reads its visit count doubled (`docs/pilot-results.md`,
    // Run 214). The second pass lands a tick after the first, so the read waits for one event and then
    // for the burst to finish before counting.
    const logEvents = await waitForBulk(page, LOG_KEY, (events) =>
      Array.isArray(events) && events.some((event) => event.kind === 'lesson_open')
    );
    assert.ok(Array.isArray(logEvents), 'expected the learning log to be an array of events');
    await page.waitForTimeout(500);
    const opensAfterBurst = JSON.parse(await readBulk(page, LOG_KEY)).filter(
      (event) => event.kind === 'lesson_open' && event.lesson === LESSON.id
    );
    assert.equal(
      opensAfterBurst.length,
      1,
      `one visit must file one open; got ${opensAfterBurst.length} — React.StrictMode's effect replay is being logged as a second visit`
    );
    console.log('  ok one visit filed exactly one lesson_open');

    // ---- Everything is on screen before the toggle ----
    const before = await chromeState(page);
    assert.deepEqual(
      before,
      Object.fromEntries(CHROME.map((region) => [region, true])),
      `the chrome must be visible before focus mode: ${JSON.stringify(before)}`
    );
    assert.equal(await page.getByTestId('btn-focus-pill').count(), 0, 'no pill when focus is off');

    // ---- Focus hides the chrome and keeps the work ----
    await page.getByTestId('btn-focus-toggle').click();
    await waitForFocus(page, true);
    const after = await chromeState(page);
    assert.deepEqual(
      after,
      Object.fromEntries(CHROME.map((region) => [region, false])),
      `focus mode must hide every chrome region: ${JSON.stringify(after)}`
    );
    assert.equal(await page.getByTestId('btn-focus-pill').isVisible(), true, 'the way out must be on screen');
    assert.equal(await page.getByTestId('panel-study').isVisible(), true, 'focus keeps the study card');
    assert.equal(await page.getByTestId('lesson-title').isVisible(), true, 'focus keeps the lesson');
    const editorVisible = await page.evaluate(() =>
      Boolean(document.querySelector('.cm-editor')?.getBoundingClientRect().height)
    );
    assert.equal(editorVisible, true, 'focus keeps the editor');
    console.log('  ok focus hides the header, mode bar, rail, lesson list and footer, and keeps the work');

    // ---- Exit 1: Escape ----
    await page.keyboard.press('Escape');
    await waitForFocus(page, false);
    const restored = await chromeState(page);
    assert.equal(restored.header, true, 'Escape must bring the header back');
    assert.equal(restored['lesson-list'], true, 'Escape must bring the lesson list back');
    assert.equal(await page.getByTestId('btn-focus-pill').count(), 0, 'the pill goes with the mode');
    console.log('  ok Escape leaves focus and the chrome returns');

    // ---- Exit 2: the pill — the only control still on screen ----
    await page.getByTestId('btn-focus-toggle').click();
    await waitForFocus(page, true);
    await page.getByTestId('btn-focus-pill').click();
    await waitForFocus(page, false);
    assert.equal(await page.getByTestId('btn-focus-toggle').getAttribute('aria-pressed'), 'false');
    console.log('  ok the pill leaves focus too');

    // ---- The keyboard: ⌘. toggles, and the choice survives a reload ----
    await page.keyboard.press('Meta+.');
    await waitForFocus(page, true);
    assert.equal(await page.getByTestId('btn-focus-pill').isVisible(), true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('#root *')), undefined, {
      timeout: 30000,
    });
    assert.equal(await focusOn(page), true, 'focus is a preference and must survive a reload');
    assert.equal(await page.getByTestId('btn-focus-pill').isVisible(), true);
    assert.equal((await chromeState(page)).header, false, 'the chrome stays hidden after the reload');
    await page.getByTestId('btn-focus-pill').click();
    await waitForFocus(page, false);
    console.log('  ok ⌘. enters focus, the reload keeps it, and the pill leaves it');

    // ---- The clock survives the reload as well ----
    const afterReload = JSON.parse(await readBulk(page, SITTINGS_KEY));
    assert.equal(afterReload.length, 1, 'a reload of the same sitting must not fork it');
    assert.ok(afterReload[0].end >= afterReload[0].start);

    assert.deepEqual(pageErrors, [], `the page threw during focus mode: ${pageErrors.join(' | ')}`);
    console.log('[PASS] Focus: the chrome hides and the work stays, Escape, ⌘. and the pill all leave, ' +
      'the choice survives a reload, and opening a lesson recorded one measured sitting');
  } finally {
    await browser.close();
    if (ownServer) await ownServer.viteServer.close();
  }
}

main().catch((error) => {
  console.error('[FAIL] Focus checks failed:', error.message);
  process.exit(1);
});
