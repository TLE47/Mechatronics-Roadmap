#!/usr/bin/env node
/**
 * Erasing progress in a real browser (`scripts/e2e_reset.mjs`, `npm run test:e2e:reset`).
 *
 * The Node suite pins the rules against a fake store. What only a browser can answer is whether the
 * reset reaches the **screen**: the App holds its own copy of the three progress maps, so a reset that
 * only wrote the stores would leave a milestone showing "Marked done" until the next reload. Every
 * assertion below that is worth anything is made *without* a reload for that reason.
 *
 * It also proves the two promises the dialog makes:
 *
 *   - **one part means one part** — resetting Lessons leaves the milestone's tick in the store and on
 *     the roadmap;
 *   - **preferences are not progress** — Reset everything empties every work key while the theme and
 *     the sound choice seeded before the visit are still exactly as they were.
 *
 * And it walks the safety net first: "Back up first" must produce a download before anything is
 * erased, because there is no undo behind it.
 */

import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable, startDevServer } from './e2e_browser_workbench.mjs';
import { seedTourSeen } from './tour_seed.mjs';

const MILESTONE_SELECTOR = '[data-testid^="btn-milestone-"]';
const VERIFIED_KEY = 'mechalab_pyodide_verified_v1';
const COMPLETED_KEY = 'mechalab_pyodide_completed_v1';
const MILESTONES_KEY = 'mechalab_linear_milestones_v1';
const THEME_KEY = 'mechalab_theme_v1';
const SOUND_KEY = 'mechalab_sound_v1';
/** Every store a reset of everything has to leave empty, by the key it lives under. */
const WORK_KEYS = [
  VERIFIED_KEY,
  COMPLETED_KEY,
  MILESTONES_KEY,
  'mechalab_verify_stamps_v1',
  'mechalab_awards_v1',
  'mechalab_study_cards_v1',
  'mechalab_study_notes_v1',
  'mechalab_lesson_checks_v1',
  'mechalab_drafts_v1',
  'mechalab_draft_history_v1',
  'mechalab.learningLog.v1',
  'mechalab_sittings_v1',
  'mechalab_predictions_v1',
  'mechalab_tour_v1',
  'mechalab_prologue_seen_v1',
  'mechalab_start_here_dismissed_v1',
  'mechalab_first_guide_dismissed_v1',
  'mechalab_last_lesson_v1',
  'mechalab_last_visit_v1',
  'mechalab_reading_position_v1',
];

const readStore = (page) =>
  page.evaluate((keys) => {
    const out = { resetAt: localStorage.getItem('mechalab.progress.resetAt.v1') };
    for (const key of keys) out[key] = localStorage.getItem(key);
    return out;
  }, [...WORK_KEYS, THEME_KEY, SOUND_KEY]);

/** A flag map with nothing true in it — the App writes `{}` back after a reset, not a removal. */
function noFlags(raw) {
  if (raw === null) return true;
  try {
    const parsed = JSON.parse(raw);
    return Boolean(parsed) && typeof parsed === 'object' && Object.values(parsed).every((value) => value !== true);
  } catch {
    return false;
  }
}

/** An empty collection, whichever shape its store writes it back as. */
function emptyStore(raw) {
  if (raw === null) return true;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.length === 0;
    if (!parsed || typeof parsed !== 'object') return false;
    for (const field of ['awards', 'records', 'events', 'versions', 'sittings']) {
      if (field in parsed && Array.isArray(parsed[field])) return parsed[field].length === 0;
    }
    return Object.values(parsed).every(
      (value) =>
        value === false ||
        value === null ||
        (typeof value === 'object' && value !== null && Object.keys(value).length === 0)
    );
  } catch {
    return false;
  }
}

/** Is this work key empty, by the shape its own store round-trips to? */
function emptyWork(key, raw) {
  if (key === VERIFIED_KEY || key === MILESTONES_KEY || key === COMPLETED_KEY) return noFlags(raw);
  if (key === 'mechalab_start_here_dismissed_v1') return raw !== '1';
  if (key === 'mechalab_tour_v1') return raw === null || /"not-started"/.test(raw);
  return emptyStore(raw);
}

async function openRoadmap(page) {
  await page.getByTestId('tab-btn-tab-arch').click();
  await page.waitForSelector(MILESTONE_SELECTOR, { timeout: 20000 });
}

async function openReset(page) {
  await page.getByTestId('btn-open-reset').click();
  await page.getByTestId('reset-dialog').waitFor({ timeout: 15000 });
  // The button lives in the header, which paints a backdrop blur — and a filter makes its element the
  // containing block for `position: fixed` children. Mounted in that tree the panel anchored to the
  // 88 px tray and opened at a negative top: visible to `waitFor`, useless to a learner. So the panel
  // is checked against the viewport, not merely for existence.
  const box = await page.evaluate(() => {
    const dialog = document.querySelector('[data-testid="reset-dialog"]');
    const scrim = dialog?.parentElement;
    const panel = dialog?.getBoundingClientRect();
    const cover = scrim?.getBoundingClientRect();
    return {
      top: panel?.top ?? -1,
      left: panel?.left ?? -1,
      coverTop: cover?.top ?? -1,
      coverHeight: cover?.height ?? -1,
      viewport: window.innerHeight,
    };
  });
  assert.ok(box.top >= 0, `the panel must open inside the viewport, got top=${box.top}`);
  assert.ok(box.left >= 0, `the panel must open inside the viewport, got left=${box.left}`);
  assert.ok(
    Math.abs(box.coverTop) < 1 && box.coverHeight >= box.viewport - 1,
    `the scrim must cover the viewport, got ${JSON.stringify(box)}`
  );
}

async function pressTwice(page, testId) {
  const button = page.getByTestId(testId);
  await button.click();
  // The first press only arms: the label says so, and the store must not have moved yet.
  await page.waitForFunction(
    (id) => /Press again/.test(document.querySelector(`[data-testid="${id}"]`)?.textContent ?? ''),
    testId,
    { timeout: 5000 }
  );
  await button.click();
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
    const context = await browser.newContext({ acceptDownloads: true });
    await seedTourSeen(context);
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('#root *')), undefined, {
      timeout: 30000,
    });

    // ---- A milestone the app writes itself, plus a verdict and a draft seeded into the stores ----
    await openRoadmap(page);
    const candidate = page.locator(MILESTONE_SELECTOR, { hasText: 'Mark done (self-reported)' }).nth(1);
    const milestoneTestId = await candidate.getAttribute('data-testid');
    assert.ok(milestoneTestId, 'the roadmap must offer a self-reported milestone to tick');
    await page.getByTestId(milestoneTestId).click();
    await page.waitForFunction(
      (id) => /Marked done/.test(document.querySelector(`[data-testid="${id}"]`)?.textContent ?? ''),
      milestoneTestId,
      { timeout: 15000 }
    );

    await page.evaluate(
      ({ verifiedKey, themeKey, soundKey }) => {
        localStorage.setItem(verifiedKey, JSON.stringify({ 'P.1': true, 'P.2': true }));
        localStorage.setItem('mechalab_drafts_v1', JSON.stringify({ 'P.1': 'print("draft")\n' }));
        localStorage.setItem(
          'mechalab_lesson_checks_v1',
          JSON.stringify({ 'P.1': { done: ['Run the sweep', 'Read the trace'], updatedAt: 1 } })
        );
        // Preferences: these must survive every reset, including "everything".
        localStorage.setItem(themeKey, 'paper');
        localStorage.setItem(soundKey, JSON.stringify({ master: 0.4, music: 0.1 }));
      },
      { verifiedKey: VERIFIED_KEY, themeKey: THEME_KEY, soundKey: SOUND_KEY }
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('#root *')), undefined, {
      timeout: 30000,
    });
    await openRoadmap(page);
    await page.getByTestId(milestoneTestId).waitFor({ timeout: 20000 });
    assert.match(
      (await page.getByTestId(milestoneTestId).textContent()) ?? '',
      /Marked done/,
      'the seeded milestone must still read as ticked before the reset'
    );

    // ---- The panel: twelve parts, with the counts the stores actually hold ----
    await openReset(page);
    assert.equal(
      await page.locator('[data-testid^="reset-row-"]').count(),
      12,
      'the panel must offer every part'
    );
    assert.match(await page.getByTestId('reset-count-lessons').textContent(), /2 verified/, 'lessons count');
    assert.match(await page.getByTestId('reset-count-checks').textContent(), /2 ticks in 1 lesson/, 'checklist count');
    assert.match(await page.getByTestId('reset-count-milestones').textContent(), /1 milestone/, 'milestone count');
    assert.match(await page.getByTestId('reset-count-drafts').textContent(), /1 draft/, 'draft count');

    // ---- The safety net first: an archive before anything is erased ----
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await page.getByTestId('btn-reset-backup').click();
    const download = await downloadPromise;
    assert.match(
      download.suggestedFilename(),
      /^mechalab-backup-\d{4}-\d{2}-\d{2}\.zip$/,
      `Back up first must write a real archive; got ${download.suggestedFilename()}`
    );
    assert.match(
      await page.getByTestId('reset-status').textContent(),
      /Backed up/,
      'the panel must say the archive was written'
    );

    // ---- A part opens: one lesson, not the whole store ----
    // The row is a door, not only a button: a learner who verified the wrong lesson must be able to
    // erase that one without losing the lesson beside it.
    await page.getByTestId('btn-expand-lessons').click();
    await page.getByTestId('reset-items-lessons').waitFor({ timeout: 10000 });
    assert.equal(
      await page.locator('[data-testid^="reset-item-lessons-"]').count(),
      2,
      'Lessons must open into its two seeded lessons'
    );
    await page.getByTestId('btn-reset-item-lessons-P-2').click();
    assert.match(
      await page.getByTestId('reset-status').textContent(),
      /Press the same button again/,
      'one item still takes two presses'
    );
    await page.getByTestId('btn-reset-item-lessons-P-2').click();
    await page.waitForFunction(
      () => /Reset 1 item · Lessons/.test(document.querySelector('[data-testid="reset-status"]')?.textContent ?? ''),
      undefined,
      { timeout: 10000 }
    );
    assert.match(
      await page.getByTestId('reset-count-lessons').textContent(),
      /1 verified/,
      'the part must recount what is left, not what was there'
    );
    const afterItem = await readStore(page);
    assert.deepEqual(
      Object.keys(JSON.parse(afterItem[VERIFIED_KEY] || '{}')),
      ['P.1'],
      'P.2 is gone and P.1 is untouched'
    );
    assert.ok(afterItem.resetAt, 'erasing one lesson still leaves the merge watermark');
    await page.getByTestId('btn-expand-lessons').click();

    // ---- One part: Lessons. The store moves, and the milestone does not ----
    await pressTwice(page, 'btn-reset-lessons');
    await page.waitForFunction(
      () => /Reset 1 item · Lessons/.test(document.querySelector('[data-testid="reset-status"]')?.textContent ?? ''),
      undefined,
      { timeout: 10000 }
    );
    let stored = await readStore(page);
    assert.ok(noFlags(stored[VERIFIED_KEY]), `the verdict must be gone from the store: ${stored[VERIFIED_KEY]}`);
    assert.ok(stored[MILESTONES_KEY], 'the milestone is a different part and must still be stored');
    assert.ok(stored.resetAt, 'a part the account holds must leave the watermark');
    assert.match(
      await page.getByTestId('reset-count-milestones').textContent(),
      /1 milestone/,
      'the panel must recount only the part that was reset'
    );
    await page.keyboard.press('Escape');
    await page.getByTestId('reset-dialog').waitFor({ state: 'detached', timeout: 10000 });
    assert.match(
      (await page.getByTestId(milestoneTestId).textContent()) ?? '',
      /Marked done/,
      'resetting lessons must not untick a milestone on the roadmap'
    );

    // ---- No reload: the screen follows the store for the part that was reset ----
    await openReset(page);
    await pressTwice(page, 'btn-reset-milestones');
    await page.keyboard.press('Escape');
    await page.getByTestId('reset-dialog').waitFor({ state: 'detached', timeout: 10000 });
    await page.waitForFunction(
      (id) => /Mark done \(self-reported\)/.test(document.querySelector(`[data-testid="${id}"]`)?.textContent ?? ''),
      milestoneTestId,
      { timeout: 15000 }
    );
    stored = await readStore(page);
    assert.ok(noFlags(stored[MILESTONES_KEY]), `the milestone store must be empty: ${stored[MILESTONES_KEY]}`);

    // ---- Everything, and the preferences it must not touch ----
    await openReset(page);
    await pressTwice(page, 'btn-reset-everything');
    await page.waitForFunction(
      () => /Reset \d+ items/.test(document.querySelector('[data-testid="reset-status"]')?.textContent ?? ''),
      undefined,
      { timeout: 10000 }
    );
    await page.keyboard.press('Escape');
    stored = await readStore(page);
    for (const key of WORK_KEYS) {
      assert.ok(emptyWork(key, stored[key]), `${key} should be empty after Reset everything: ${stored[key]}`);
    }
    assert.equal(stored[THEME_KEY], 'paper', 'the theme is a choice about a screen, not progress');
    assert.equal(stored[SOUND_KEY], '{"master":0.4,"music":0.1}', 'sound levels must survive the reset');
    assert.ok(stored.resetAt, 'the watermark stays');

    // ---- A phone: one column, and a footer whose sentence gets a line of its own ----
    // With `flex-1` and no basis the sentence was given the ~70 px the two buttons left over, which
    // stacked it one word per line and made a 250 px footer sit on top of the list.
    await page.setViewportSize({ width: 390, height: 844 });
    await openReset(page);
    const narrow = await page.evaluate(() => {
      const status = document.querySelector('[data-testid="reset-status"]')?.getBoundingClientRect();
      const panel = document.querySelector('[data-testid="reset-dialog"]')?.getBoundingClientRect();
      const parts = document.querySelector('[data-testid="reset-parts"]');
      return {
        statusWidth: status?.width ?? 0,
        statusHeight: status?.height ?? 0,
        panelWidth: panel?.width ?? 0,
        columns: parts ? getComputedStyle(parts).gridTemplateColumns.split(' ').length : 0,
        viewport: window.innerWidth,
      };
    });
    assert.ok(narrow.panelWidth <= narrow.viewport, `the panel must fit a 390 px screen: ${narrow.panelWidth}`);
    assert.ok(narrow.statusWidth > 200, `the status needs a line of its own, got ${narrow.statusWidth} px`);
    assert.ok(narrow.statusHeight <= 40, `the status must not stack word by word: ${narrow.statusHeight} px`);
    assert.equal(narrow.columns, 1, 'the parts are one column on a phone');
    await page.keyboard.press('Escape');
    await page.getByTestId('reset-dialog').waitFor({ state: 'detached', timeout: 10000 });
    await page.setViewportSize({ width: 1280, height: 720 });

    // ---- The dialog is closed on the key every other modal uses, and nothing threw ----
    assert.equal(await page.getByTestId('reset-dialog').count(), 0, 'Escape must close the panel');
    assert.deepEqual(pageErrors, [], `the page must not throw during a reset: ${pageErrors.join(' | ')}`);
    await context.close();
    console.log('reset: 1 part, 2 parts, everything, preferences kept — 0 page errors');
  } finally {
    await browser.close();
    if (ownServer) await ownServer.viteServer.close();
  }
}

main().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
