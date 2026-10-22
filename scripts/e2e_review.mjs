#!/usr/bin/env node
/**
 * Pin, comment, review, reload — in a real browser (`scripts/e2e_review.mjs`, `npm run test:e2e:review`).
 *
 * The unit suite pins the scheduler's arithmetic and the store's joins against a fake bucket. What it
 * cannot pin is the loop a learner actually walks: select a line of the lesson, pin it, say why it
 * matters, and have that comment become the answer side of a card that the same panel then asks back.
 * So this suite does it through the UI only — a real DOM selection, the real pin button, the real
 * comment box, the real review deck — and then reloads the page to prove the schedule survived, because
 * "it looked right in React state" was never the claim.
 *
 * The last check is the honest one: after the rating, the deck must say nothing is due, and the store
 * must hold a schedule whose due date is in the future. A card that comes back the same sitting would
 * pass a screenshot and fail the learner.
 */

import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable, startDevServer } from './e2e_browser_workbench.mjs';
import { waitForEditor } from './editor-code.mjs';
import { PYTHON_LESSONS } from '../app/src/data/pythonLessonsData.ts';
import { DAY_MS } from '../app/src/fsrs.ts';

const LESSON = PYTHON_LESSONS[0];
const CARDS_KEY = 'mechalab_study_cards_v1';
const COMMENT = 'this is the sentence I keep coming back to';

/** Select the lesson heading, so the quote is a real passage of the lesson rather than a literal. */
async function selectLessonTitle(page) {
  const selected = await page.evaluate(() => {
    const title = document.querySelector('[data-testid="lesson-title"]');
    if (!title) return '';
    const range = document.createRange();
    range.selectNodeContents(title);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    return selection.toString();
  });
  return selected.replace(/\s+/g, ' ').trim();
}

async function openLesson(page) {
  await page.getByTestId('tab-btn-tab-pyodide').click();
  await page.getByTestId(`lesson-item-${LESSON.id}`).click();
  await waitForEditor(page, undefined, 20000);
  await page.getByTestId('lesson-title').waitFor({ timeout: 20000 });
}

async function deckButton(page) {
  const button = page.getByTestId('btn-review-deck');
  await button.waitFor({ timeout: 20000 });
  return button;
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
    await openLesson(page);
    console.log('  · lesson open');

    // ---- A card is made by hand: select, pin, comment ----
    const emptyDeck = await deckButton(page);
    assert.equal(
      await emptyDeck.isDisabled(),
      true,
      'with nothing pinned the deck must offer nothing to review'
    );
    const quote = await selectLessonTitle(page);
    assert.ok(quote.length > 3, `expected the lesson heading to be selectable, got "${quote}"`);

    await page.getByTestId('btn-pin-selection').click();
    await page.getByTestId('study-highlight-0').waitFor({ timeout: 20000 });
    const commentBox = page.getByTestId('study-highlight-comment-0');
    await commentBox.fill(COMMENT);
    await commentBox.press('Enter');
    await page.waitForFunction(
      (text) =>
        (document.querySelector('[data-testid="study-status"]')?.textContent ?? '').includes(text),
      'Comment saved',
      { timeout: 20000 }
    );
    await page.waitForFunction(
      () => /Review \(1 due\)/.test(document.querySelector('[data-testid="btn-review-deck"]')?.textContent ?? ''),
      undefined,
      { timeout: 20000 }
    );
    console.log(`  ok pinning "${quote.slice(0, 40)}…" and commenting made one due card`);

    // ---- The card asks the quote and hides the answer until asked ----
    await page.getByTestId('btn-review-deck').click();
    const card = page.getByTestId('review-card');
    await card.waitFor({ timeout: 20000 });
    assert.equal((await page.getByTestId('review-front').textContent()).replace(/\s+/g, ' ').trim(), quote);
    assert.equal(await page.getByTestId('review-answer').count(), 0, 'the answer must not be shown before the ask');
    assert.equal(await page.getByTestId('btn-rate-3').count(), 0, 'no rating before the answer is revealed');
    assert.match(
      (await page.getByTestId('review-source').textContent()).trim(),
      new RegExp(LESSON.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      'the card must say which lesson it came from'
    );

    await page.getByTestId('btn-show-answer').click();
    await page.getByTestId('review-answer').waitFor({ timeout: 20000 });
    assert.equal((await page.getByTestId('review-answer').textContent()).includes(COMMENT), true);
    for (const grade of [1, 2, 3, 4]) {
      assert.equal(await page.getByTestId(`btn-rate-${grade}`).isVisible(), true, `rating ${grade} missing`);
    }
    console.log('  ok the card asked, then revealed the answer and four ratings');

    // ---- Rate it: the schedule is written and the deck stops offering it ----
    await page.getByTestId('btn-rate-3').click();
    await page.waitForFunction(
      () => /^Rated · back in \d+ days?$/.test((document.querySelector('[data-testid="study-status"]')?.textContent ?? '').trim()),
      undefined,
      { timeout: 20000 }
    );
    assert.equal(await page.getByTestId('review-card').count(), 0, 'a rated card must not be asked again');
    assert.match(
      (await page.getByTestId('btn-review-deck').textContent()).trim(),
      /Review \(0 due\)/,
      'the deck must say nothing is due after the only card was answered'
    );
    const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), CARDS_KEY);
    const ids = Object.keys(stored);
    assert.equal(ids.length, 1, `expected one stored schedule, got ${ids.join(', ')}`);
    assert.equal(stored[ids[0]].reps, 1);
    assert.equal(stored[ids[0]].lastRating, 3);
    assert.ok(
      stored[ids[0]].due > Date.now() + 2 * DAY_MS,
      `a Good answer on a new card must be days away, not minutes (due ${new Date(stored[ids[0]].due).toISOString()})`
    );
    console.log(`  ok rating Good stored reps=1 and a due date ${Math.round((stored[ids[0]].due - Date.now()) / DAY_MS)} days out`);

    // ---- Reload: the schedule is still there, and the deck is still empty ----
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.querySelector('#root *')), undefined, {
      timeout: 30000,
    });
    await openLesson(page);
    assert.match(
      (await (await deckButton(page)).textContent()).trim(),
      /Review \(0 due\)/,
      'the schedule must survive a reload, so the deck opens with nothing due'
    );
    await page.getByTestId('btn-review-deck').click();
    await page.waitForFunction(
      () =>
        /Nothing due, next in \d+ days?/.test(
          document.querySelector('[data-testid="study-status"]')?.textContent ?? ''
        ),
      undefined,
      { timeout: 20000 }
    );
    assert.equal(await page.getByTestId('review-card').count(), 0);
    const afterReload = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), CARDS_KEY);
    assert.equal(Object.keys(afterReload).length, 1, 'the stored deck must not be rewritten into nothing');
    console.log('  ok after a reload the deck says nothing is due and names the next day');

    // ---- The export carries the work, not only the ticks ----
    // The portfolio is the file a learner hands to somebody else; a card that exists only on screen
    // is invisible in it, so the same passage, its answer and the measured time must be in the text.
    await page.getByTestId('btn-export-portfolio').click();
    const portfolio = (await page.getByTestId('portfolio-markdown-preview').textContent()) ?? '';
    assert.match(portfolio, /## 4\. Study Notes and Kept Passages/, 'the export must carry the notes section');
    assert.equal(portfolio.includes(quote), true, 'the pinned passage must be in the export');
    assert.equal(portfolio.includes(COMMENT), true, 'its comment is the answer side and travels with it');
    assert.match(portfolio, /## 5\. Review Deck \(FSRS-5\)/);
    assert.match(portfolio, /## 6\. Measured Study Time/);
    assert.match(portfolio, /\*\*Sittings:\*\* 1/, 'the sitting this session measured must be counted');
    await page.getByLabel('Close export modal').click();
    console.log('  ok the portfolio export carries the passage, its comment, the card and the measured sitting');

    // ---- Clearing the comment retires the card, which is the only way to un-ask a question ----
    await page.getByTestId('study-highlight-comment-0').fill('');
    await page.getByTestId('study-highlight-comment-0').press('Enter');
    await page.waitForFunction(
      () => (document.querySelector('[data-testid="btn-review-deck"]')?.getAttribute('disabled') ?? null) !== null,
      undefined,
      { timeout: 20000 }
    );
    const retired = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), CARDS_KEY);
    assert.deepEqual(retired, {}, 'a card with no question must not keep a schedule behind');
    console.log('  ok clearing the comment retired the card and pruned its schedule');

    assert.deepEqual(pageErrors, [], `the page threw during review: ${pageErrors.join(' | ')}`);
    console.log('[PASS] Review: a pinned and commented line became a card, the answer stayed hidden until asked, ' +
      'a rating wrote a schedule days out, the reload kept it, and clearing the comment retired the card');
  } finally {
    await browser.close();
    if (ownServer) await ownServer.viteServer.close();
  }
}

main().catch((error) => {
  console.error('[FAIL] Review checks failed:', error.message);
  process.exit(1);
});
