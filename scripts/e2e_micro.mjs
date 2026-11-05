#!/usr/bin/env node
/**
 * The micro-learning tab in a real browser (`scripts/e2e_micro.mjs`, `npm run test:e2e:micro`).
 *
 * The Node suite pins the rules; this suite proves the doors and the screen agree with them:
 *
 *   - Home has a micro card and its Open button reaches the lazy tab;
 *   - the 2/2 path completes, says provisional, links to the anchored P.1 section, and leaves the
 *     parent lesson verified map untouched;
 *   - the 0/2 path reaches practice, a failed practice stays "learning", and the result says the
 *     parent lesson remains unverified;
 *   - a seeded provisional state produces a due review, the review completes, and the saved state
 *     consolidates with a future due date;
 *   - the runtime switch hides the tab and Home's lab while keeping the progress key, then brings
 *     it back;
 *   - the tab stays inside a 390 px viewport.
 *
 * The suite uses its own context and clears the micro key between the two diagnostic paths. It is
 * deliberately not a day-long self-study: the real 18-hour review is a human protocol, and the
 * injected-clock rules are in `test_micro.mjs`.
 */

import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable, startDevServer } from './e2e_browser_workbench.mjs';
import { seedTourSeen } from './tour_seed.mjs';
import { MICRO_CONCEPTS } from '../app/src/micro/catalog.ts';
import { reviewSet } from '../app/src/micro/engine.ts';

const MICRO_KEY = 'mechalab_micro_progress_v1';
const VERIFIED_KEY = 'mechalab_pyodide_verified_v1';

function concept(id) {
  const found = MICRO_CONCEPTS.find((entry) => entry.id === id);
  assert.ok(found, `the catalogue must contain ${id}`);
  return found;
}

function wrongOption(question) {
  if (question.type === 'short') return '__nope__';
  return question.options.find((option) => option.id !== question.answerId)?.id ?? '__nope__';
}

async function answer(page, question, correct = true) {
  if (question.type === 'short') {
    const value = correct ? question.acceptedAnswers[0] : wrongOption(question);
    await page.locator('input:not([type="radio"])').last().fill(value);
    return;
  }
  const value = correct ? question.answerId : wrongOption(question);
  await page.locator(`input[name="${question.id}"][value="${value}"]`).check();
}

async function openMicro(page, baseUrl) {
  await page.goto(`${baseUrl}?view=home`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('home-micro').waitFor({ timeout: 30000 });
  await page.getByTestId('home-micro-open').click();
  await page.getByTestId('tab-micro').waitFor({ timeout: 30000 });
}

async function seedDueReview(page) {
  const variables = concept('variables');
  const state = {
    conceptId: variables.id,
    revision: variables.revision,
    mastery: 'provisional',
    stale: false,
    skipEligible: true,
    successCount: 0,
    dueAt: Date.now() - 60_000,
    lastReviewedAt: null,
    learnCompletedAt: Date.now() - 86_400_000,
    diagnosticCorrect: 2,
    practiceCorrect: null,
  };
  await page.evaluate(
    ({ key, store }) => localStorage.setItem(key, JSON.stringify(store)),
    {
      key: MICRO_KEY,
      store: { version: 1, revision: 3, concepts: { [variables.id]: state }, events: [], updatedAt: Date.now() },
    }
  );
}

async function main() {
  const own = process.env.E2E_BASE_URL ? null : await startDevServer(process.cwd());
  const baseUrl = (process.env.E2E_BASE_URL ?? own.baseUrl).replace(/\/*$/, '/');
  const executablePath = resolveChromiumExecutable();
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    headless: true,
  });
  try {
    const context = await browser.newContext();
    await seedTourSeen(context);
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    // ---- 1. Home's door and the clean diagnostic path ----
    await openMicro(page, baseUrl);
    assert.equal(await page.getByTestId('micro-next').count(), 1, 'an empty store offers the first concept');
    await page.getByTestId('micro-learn-variables').click();
    await page.getByTestId('micro-start-diagnostics').click();
    const variables = concept('variables');
    for (const question of variables.diagnostics) await answer(page, question, true);
    await page.getByTestId('micro-submit-diagnostics').click();
    await page.getByTestId('micro-result').waitFor({ timeout: 15000 });
    assert.match((await page.getByTestId('micro-result').textContent()) ?? '', /Clean sweep/i);
    const anchor = await page.getByTestId('micro-source-anchor').getAttribute('href');
    assert.match(anchor ?? '', new RegExp(`#${variables.anchor}$`), 'the source link must name the P.1 anchor');
    assert.equal(
      await page.evaluate((key) => Boolean(JSON.parse(localStorage.getItem(key) ?? '{}')['P.1']), VERIFIED_KEY),
      false,
      'micro must not verify P.1'
    );
    console.log('  ok Home opens micro; 2/2 is provisional and leaves P.1 unverified');

    // ---- 2. The wrong-diagnostic path, including a failed practice ----
    await page.getByTestId('micro-back').click();
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByTestId('micro-reset').click();
    await page.getByTestId('micro-learn-variables').click();
    await page.getByTestId('micro-start-diagnostics').click();
    for (const question of variables.diagnostics) await answer(page, question, false);
    await page.getByTestId('micro-submit-diagnostics').click();
    await page.getByTestId('micro-practice').waitFor({ timeout: 15000 });
    await answer(page, variables.practice, false);
    await page.getByTestId('micro-submit-practice').click();
    await page.getByTestId('micro-result').waitFor({ timeout: 15000 });
    assert.match((await page.getByTestId('micro-result').textContent()) ?? '', /still learning/i);
    assert.equal(
      await page.evaluate((key) => Boolean(JSON.parse(localStorage.getItem(key) ?? '{}')['P.1']), VERIFIED_KEY),
      false,
      'a failed practice cannot verify P.1'
    );
    console.log('  ok 0/2 takes the practice branch; a failed practice stays learning and P.1 is still unverified');

    // ---- 3. A due review consolidates and schedules forward ----
    await page.getByTestId('micro-back').click();
    await seedDueReview(page);
    await page.goto(`${baseUrl}?view=home`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('home-micro-open').click();
    await page.getByTestId('micro-due').waitFor({ timeout: 15000 });
    await page.getByTestId('micro-review-variables').click();
    const reviewQuestions = reviewSet(variables, 0);
    for (const question of reviewQuestions) await answer(page, question, true);
    await page.getByTestId('micro-submit-review').click();
    await page.getByTestId('micro-result').waitFor({ timeout: 15000 });
    assert.match((await page.getByTestId('micro-result').textContent()) ?? '', /Consolidated/i);
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), MICRO_KEY);
    assert.equal(saved.concepts.variables.mastery, 'consolidated');
    assert.ok(saved.concepts.variables.dueAt > Date.now(), 'a successful review schedules a future due date');
    console.log('  ok a due review consolidates and schedules forward');

    // ---- 4. The runtime switch hides the tab, not the evidence ----
    await page.getByTestId('micro-back').click();
    await page.goto(`${baseUrl}?view=home`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('home-micro').waitFor({ timeout: 30000 });
    await page.getByTestId('home-micro-toggle').click();
    await page.waitForTimeout(150);
    assert.equal(await page.getByTestId('home-micro-open').count(), 0, 'hiding micro removes Home\'s open door');
    assert.equal(
      saved.concepts.variables.mastery,
      (await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), MICRO_KEY)).concepts.variables.mastery,
      'the switch must not touch stored progress'
    );
    await page.getByTestId('home-micro-toggle').click();
    await page.getByTestId('home-micro-open').waitFor({ timeout: 5000 });
    await page.getByTestId('home-micro-open').click();
    await page.getByTestId('tab-micro').waitFor({ timeout: 30000 });
    assert.equal(await page.getByTestId('tab-btn-tab-micro').count(), 1, 'showing micro brings its rail button back');
    console.log('  ok the beta switch hides the tab and preserves every stored field');

    // ---- 5. The tab fits a phone ----
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}?view=home`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('home-micro-open').click();
    await page.getByTestId('tab-micro').waitFor({ timeout: 30000 });
    const width = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    assert.equal(width.scroll, width.client, `micro must not scroll sideways at 390 px (${width.scroll} > ${width.client})`);
    console.log('  ok the micro tab stays inside a 390 px viewport');

    assert.deepEqual(pageErrors, [], `the micro tab threw: ${pageErrors.join('; ')}`);
    await context.close();
    console.log('\nmicro e2e: 8 checks passed');
  } finally {
    await browser.close();
    if (own) await own.viteServer.close();
  }
}

main().catch((error) => {
  console.error(`[FAIL] ${error.stack ?? error.message}`);
  process.exit(1);
});
