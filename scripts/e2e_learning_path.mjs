#!/usr/bin/env node
/**
 * The Learning Path in a real browser (`scripts/e2e_learning_path.mjs`,
 * `npm run test:e2e:learning-path`).
 *
 * The unit suite pins the model, the serpentine and the memory. What only a browser can answer is
 * whether the page a learner actually reaches agrees with them:
 *
 *   - Lessons in the header tray opens the path, from Home and from the runner's own address;
 *   - the six prototype platforms render in curriculum order with labels you can read;
 *   - the real verified map produces all four states, seeded and unseeded;
 *   - a platform opens a preview, Start enters the runner on that lesson, and Back returns to the
 *     path at the offset it was left at;
 *   - a locked platform still previews, names its prerequisite, and refuses its action;
 *   - Escape closes the desktop card, and a phone gets the shared sheet instead.
 *
 * The suite uses its own contexts; the browser is shared. It deliberately does not click through the
 * runner beyond `lesson-brief`: the runner's grading is `e2e_focus`/`e2e_micro`'s job, and this
 * suite is about the door and the map.
 */

import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable, startDevServer } from './e2e_browser_workbench.mjs';
import { seedTourSeen } from './tour_seed.mjs';
import { PYTHON_LESSONS } from '../app/src/data/pythonLessonsData.ts';

const VERIFIED_KEY = 'mechalab_pyodide_verified_v1';
const PROTOTYPE = ['P.1', 'P.2', 'P.2.5', 'P.3', 'P.4', 'P.5'];
const titleOf = (id) => PYTHON_LESSONS.find((lesson) => lesson.id === id).title;

async function waitForPath(page) {
  await page.getByTestId('learning-path').waitFor({ timeout: 30000 });
  await page.getByTestId('lp-world').waitFor({ timeout: 30000 });
}

async function stateOf(page, id) {
  return page.getByTestId(`lp-lesson-${id}`).getAttribute('data-state');
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
    // ---- 1. An empty browser: one current, one available, the rest locked ----
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await seedTourSeen(context);
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(`${baseUrl}?view=lessons`, { waitUntil: 'domcontentloaded' });
    await waitForPath(page);
    assert.equal(
      await page.getByTestId('lp-progress').innerText(),
      '0 of 6 verified',
      'an empty browser starts at zero'
    );

    const nodes = page.locator('[data-testid^="lp-lesson-"]');
    assert.equal(await nodes.count(), 6, 'six prototype platforms');
    const order = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid^="lp-lesson-"]')].map((node) =>
        node.getAttribute('data-testid').replace('lp-lesson-', '')
      )
    );
    assert.deepEqual(order, PROTOTYPE, 'the city keeps curriculum order');
    assert.equal(await stateOf(page, 'P.1'), 'current');
    assert.equal(await stateOf(page, 'P.2'), 'available');
    assert.equal(await stateOf(page, 'P.2.5'), 'locked');
    assert.ok(
      (await page.getByTestId('lp-lesson-P.1').getAttribute('aria-label')).includes(titleOf('P.1')),
      'a platform announces its lesson title'
    );

    const labels = page.locator('[data-testid^="lp-lesson-"] .lp-name');
    assert.equal(await labels.count(), 6, 'every platform prints its lesson name');
    for (let index = 0; index < 6; index += 1) {
      assert.equal(await labels.nth(index).isVisible(), true, `label ${index + 1} is on screen`);
    }
    console.log('  ok Lessons opens the path: six platforms in order, four states from real progress');

    // ---- 2. Preview, Start, and Back with the offset remembered ----
    await page.getByTestId('lp-lesson-P.1').click();
    await page.getByTestId('lp-preview-card').waitFor({ timeout: 10000 });
    assert.equal(await page.getByTestId('lp-preview-title').innerText(), titleOf('P.1'));
    assert.equal(await page.getByTestId('lp-preview-action').isEnabled(), true);
    assert.equal(await page.getByTestId('lp-preview-action').innerText(), 'Start lesson');

    await page.evaluate(() => window.scrollTo(0, 140));
    await page.waitForFunction(() => window.scrollY >= 100, undefined, { timeout: 5000 });
    const leftAt = await page.evaluate(() => Math.round(window.scrollY));
    await page.getByTestId('lp-preview-action').click();
    await page.getByTestId('lesson-brief').waitFor({ timeout: 30000 });
    const lessonUrl = new URL(page.url());
    assert.equal(lessonUrl.searchParams.get('lesson'), 'P.1', 'the address names the started lesson');
    assert.equal(lessonUrl.searchParams.has('view'), false, 'the workbench is the bare workbench');
    console.log('  ok Start opens the runner on the chosen lesson');

    await page.goBack({ waitUntil: 'domcontentloaded' });
    await waitForPath(page);
    await page.waitForFunction(
      (expected) => Math.abs(window.scrollY - expected) <= 8,
      leftAt,
      { timeout: 10000 }
    );
    assert.equal(await stateOf(page, 'P.1'), 'current', 'Back does not verify anything by itself');
    console.log('  ok Back returns to the path at the offset it was left at');

    // ---- 3. A locked platform previews, names its prerequisite, and refuses ----
    await page.getByTestId('lp-lesson-P.3').click();
    await page.getByTestId('lp-preview-card').waitFor({ timeout: 10000 });
    assert.equal(await page.getByTestId('lp-preview-action').isDisabled(), true);
    assert.equal(await page.getByTestId('lp-preview-action').innerText(), 'Locked');
    const prereq = await page.getByTestId('lp-preview-prereq').innerText();
    // The lesson immediately before P.3 in this course is P.2.5, not P.2: the six are real order.
    assert.ok(
      prereq.includes(titleOf('P.2.5')),
      `a locked P.3 must name P.2.5 as its prerequisite, got: ${prereq}`
    );
    await page.keyboard.press('Escape');
    await page.getByTestId('lp-preview-card').waitFor({ state: 'detached', timeout: 5000 });
    console.log('  ok a locked platform previews its prerequisite and Escape closes the card');

    // ---- 4. The header tray's Lessons door goes to the path, not the runner ----
    await page.goto(`${baseUrl}?view=home`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('btn-open-lessons').waitFor({ timeout: 30000 });
    await page.getByTestId('btn-open-lessons').click();
    await waitForPath(page);
    assert.equal(new URL(page.url()).searchParams.get('view'), 'lessons');
    console.log('  ok the header Lessons door opens the Learning Path');

    // ---- 5. A seeded verification moves the whole window ----
    const seeded = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await seedTourSeen(seeded);
    await seeded.addInitScript((key) => {
      window.localStorage.setItem(key, JSON.stringify({ 'P.1': true }));
    }, VERIFIED_KEY);
    const seededPage = await seeded.newPage();
    const seededErrors = [];
    seededPage.on('pageerror', (error) => seededErrors.push(error.message));
    await seededPage.goto(`${baseUrl}?view=lessons`, { waitUntil: 'domcontentloaded' });
    await waitForPath(seededPage);
    assert.equal(await seededPage.getByTestId('lp-progress').innerText(), '1 of 6 verified');
    assert.equal(await stateOf(seededPage, 'P.1'), 'completed');
    assert.equal(await stateOf(seededPage, 'P.2'), 'current');
    assert.equal(await stateOf(seededPage, 'P.2.5'), 'available');
    assert.equal(await stateOf(seededPage, 'P.3'), 'locked');
    await seededPage.getByTestId('lp-lesson-P.1').click();
    await seededPage.getByTestId('lp-preview-card').waitFor({ timeout: 10000 });
    assert.equal(await seededPage.getByTestId('lp-preview-action').innerText(), 'Review lesson');
    await seededPage.keyboard.press('Escape');
    console.log('  ok one seeded verification completes P.1, moves Current and Availability down');

    assert.deepEqual(pageErrors, [], `the page threw: ${pageErrors.join(' | ')}`);
    assert.deepEqual(seededErrors, [], `the seeded page threw: ${seededErrors.join(' | ')}`);
    await seeded.close();
    await context.close();

    // ---- 6. A phone taps a platform and gets the sheet, not a floating card ----
    const phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await seedTourSeen(phone);
    const phonePage = await phone.newPage();
    const phoneErrors = [];
    phonePage.on('pageerror', (error) => phoneErrors.push(error.message));
    await phonePage.goto(`${baseUrl}?view=lessons`, { waitUntil: 'domcontentloaded' });
    await waitForPath(phonePage);
    assert.equal(
      await phonePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      true,
      'the path has no horizontal scroll on a phone'
    );
    await phonePage.getByTestId('lp-lesson-P.1').click();
    await phonePage.getByTestId('lp-preview-sheet').waitFor({ timeout: 10000 });
    await phonePage.getByTestId('lp-preview-action').click();
    // A phone's runner opens on its own surface switch; the lesson brief is one of those surfaces,
    // not a promise that it is the first one on a 390 px screen. The tab and the address are the
    // stable proof that Start landed on the lesson.
    await phonePage.getByTestId('tab-btn-tab-pyodide').waitFor({ state: 'attached', timeout: 30000 });
    assert.equal(
      await phonePage.getByTestId('tab-btn-tab-pyodide').getAttribute('aria-current'),
      'page',
      'Start must leave the runner as the open tab, even where the rail is the phone picker\'s job'
    );
    assert.equal(await phonePage.getByTestId('learning-path').count(), 0);
    assert.equal(new URL(phonePage.url()).searchParams.get('lesson'), 'P.1');
    assert.deepEqual(phoneErrors, [], `the phone page threw: ${phoneErrors.join(' | ')}`);
    await phone.close();

    console.log('[PASS] Learning Path: the Lessons door, six ordered platforms, the four seeded ' +
      'states, preview, Start into the runner, Back at the same offset, a locked prerequisite, ' +
      'Escape, and the phone sheet');
  } finally {
    await browser.close();
    if (ownServer) await ownServer.viteServer.close();
  }
}

main().catch((error) => {
  console.error('[FAIL] Learning Path checks failed:', error.message);
  process.exit(1);
});
