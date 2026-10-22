#!/usr/bin/env node
/**
 * The predict-first gate in Chromium (`scripts/e2e_predict_gate.mjs`, `npm run test:e2e:predict`).
 *
 * The gate is the one interaction every other browser suite switches off
 * (`window.__mechalabPredictFirst = false`), which is why it needs a suite of its own: the default
 * path — a lesson's first Run asks before it runs — is only reachable with the gate on.
 *
 * What a learner meets, and what this proves:
 *
 *   - **Run asks.** The first Run of a lesson opens the question, and nothing runs: no output, no
 *     verdict, and the button is disabled until there is something to commit.
 *   - **A guess is judged, then the run goes.** The verdict comes from the lesson's own
 *     `expectedOutput`, and the held run executes on commit.
 *   - **One question per lesson.** The next Run of that lesson goes straight through.
 *   - **Skip is recorded.** The run is never blocked; the card says the learner went without
 *     predicting.
 *   - **Predict again is a real second attempt.** The right words typed back are the one exact hit.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable, startDevServer } from './e2e_browser_workbench.mjs';
import { waitForEditor } from './editor-code.mjs';

const P1_EXPECTED = ['Mode: ACTIVE | E-Stop: False', 'Encoder Ticks: 425 | Battery: 12.15 V'];
// What the untouched P.1 starter actually prints: a guess at the *right* answer, made from the
// wrong code, is the case the copy has to handle honestly.
const P1_STARTER_GUESS = ['Mode: STANDBY | E-Stop: False', 'Encoder Ticks: 400 | Battery: 12.60 V'];

const state = (page) =>
  page.evaluate(
    () => document.querySelector('[data-testid="predict-gate"]')?.getAttribute('data-predict-state') ?? null
  );

async function waitForStdout(page, needle, timeout = 60000) {
  await page.waitForFunction(
    (text) => (document.querySelector('[data-testid="pre-actual-stdout"]')?.textContent ?? '').includes(text),
    needle,
    { timeout }
  );
}

async function openP1(page) {
  await waitForEditor(page);
  await page.getByTestId('lesson-item-P.1').scrollIntoViewIfNeeded();
  await page.getByTestId('lesson-item-P.1').click();
  await waitForEditor(page);
}

export async function runPredictGateSuite({ baseUrl: externalBaseUrl } = {}) {
  const own = externalBaseUrl ? null : await startDevServer(process.cwd());
  const baseUrl = externalBaseUrl ?? own.baseUrl;
  const browser = await chromium.launch({
    ...(resolveChromiumExecutable() ? { executablePath: resolveChromiumExecutable() } : {}),
    headless: true,
  });

  try {
    // No init script: the gate is on, which is the state a first-time learner meets.
    const page = await (await browser.newContext()).newPage();
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.getByTestId('tab-btn-tab-pyodide').click();
    await openP1(page);

    // 1. Run asks instead of running.
    await page.getByTestId('btn-run-verify').click();
    await page.getByTestId('predict-gate').waitFor({ timeout: 5000 });
    assert.equal(await state(page), 'asking', 'the first Run of a lesson must open the question');
    assert.equal(
      await page.getByTestId('btn-predict-run').isDisabled(),
      true,
      'Predict & Run must stay disabled until there is something to commit'
    );
    assert.equal(
      await page.getByTestId('status-assert-passed').count(),
      0,
      'a held run must not award a verdict'
    );
    console.log('  ok the first Run of a lesson asks before it runs');

    // 2. A guess is committed and judged; the held run then executes the starter, which prints its
    //    own values — so the honest guess for an untouched starter misses, and the run still goes.
    await page.getByTestId('predict-input').fill(P1_STARTER_GUESS.join('\n'));
    await page.getByTestId('btn-predict-run').click();
    await page.getByTestId('predict-gate').waitFor({ timeout: 5000 });
    assert.equal(await state(page), 'judged', 'the gate must show its verdict after the commit');
    assert.match(
      (await page.getByTestId('predict-recorded').textContent()) ?? '',
      /Encoder Ticks: 400/,
      'the card must show the guess back, verbatim'
    );
    assert.match(
      (await page.getByTestId('predict-verdict-text').textContent()) ?? '',
      /None of your lines are in the output/,
      'a guess that matches nothing must say so plainly'
    );
    await waitForStdout(page, 'Encoder Ticks: 400');
    console.log('  ok a committed guess is judged against the expected output, then the run goes');

    // 3. One question per lesson: the next Run goes straight through.
    await page.getByTestId('btn-predict-close').click();
    await page.getByTestId('btn-run-verify').click();
    await page.waitForTimeout(400);
    assert.equal(
      await page.getByTestId('predict-gate').count(),
      0,
      'a lesson that has been answered must not be asked again'
    );
    await waitForStdout(page, 'Encoder Ticks: 400');
    console.log('  ok a lesson already answered runs without asking again');

    // 4. A second lesson asks its own question, and Skip is a recorded decision rather than a
    //    loophole: the run goes, and the card says the learner went without predicting.
    await page.getByTestId('lesson-item-P.2').scrollIntoViewIfNeeded();
    await page.getByTestId('lesson-item-P.2').click();
    await waitForEditor(page);
    await page.getByTestId('btn-run-verify').click();
    await page.getByTestId('predict-gate').waitFor({ timeout: 5000 });
    assert.equal(await state(page), 'asking', 'every lesson asks once, not only the first one');
    await page.getByTestId('btn-predict-skip').click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="predict-gate"]')?.getAttribute('data-predict-state') !== 'asking',
      null,
      { timeout: 5000 }
    );
    assert.equal(await state(page), 'skipped', 'Skip must be recorded as a skip');
    assert.match(
      (await page.getByTestId('predict-skipped-text').textContent()) ?? '',
      /without predicting/,
      'the skip card must say what happened'
    );
    await waitForStdout(page, 'Position');
    console.log('  ok Skip is recorded as a skip, and the run goes through');

    // 5. Predict again is a real second attempt: the question returns, and the lesson's own expected
    //    output typed back is the one exact hit the gate can give.
    await openP1(page);
    await page.getByTestId('btn-predict').click();
    await page.getByTestId('predict-gate').waitFor({ timeout: 5000 });
    await page.getByTestId('btn-predict-again').click();
    await page.getByTestId('predict-input').waitFor({ timeout: 5000 });
    await page.getByTestId('predict-input').fill(P1_EXPECTED.join('\n'));
    await page.getByTestId('btn-predict-run').click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="predict-gate"]')?.getAttribute('data-predict-state') === 'judged',
      null,
      { timeout: 10000 }
    );
    assert.match(
      (await page.getByTestId('predict-verdict-text').textContent()) ?? '',
      /You called it/,
      'the expected output, typed back, must be the one exact match'
    );
    // The toolbar carries the state, so a closed card is still legible at a glance.
    assert.match(
      (await page.getByTestId('btn-predict').textContent()) ?? '',
      /answered/,
      'the Predict button must say the lesson has an answer'
    );
    console.log('  ok Predict again asks a second time, and the right answer is called exactly');

    console.log(
      '[PASS] Predict-first gate: the first Run asks, a guess is judged and the run follows, one question per lesson, Skip recorded, and Predict again re-asks.'
    );
  } finally {
    await browser.close();
    if (own) await own.viteServer.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPredictGateSuite({
    baseUrl: process.env.E2E_BASE_URL,
  }).catch((error) => {
    console.error('[FAIL] Predict-first gate suite failed:', error);
    process.exit(1);
  });
}
