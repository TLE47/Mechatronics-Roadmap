#!/usr/bin/env node
/**
 * The move to IndexedDB, in a real browser (`scripts/e2e_storage.mjs`, `npm run test:e2e:storage`).
 *
 * The unit suite pins the migration's order and the write-behind queue against a fake backend. What
 * only a browser can answer is whether the real database, the real first paint and the real store
 * modules agree — and whether a learner who used the previous version keeps what they wrote.
 *
 * So this suite starts as that learner: it fills the bucket with the six stores the way the old build
 * left them, reloads, and then checks three things in order of how much they would hurt if wrong:
 *
 *   1. nothing is lost — every value is in IndexedDB and the bucket no longer holds it;
 *   2. the screen shows it — the draft is in the editor, the note in the study panel, the commented
 *      passage a card in the deck, with no frame of empty state;
 *   3. new work goes to the same place — a note typed now lands in the database, not the bucket, and
 *      survives a reload.
 *
 * The last check is the one that fails silently if the write-behind queue is wrong: the note is read
 * back from IndexedDB first, then the page is reloaded and read from the screen.
 */

import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { bulkKeys, readBulk, waitForBulk } from './bulk_store_page.mjs';
import { resolveChromiumExecutable, startDevServer } from './e2e_browser_workbench.mjs';
import { getEditorCode, waitForEditor } from './editor-code.mjs';
import { PYTHON_LESSONS } from '../app/src/data/pythonLessonsData.ts';

const LESSON = PYTHON_LESSONS[0];
const DRAFT = '# a draft from before the move\nprint("carried over")\n';
const NOTE = 'the tolerance is on the angle, not the position';
const QUOTE = 'a passage kept before the move';
const CARRIED_AT = 1_700_000_000_000;
const TYPED = 'typed after the move: this lands in IndexedDB';

const KEYS = {
  drafts: 'mechalab_drafts_v1',
  history: 'mechalab_draft_history_v1',
  log: 'mechalab.learningLog.v1',
  study: 'mechalab_study_notes_v1',
  cards: 'mechalab_study_cards_v1',
  sittings: 'mechalab_sittings_v1',
};

/** What the previous build would have left in the bucket, key for key. */
const seed = {
  [KEYS.drafts]: JSON.stringify({ [LESSON.id]: DRAFT }),
  [KEYS.history]: JSON.stringify({
    [LESSON.id]: [{ code: DRAFT, at: CARRIED_AT, outcome: 'verified' }],
  }),
  [KEYS.log]: JSON.stringify([{ t: CARRIED_AT, kind: 'lesson_open', lesson: LESSON.id }]),
  [KEYS.study]: JSON.stringify({
    [LESSON.id]: {
      note: NOTE,
      highlights: [{ quote: QUOTE, comment: 'why it matters', at: CARRIED_AT }],
      updatedAt: CARRIED_AT,
    },
  }),
  [KEYS.cards]: JSON.stringify({}),
  [KEYS.sittings]: JSON.stringify([
    { start: CARRIED_AT, end: CARRIED_AT + 60_000, runs: 1, reviews: 0, lessons: [LESSON.id] },
  ]),
};

/** The bucket as the page sees it, for the "migrated, not copied" assertion. */
async function bucketKeys(page) {
  return page.evaluate((keys) => keys.filter((key) => localStorage.getItem(key) !== null), Object.values(KEYS));
}

async function openLesson(page) {
  await page.getByTestId('tab-btn-tab-pyodide').click();
  await page.getByTestId(`lesson-item-${LESSON.id}`).click();
  await waitForEditor(page, undefined, 20000);
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

    // ---- A learner from the previous version: the bucket holds all six stores ----
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('#root *')), undefined, {
      timeout: 30000,
    });
    await page.evaluate((entries) => {
      for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
    }, seed);

    // ---- Reload: hydration reads the database, migrates the bucket, then renders ----
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('#root *')), undefined, {
      timeout: 30000,
    });

    const leftInBucket = await bucketKeys(page);
    assert.deepEqual(
      leftInBucket,
      [],
      `the migrated stores must not stay in localStorage; still there: ${leftInBucket.join(', ')}`
    );

    const inDatabase = await bulkKeys(page);
    assert.deepEqual(
      inDatabase,
      Object.values(KEYS).sort(),
      `every store must be in IndexedDB after the move; the database holds ${inDatabase.join(', ')}`
    );
    // Per key rather than byte for byte: the app logs its own `lesson_open` on every load, so the log
    // grows during the move. What matters is that the carried entries are all there.
    const drafts = JSON.parse(await readBulk(page, KEYS.drafts));
    assert.deepEqual(drafts, JSON.parse(seed[KEYS.drafts]), 'the draft must arrive unchanged');
    const history = JSON.parse(await readBulk(page, KEYS.history));
    assert.deepEqual(history, JSON.parse(seed[KEYS.history]), 'the filed version must arrive unchanged');
    const study = JSON.parse(await readBulk(page, KEYS.study));
    assert.equal(study[LESSON.id].note, NOTE, 'the note must arrive unchanged');
    assert.equal(study[LESSON.id].highlights[0].quote, QUOTE, 'the kept passage must arrive unchanged');
    const log = JSON.parse(await readBulk(page, KEYS.log));
    assert.ok(
      log.some((event) => event.t === CARRIED_AT && event.lesson === LESSON.id),
      'the carried log event must survive the move'
    );
    const sittings = JSON.parse(await readBulk(page, KEYS.sittings));
    assert.ok(
      sittings.some((sitting) => sitting.start === CARRIED_AT),
      'the measured sitting must survive the move'
    );
    assert.ok(
      JSON.parse(await readBulk(page, KEYS.cards)) !== null,
      'the empty schedule store must have been carried as an empty store, not dropped'
    );
    console.log('  ok six stores left the bucket for IndexedDB, with their contents intact');

    // ---- The screen shows the carried-over work, without a frame of empty state ----
    await openLesson(page);
    assert.equal(await getEditorCode(page), DRAFT, 'the draft must be the text the editor opens with');
    const noteBox = page.getByTestId('study-note');
    await noteBox.waitFor({ timeout: 20000 });
    assert.equal(await noteBox.inputValue(), NOTE, 'the study panel must show the note that was written');
    const deck = page.getByTestId('btn-review-deck');
    await deck.waitFor({ timeout: 20000 });
    assert.match(
      (await deck.textContent()).trim(),
      /Review \(1 due\)/,
      'the commented passage must arrive as a card, so the deck is not empty after the move'
    );
    console.log('  ok the editor, the note box and the deck all show the work that was carried over');

    // ---- New work goes to the same place the old work went ----
    await noteBox.fill(TYPED);
    const typedStudy = await waitForBulk(
      page,
      KEYS.study,
      (stored) => stored[LESSON.id]?.note === TYPED
    );
    assert.equal(typedStudy[LESSON.id].highlights[0].quote, QUOTE, 'a typed note must not drop the highlights');
    assert.equal(
      await page.evaluate((key) => localStorage.getItem(key), KEYS.study),
      null,
      'a new note must not reappear in the bucket'
    );
    console.log('  ok a note typed now is in IndexedDB a tick later, and the bucket stays empty');

    // ---- Reload: the screen reads the new note back out of the database ----
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('#root *')), undefined, {
      timeout: 30000,
    });
    await openLesson(page);
    await page.getByTestId('study-note').waitFor({ timeout: 20000 });
    assert.equal(
      await page.getByTestId('study-note').inputValue(),
      TYPED,
      'a reload must read the note back from IndexedDB, not from a bucket the move emptied'
    );
    console.log('  ok the reload reads the note back from the database');

    assert.deepEqual(pageErrors, [], `the page must not throw while the store moves: ${pageErrors[0] ?? ''}`);
    console.log('[PASS] Storage: a pre-IndexedDB bucket migrates whole, the screen shows it, and new work stays in the database');
  } finally {
    await browser.close();
    if (ownServer) ownServer.viteServer.close();
  }
}

main().catch((error) => {
  console.error('[FAIL]', error?.stack ?? error);
  process.exit(1);
});
