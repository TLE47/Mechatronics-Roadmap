#!/usr/bin/env node
/**
 * Home, in a real browser (`scripts/e2e_home.mjs`, `npm run test:e2e:home`).
 *
 * The unit suite pins the two pure halves; what only a browser can answer is whether the page the
 * landing rule chose is the page that renders, and whether each card is really a door. So this suite
 * walks both halves of the same promise:
 *
 *   - a first visit still lands on the workbench with the Start Here block, because Home is a
 *     destination and never a gate;
 *   - a returning visit lands on Home, and its one next thing opens the lesson `Mission 1` asks for,
 *     its labs open their own tab, its route opens the roadmap, and its review button opens the deck;
 *   - a reload inside the sitting stays where the learner was, while a deep link to a lesson never
 *     lands on Home at all.
 *
 * Every id and title it compares comes from the app's own modules, so a renamed lesson or a new tab
 * is checked rather than guessed. The tabs are read from `data/workbenchTabs.json`, the same registry
 * the rail and Home's launcher both render.
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable, startDevServer } from './e2e_browser_workbench.mjs';
import { waitForEditor } from './editor-code.mjs';
import { seedTourSeen } from './tour_seed.mjs';
import { PYTHON_LESSONS } from '../app/src/data/pythonLessonsData.ts';
import { nextMission } from '../app/src/gamification/missions.ts';
import { SPINE } from '../app/src/spine.ts';

const COMPLETED_KEY = 'mechalab_pyodide_completed_v1';
const TAB_IDS = Object.keys(
  JSON.parse(fs.readFileSync(path.join('app', 'src', 'data', 'workbenchTabs.json'), 'utf8')).tabs
);

const FIRST_LESSON = PYTHON_LESSONS[0];
/** The entry Home's Today panel starts with, from the same join the page calls. */
const TODAY_ENTRY = nextMission({})?.entries[0] ?? null;
const TODAY_TITLE = PYTHON_LESSONS.find((lesson) => lesson.id === TODAY_ENTRY?.id)?.title ?? null;

/** Wait until the lazy whole-page chunk has painted, not the Suspense line. */
async function waitForHome(page) {
  await page.getByTestId('home-dashboard').waitFor({ timeout: 30000 });
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
    // ---- 1. A first visit is the workbench, Start Here and all ----
    {
      const context = await browser.newContext();
      await seedTourSeen(context);
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('start-here').waitFor({ timeout: 30000 });
      assert.equal(
        await page.getByTestId('home-dashboard').count(),
        0,
        'a first visit belongs to the workbench: Home must never gate Lesson 1'
      );
      assert.deepEqual(pageErrors, [], `the first visit threw: ${pageErrors.join('; ')}`);
      console.log('  ok a first visit opens the workbench with Start Here, not Home');
      await context.close();
    }

    // ---- 1b. The wordmark is the door to the introduction ----
    {
      const context = await browser.newContext();
      await seedTourSeen(context);
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('link-brand').waitFor({ timeout: 30000 });
      await page.getByTestId('link-brand').click();
      await page.getByTestId('intro-page').waitFor({ timeout: 30000 });
      assert.equal(
        new URL(page.url()).searchParams.get('view'),
        'intro',
        'the introduction must own its address, so it can be shared, reloaded and gone back to'
      );
      assert.equal(
        await page.locator('#intro-route li').count(),
        SPINE.length,
        `the introduction must show all ${SPINE.length} route steps the roadmap prints`
      );
      assert.ok(
        (await page.locator('[data-testid^="intro-figure-"]').count()) >= 4,
        'the introduction is a showcase: it needs real figures, not only words'
      );
      assert.equal(
        await page.getByTestId(`intro-lab-${TAB_IDS[0]}`).count(),
        1,
        'every lab on the rail needs its door on the introduction'
      );
      // A reload is still the introduction: an explicit view is the learner's choice, not a guess.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByTestId('intro-page').waitFor({ timeout: 30000 });
      await page.getByTestId('btn-intro-home').click();
      await waitForHome(page);
      assert.deepEqual(pageErrors, [], `the introduction threw: ${pageErrors.join(' | ')}`);
      console.log('  ok the wordmark opens the introduction, and its doors lead back in');
      await context.close();
    }

    // ---- 2. A returning visit lands on Home ----
    const context = await browser.newContext();
    await seedTourSeen(context);
    await context.addInitScript(
      ({ key, id }) => {
        localStorage.setItem(key, JSON.stringify({ [id]: true }));
      },
      { key: COMPLETED_KEY, id: FIRST_LESSON.id }
    );
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await waitForHome(page);
    assert.match(
      new URL(page.url()).search,
      /view=home/,
      'Home must keep the address in step so the page can be shared and reloaded'
    );
    console.log('  ok a returning visit with no view lands on Home, and the address says so');

    // ---- 3. Today is one check, not a map ----
    assert.equal(await page.getByTestId('home-today').isVisible(), true);
    assert.match(
      (await page.getByTestId('home-today-checks').textContent()) ?? '',
      /0 of \d+ checks/,
      'Today must count the checks of the mission it measures, and only the ones this profile passed'
    );
    assert.equal(await page.getByTestId('btn-home-start').isEnabled(), true);
    console.log('  ok Today names the first mission’s one next check');

    // ---- 4. The labs are the rail, with every room on it ----
    assert.equal(
      await page.locator('[data-testid^="home-lab-"]').count(),
      TAB_IDS.length,
      `Home must offer every room the rail has (${TAB_IDS.length}); a tab added to the registry needs no edit here`
    );
    for (const tabId of TAB_IDS) {
      assert.equal(
        await page.getByTestId(`home-lab-${tabId}`).count(),
        1,
        `Home is missing the ${tabId} door`
      );
    }
    console.log(`  ok Home launches all ${TAB_IDS.length} labs from the rail's own registry`);

    // ---- 5. The route counts the same ten steps the roadmap prints ----
    assert.equal(
      await page.locator('[data-testid^="home-route-step-"]').count(),
      SPINE.length,
      `the route must list all ${SPINE.length} steps`
    );
    assert.match(
      (await page.getByTestId('home-route-total').textContent()) ?? '',
      /0 of \d+ checks/,
      'the route total must be check counts, not a second denominator'
    );
    console.log(`  ok the route is ${SPINE.length} steps of check counts`);

    // ---- 6. A lab card is a door, not a detail panel ----
    await page.getByTestId('home-lab-tab-bode').click();
    await page.getByTestId('tab-btn-tab-bode').waitFor({ timeout: 30000 });
    assert.equal(
      await page.getByTestId('tab-btn-tab-bode').getAttribute('aria-current'),
      'page',
      'a lab card must open that tab, not merely the workbench'
    );
    assert.equal(new URL(page.url()).searchParams.get('view'), null, 'the workbench is not a view query');
    console.log('  ok a lab card opens its own tab in one click');

    // ---- 7. The one next thing opens the lesson it named ----
    await page.goto(`${baseUrl}?view=home`, { waitUntil: 'domcontentloaded' });
    await waitForHome(page);
    await page.getByTestId('btn-home-start').click();
    await waitForEditor(page, undefined, 30000);
    const openedTitle = (await page.getByTestId('lesson-title').textContent())?.trim() ?? '';
    assert.equal(
      openedTitle,
      TODAY_TITLE,
      `Start must open the entry Today named ("${TODAY_ENTRY?.id}"); the editor shows "${openedTitle}"`
    );
    assert.equal(
      await page.getByTestId('home-dashboard').count(),
      0,
      'the workbench must replace Home rather than sit under it'
    );
    console.log(`  ok Start opened ${TODAY_ENTRY?.id} in one click`);

    // ---- 7b. Continue puts the reader back where it was left ----
    {
      const reader = page.getByTestId('reader-scroll');
      await reader.waitFor({ timeout: 30000 });
      const target = await reader.evaluate((pane) => {
        const furthest = Math.max(0, pane.scrollHeight - pane.clientHeight);
        pane.scrollTop = Math.min(900, furthest);
        pane.dispatchEvent(new Event('scroll', { bubbles: true }));
        return pane.scrollTop;
      });
      assert.ok(target > 120, `the pane must be long enough to scroll (moved ${target} px)`);
      // The write is debounced; one pause longer than the debounce is the whole contract.
      await page.waitForTimeout(700);
      await page.goto(`${baseUrl}?view=home`, { waitUntil: 'domcontentloaded' });
      await waitForHome(page);
      await page.getByTestId('btn-home-start').click();
      await waitForEditor(page, undefined, 30000);
      await page.getByTestId('reader-scroll').waitFor({ timeout: 30000 });
      await page.waitForTimeout(1200);
      const restored = await page.getByTestId('reader-scroll').evaluate((pane) => pane.scrollTop);
      assert.ok(
        Math.abs(restored - target) <= 24,
        `Continue must reopen the lesson at ${Math.round(target)} px, not ${Math.round(restored)} px`
      );
      console.log(`  ok Continue reopened the lesson at ${Math.round(restored)} px (left at ${Math.round(target)})`);
    }

    // ---- 7c. A selected passage can become a sticky note, not only a highlight ----
    {
      const pane = page.getByTestId('reader-scroll');
      const selected = await pane.evaluate((element) => {
        const paragraph = element.querySelector('p');
        if (!paragraph) return '';
        const range = document.createRange();
        range.selectNodeContents(paragraph);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
        return selection?.toString() ?? '';
      });
      assert.ok(selected.trim().length > 20, 'the reader must have a paragraph to select');
      await page.getByTestId('btn-sticky').click();
      await page.getByTestId('sticky-note-popup').waitFor({ timeout: 10000 });
      await page.getByTestId('sticky-note-text').fill('The sampling time is the thing I keep forgetting.');
      await page.getByTestId('btn-sticky-save').click();
      await page.waitForFunction(
        () => /Sticky note saved/.test(document.querySelector('[data-testid="reader-status"]')?.textContent ?? ''),
        undefined,
        { timeout: 10000 }
      );
      assert.equal(
        await page.getByTestId('sticky-note-popup').count(),
        0,
        'saving must close the popup rather than leave a stale selection in it'
      );
      console.log('  ok a selected passage opens a sticky-note popup and saves it to Notes');
    }

    // ---- 8. Review opens the deck where the cards live ----
    await page.goto(`${baseUrl}?view=home`, { waitUntil: 'domcontentloaded' });
    await waitForHome(page);
    await page.getByTestId('btn-home-review').click();
    await page.getByTestId('panel-study').waitFor({ timeout: 30000 });
    assert.equal(
      await page.getByTestId('tab-btn-tab-pyodide').getAttribute('aria-current'),
      'page',
      'the deck lives in the runner, so Review must go there'
    );
    console.log('  ok Review lands on the runner with the Study panel open');

    // ---- 9. The route door opens the roadmap ----
    await page.goto(`${baseUrl}?view=home`, { waitUntil: 'domcontentloaded' });
    await waitForHome(page);
    await page.getByTestId('btn-home-route').click();
    await page.getByTestId('tab-btn-tab-arch').waitFor({ timeout: 30000 });
    assert.equal(await page.getByTestId('tab-btn-tab-arch').getAttribute('aria-current'), 'page');
    console.log('  ok the route door opens the roadmap');

    // ---- 10. A reload stays in the sitting, and Home is not lapped ----
    await page.goto(`${baseUrl}?view=home`, { waitUntil: 'domcontentloaded' });
    await waitForHome(page);
    // No query at all: the sitting rule alone has to choose Home here.
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await waitForHome(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForHome(page);
    assert.match(new URL(page.url()).search, /view=home/, 'a reload must not be walked out of Home');
    console.log('  ok a reload inside the sitting stays on Home');

    // ---- 11. A lesson link is a destination, never the homepage ----
    await page.goto(`${baseUrl}?lesson=${FIRST_LESSON.id}`, { waitUntil: 'domcontentloaded' });
    await waitForEditor(page, undefined, 30000);
    assert.equal(
      await page.getByTestId('home-dashboard').count(),
      0,
      'a deep link to a lesson must land in the editor, not on a dashboard'
    );
    assert.equal(
      (await page.getByTestId('lesson-title').textContent())?.trim(),
      FIRST_LESSON.title,
      'the link must open the lesson it names'
    );
    console.log('  ok ?lesson= still opens that lesson, never Home');

    assert.deepEqual(pageErrors, [], `Home threw during the walk: ${pageErrors.join(' | ')}`);
    console.log(
      '[PASS] Home: a first visit stays on the workbench, a returning one lands on Home, ' +
        "Today's check, the labs, the route and review are all one click, a reload stays, and a lesson link bypasses it"
    );
    await context.close();
  } finally {
    await browser.close();
    if (ownServer) await ownServer.viteServer.close();
  }
}

main().catch((error) => {
  console.error('[FAIL] Home checks failed:', error.message);
  process.exit(1);
});
