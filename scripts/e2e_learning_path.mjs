#!/usr/bin/env node
/**
 * The Learning Path in a real browser (`scripts/e2e_learning_path.mjs`,
 * `npm run test:e2e:learning-path`).
 *
 * The unit suite pins the model, the serpentine, the bands and the memory. What only a browser can
 * answer is whether the page a learner actually reaches agrees with them:
 *
 *   - Lessons in the header tray opens the path, from Home and from the runner's own address;
 *   - every one of the 97 registry lessons renders in curriculum order, from Python through the
 *     math ramp, Stage 0, tracks 00–08 and every module lab;
 *   - the district map names all 21 districts and jumps to the last one, so late phases are
 *     reachable without dragging a ten-thousand-pixel page;
 *   - the real verified map produces all four states, seeded and unseeded, and a phone sees the
 *     same 97 platforms with no horizontal scroll;
 *   - a platform opens a preview with its place in the whole path, Start enters the runner on that
 *     lesson, and Back returns to the path at the offset it was left at;
 *   - a locked platform still previews, names the lesson before it, and refuses its action.
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
const IDS = PYTHON_LESSONS.map((lesson) => lesson.id);
const LAST = IDS[IDS.length - 1];
const BEFORE_LAST = IDS[IDS.length - 2];
const titleOf = (id) => PYTHON_LESSONS.find((lesson) => lesson.id === id).title;

async function waitForPath(page) {
  await page.getByTestId('learning-path').waitFor({ timeout: 30000 });
  await page.getByTestId('lp-world').waitFor({ timeout: 30000 });
}

async function stateOf(page, id) {
  return page.getByTestId(`lp-lesson-${id}`).getAttribute('data-state');
}

/** Scroll the city to a district through the map, and wait until its first platform is in view. */
async function jumpToDistrict(page, index, firstId) {
  await page.getByTestId(`lp-district-${index}`).click();
  await page.waitForFunction(
    (id) => {
      const node = document.querySelector(`[data-testid="lp-lesson-${id}"]`);
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      return rect.top >= 0 && rect.top < window.innerHeight * 0.7;
    },
    firstId,
    { timeout: 20000 }
  );
  // Let the smooth scroll finish before the map's active-chip assertion reads its state.
  await page.waitForFunction(
    () =>
      new Promise((resolve) => {
        const before = window.scrollY;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolve(window.scrollY === before))
        );
      }),
    undefined,
    { timeout: 10000, polling: 100 }
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
    // ---- 1. An empty browser: the whole registry, current, available, the rest locked ----
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await seedTourSeen(context);
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(`${baseUrl}?view=lessons`, { waitUntil: 'domcontentloaded' });
    await waitForPath(page);
    assert.equal(
      await page.getByTestId('lp-progress').innerText(),
      '0 of 97 verified',
      'an empty browser starts at zero over the whole curriculum'
    );

    const nodes = page.locator('[data-testid^="lp-lesson-"]');
    assert.equal(await nodes.count(), 97, 'every registry lesson is a platform');
    const order = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid^="lp-lesson-"]')].map((node) =>
        node.getAttribute('data-testid').replace('lp-lesson-', '')
      )
    );
    assert.deepEqual(order, IDS, 'the city keeps the registry order exactly');
    assert.equal(await stateOf(page, 'P.1'), 'current');
    assert.equal(await stateOf(page, 'P.2'), 'available');
    assert.equal(await stateOf(page, 'P.2.5'), 'locked');
    assert.equal(await stateOf(page, LAST), 'locked', 'the final capstone is present and locked');
    assert.ok(
      (await page.getByTestId('lp-lesson-P.1').getAttribute('aria-label')).includes(titleOf('P.1')),
      'a platform announces its lesson title'
    );

    const labels = page.locator('[data-testid^="lp-lesson-"] .lp-name');
    assert.equal(await labels.count(), 97, 'every platform prints its lesson name');
    assert.equal(await labels.first().isVisible(), true, 'the first label is on screen');
    assert.equal(
      await page.getByTestId('lp-lesson-P.1').getAttribute('data-district'),
      'track-p',
      'the first platform belongs to the Python district'
    );
    assert.equal(
      await page.getByTestId(`lp-lesson-${LAST}`).getAttribute('data-district'),
      'modules:08-capstones',
      'the last platform belongs to the capstone-lab district'
    );

    const chips = page.locator('[data-testid^="lp-district-"]');
    assert.equal(await chips.count(), 21, 'all 21 districts have a map chip');
    assert.ok(
      (await page.getByTestId('lp-district-0').getAttribute('aria-label')).includes('0 of 16 verified')
    );
    assert.ok(
      (await page.getByTestId('lp-district-20').getAttribute('aria-label')).includes('0 of 1 verified')
    );
    assert.equal(
      await page.getByTestId('lp-district-20').locator('.lp-district-name').innerText(),
      '08 lab'
    );
    assert.equal(
      await page.getByTestId('lp-district-20').locator('.lp-district-count').innerText(),
      '0/1'
    );
    console.log('  ok 97 platforms in registry order, 21 district chips, four states from real progress');

    // ---- 2. Preview, Start, and Back with the offset remembered ----
    await page.getByTestId('lp-lesson-P.1').click();
    await page.getByTestId('lp-preview-card').waitFor({ timeout: 10000 });
    assert.equal(await page.getByTestId('lp-preview-title').innerText(), titleOf('P.1'));
    assert.equal(
      (await page.locator('.lp-preview-kicker').innerText()).toLowerCase(),
      'lesson 1 of 97 · python track',
      'the preview names the lesson place in the whole path'
    );
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

    // ---- 4. The map reaches the final district, and its capstone refuses too ----
    await jumpToDistrict(page, 20, LAST);
    assert.equal(await stateOf(page, LAST), 'locked');
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="lp-district-20"]')?.getAttribute('data-active') ===
        'true',
      undefined,
      { timeout: 5000 }
    );
    await page.getByTestId(`lp-lesson-${LAST}`).click();
    await page.getByTestId('lp-preview-card').waitFor({ timeout: 10000 });
    assert.equal(
      (await page.locator('.lp-preview-kicker').innerText()).toLowerCase(),
      'lesson 97 of 97 · capstone labs',
      'the last lesson knows it is last'
    );
    const lastPrereq = await page.getByTestId('lp-preview-prereq').innerText();
    assert.ok(
      lastPrereq.includes(titleOf(BEFORE_LAST)),
      `the capstone must name ${BEFORE_LAST} as its prerequisite, got: ${lastPrereq}`
    );
    assert.equal(await page.getByTestId('lp-preview-action').isDisabled(), true);
    await page.keyboard.press('Escape');
    console.log('  ok the district map jumps to the final capstone, whose prerequisite is the prior row');

    // ---- 5. The header tray's Lessons door goes to the path, not the runner ----
    await page.goto(`${baseUrl}?view=home`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('btn-open-lessons').waitFor({ timeout: 30000 });
    await page.getByTestId('btn-open-lessons').click();
    await waitForPath(page);
    assert.equal(new URL(page.url()).searchParams.get('view'), 'lessons');
    console.log('  ok the header Lessons door opens the Learning Path');

    // ---- 6. Seeded progress moves the window and the last district's counter ----
    const seeded = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await seedTourSeen(seeded);
    await seeded.addInitScript(
      ({ key, ids }) => {
        window.localStorage.setItem(key, JSON.stringify({ [ids[0]]: true, [ids[1]]: true }));
      },
      { key: VERIFIED_KEY, ids: [IDS[0], LAST] }
    );
    const seededPage = await seeded.newPage();
    const seededErrors = [];
    seededPage.on('pageerror', (error) => seededErrors.push(error.message));
    await seededPage.goto(`${baseUrl}?view=lessons`, { waitUntil: 'domcontentloaded' });
    await waitForPath(seededPage);
    assert.equal(await seededPage.getByTestId('lp-progress').innerText(), '2 of 97 verified');
    assert.equal(await stateOf(seededPage, 'P.1'), 'completed');
    assert.equal(await stateOf(seededPage, 'P.2'), 'current');
    assert.equal(await stateOf(seededPage, 'P.2.5'), 'available');
    assert.equal(await stateOf(seededPage, 'P.3'), 'locked');
    assert.equal(await stateOf(seededPage, LAST), 'completed', 'progress reaches the final phase');
    assert.ok(
      (await seededPage.getByTestId('lp-district-20').getAttribute('aria-label')).includes(
        '1 of 1 verified'
      ),
      'the last district counts its own verified lesson'
    );
    await seededPage.getByTestId('lp-lesson-P.1').click();
    await seededPage.getByTestId('lp-preview-card').waitFor({ timeout: 10000 });
    assert.equal(    await seededPage.getByTestId('lp-preview-action').innerText(), 'Review lesson');
    await seededPage.keyboard.press('Escape');
    await seededPage.getByTestId(`lp-lesson-${LAST}`).click();
    await seededPage.getByTestId('lp-preview-card').waitFor({ timeout: 10000 });
    assert.equal(await seededPage.getByTestId('lp-preview-title').innerText(), titleOf(LAST));
    assert.equal(
      (await seededPage.getByTestId('lp-preview-tier').innerText()).toLowerCase(),
      'tier 3',
      'the completed capstone progress also reads its module tier'
    );
    await seededPage.keyboard.press('Escape');
    console.log('  ok seeded progress moves Current mid-curriculum and marks the last district done');

    assert.deepEqual(pageErrors, [], `the page threw: ${pageErrors.join(' | ')}`);
    assert.deepEqual(seededErrors, [], `the seeded page threw: ${seededErrors.join(' | ')}`);
    await seeded.close();
    await context.close();

    // ---- 7. A phone sees the same city, uses the same map, and gets the sheet ----
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
      await phonePage.locator('[data-testid^="lp-lesson-"]').count(),
      97,
      'a phone gets the complete curriculum too'
    );
    assert.equal(
      await phonePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      true,
      'the path has no horizontal scroll on a phone'
    );
    await jumpToDistrict(phonePage, 20, LAST);
    assert.equal(await phonePage.getByTestId(`lp-lesson-${LAST}`).isVisible(), true);
    await phonePage.getByTestId(`lp-lesson-${LAST}`).click();
    await phonePage.getByTestId('lp-preview-sheet').waitFor({ timeout: 10000 });
    assert.equal(await phonePage.getByTestId('lp-preview-action').isDisabled(), true);
    await phonePage.getByTestId('lp-preview-sheet-close').click();
    await phonePage.getByTestId('lp-preview-sheet').waitFor({ state: 'detached', timeout: 5000 });

    await jumpToDistrict(phonePage, 0, 'P.1');
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

    console.log('[PASS] Learning Path: all 97 lessons in order, 21 district chips, map jump to the ' +
      'capstone, four states, preview/Start/Back, locked prerequisites, and phone parity');
  } finally {
    await browser.close();
    if (ownServer) await ownServer.viteServer.close();
  }
}

main().catch((error) => {
  console.error('[FAIL] Learning Path checks failed:', error.message);
  process.exit(1);
});
