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
 *   - **A graded exercise asks about the finished run.** Its starter raises `NotImplementedError`
 *     by design, so "what will this print?" has an honest answer — the traceback — that the lesson's
 *     expected output can never match. The gate says so, and the guide reads the failure as the
 *     hole it left rather than as the learner's bug.
 *   - **The example is shape, not content.** The textarea's placeholder used to be P.1's own expected
 *     line on every lesson: half the answer to P.1's question and another lesson's output elsewhere.
 *   - **The first fix moves the red line.** A graded exercise is graded by a self-check that stops at
 *     the first hole it meets, so the loop's proof is that filling hole 1 makes the failure name
 *     hole 2 — and stops naming hole 1. The card's "start with" and "first check" follow the draft
 *     for the same reason.
 *   - **The pass state is the same lesson.** With every hole written, the self-check line, the
 *     behavioural badge, the toast and the verified count all have to agree before the card may say
 *     the loop is closed.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable, startDevServer } from './e2e_browser_workbench.mjs';
import { getEditorCode, setEditorCode, waitForEditor } from './editor-code.mjs';

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
    // The guide card scripts the first run, so it must not also answer the question it is about to
    // ask: while the gate is open, the finish line is withheld and step 2 names the gate.
    const askingGuide = await page.getByTestId('first-lesson-guide').innerText();
    assert.match(askingGuide, /PREDICT, THEN RUN/, 'the guide must name the predict step');
    assert.doesNotMatch(
      askingGuide,
      /Encoder Ticks: 425/,
      'the guide must not print the answer while the gate is asking'
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
    // With a run on screen the finish line has nothing left to give away, and it comes back: the
    // card is a brief, not a quiz.
    assert.match(
      await page.getByTestId('first-lesson-guide').innerText(),
      /Encoder Ticks: 425/,
      'once a run has landed the guide must show the finish line it withheld'
    );
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
    // The guide's own Run button is the one a beginner presses, and it must not be a way around the
    // gate the same card promises.
    await page.getByTestId('btn-guide-run').click();
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

    // 6. A graded exercise. Its starter's holes are `raise NotImplementedError(...)`, so the untouched
    //    file prints a traceback while the lesson is graded against the self-check line a finished
    //    file prints. "What will this print?" would be a question with an honest answer — the
    //    traceback — that can never match, so the gate asks for the finished run and says why. The
    //    guide's WHAT TO FIX then reads the raise as the starter's marker, not a mistake the learner
    //    wrote.
    await page.getByTestId('lesson-item-EX.00-foundations.T1.00a').scrollIntoViewIfNeeded();
    await page.getByTestId('lesson-item-EX.00-foundations.T1.00a').click();
    await waitForEditor(page);
    await page.getByTestId('btn-guide-run').click();
    await page.getByTestId('predict-gate').waitFor({ timeout: 5000 });
    assert.equal(await state(page), 'asking', 'a graded exercise asks its own question');
    const exerciseGate = await page.getByTestId('predict-gate').innerText();
    assert.match(
      exerciseGate,
      /what will a finished run print\?/,
      'a graded exercise must ask for the finished run, not the traceback its starter raises'
    );
    assert.match(exerciseGate, /traceback/, 'and must say what not to predict');
    // The card above the gate has to ask the same question the gate asks: it is the same beginner,
    // the same click, and a card that says "what will it print" beside a gate asking about the
    // finished run is the contradiction this suite exists to catch.
    assert.match(
      await page.getByTestId('first-lesson-guide').innerText(),
      /asks what a finished run will print/,
      "the guide's step 2 must ask what the gate asks"
    );
    // The placeholder is a shape, never a lesson's answer: P.1's own expected line used to be the
    // example on every lesson.
    const placeholder = (await page.getByTestId('predict-input').getAttribute('placeholder')) ?? '';
    assert.doesNotMatch(
      placeholder,
      /Encoder Ticks|425|12\.15/,
      "the gate's example must not be a lesson's expected output"
    );
    await page.getByTestId('btn-predict-skip').click();
    await page.getByTestId('guide-what-to-fix').waitFor({ timeout: 60000 });
    assert.match(
      (await page.getByTestId('guide-what-to-fix').innerText()).replace(/\s+/g, ' '),
      /hole the starter leaves/,
      "an exercise's NotImplementedError must read as the starter's hole, not the learner's bug"
    );
    console.log('  ok a graded exercise asks for the finished run, and its hole reads as a marker');

    // 7. The first fix moves the red line to the next hole. The self-check stops at the first hole it
    //    meets, so one fixed function must turn "TODO 1" into "TODO 2" — the difference between a
    //    grader that reports progress and one that reports the same thing forever.
    const beforeFix = (await page.getByTestId('guide-what-to-fix').innerText()).replace(/\s+/g, ' ');
    assert.match(beforeFix, /TODO 1/, 'the untouched starter must fail first at hole 1');
    const starter = await getEditorCode(page);
    const fixed = starter.replace(
      'raise NotImplementedError("TODO 1: multiply the speed by the time step, then add the position")',
      'return pos_m + vel_m_s * dt_s'
    );
    assert.notEqual(fixed, starter, 'this fixture must still contain the TODO 1 raise it replaces');
    await setEditorCode(page, fixed);
    await page.getByTestId('btn-run-verify').click();
    await page.waitForFunction(
      () => (document.querySelector('[data-testid="guide-what-to-fix"]')?.textContent ?? '').includes('TODO 2'),
      null,
      { timeout: 60000 }
    );
    const afterFix = (await page.getByTestId('guide-what-to-fix').innerText()).replace(/\s+/g, ' ');
    assert.match(afterFix, /TODO 2/, 'filling hole 1 must move the red line to hole 2');
    assert.doesNotMatch(afterFix, /TODO 1/, 'and must not report the filled hole again');
    assert.match(
      afterFix,
      /hole the starter leaves/,
      'the second failure is still the starter\'s marker, not a mistake the learner wrote'
    );
    // The card above the editor reads the same draft: "start with" and "first check" must both
    // name hole 2 now, or the guide sends the learner back to the line they just wrote.
    const guideAfter = (await page.getByTestId('first-lesson-guide').innerText()).replace(/\s+/g, ' ');
    const stepOne = guideAfter.slice(
      guideAfter.indexOf('1 · THE STARTER'),
      guideAfter.indexOf('Show me the editor')
    );
    assert.match(stepOne, /while pos_m < target/, 'the card must point at the hole that is still open');
    assert.doesNotMatch(
      stepOne,
      /multiply the speed by the time step/,
      'and never at the hole just filled'
    );
    assert.match(
      guideAfter,
      /which stops at a while pos_m < target/,
      'the first-check line must name the same hole the pointer does'
    );
    console.log('  ok filling hole 1 moves the red line to hole 2, which still reads as a marker');

    // 8. The pass state. The remaining six holes are filled with the reference solution through the
    //    app's own Load Solution button — the code's contents are graded natively by
    //    `scripts/run_exercise.py`, so what this proves is the browser's half: the self-check's PASS
    //    line, the behavioural badge, the toast and the verified count all agree that the lesson is
    //    done, and the card says so instead of asking for another hole.
    const verifiedBefore = Number(
      ((await page.getByTestId('runner-verified-count').textContent()) ?? '').split('/')[0].trim()
    );
    await page.getByTestId('btn-load-solution').click();
    const solution = await getEditorCode(page);
    assert.equal(
      (solution.match(/raise NotImplementedError/g) || []).length,
      0,
      'Load Solution must fill every hole; a raise left behind cannot pass'
    );
    await page.getByTestId('btn-run-verify').click();
    // The toast is the one signal that clears itself (six seconds), so it is read first; the badge
    // and the card are the durable versions of the same fact.
    await page.getByTestId('pass-toast').waitFor({ timeout: 60000 });
    assert.match(
      await page.getByTestId('pass-toast').innerText(),
      /Behavioural checks and output both green/,
      'the toast must say both halves passed, not only the output'
    );
    await page.getByTestId('status-assert-passed').waitFor({ timeout: 5000 });
    assert.match(
      (await page.getByTestId('pre-actual-stdout').textContent()) ?? '',
      /SELF-CHECK PASS: 4 checks/,
      'a finished file must print the self-check PASS line it is graded against'
    );
    await page.getByTestId('guide-passed').waitFor({ timeout: 5000 });
    assert.match(
      await page.getByTestId('guide-passed').innerText(),
      /That is the whole loop/,
      'the card must close the loop it opened'
    );
    const verifiedAfter = Number(
      ((await page.getByTestId('runner-verified-count').textContent()) ?? '').split('/')[0].trim()
    );
    assert.equal(verifiedAfter, verifiedBefore + 1, 'the verified count must move by exactly one');
    console.log('  ok a finished exercise passes its self-check, its behaviour tests, and is verified');

    console.log(
      '[PASS] Predict-first gate: the first Run asks, a guess is judged and the run follows, one question per lesson, Skip recorded, Predict again re-asks, a graded exercise asks for its finished run, one fixed hole moves the red line to the next, and a finished file verifies.'
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
