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

async function revealWalkthrough(page, concept) {
  for (let index = 1; index < concept.walkthrough.length; index += 1) {
    await page.getByTestId('micro-reveal-next').click();
  }
  await page.getByTestId('micro-walkthrough-done').waitFor({ timeout: 5000 });
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

    // ---- 0. The header tray is a second door to the same tab ----
    await page.goto(`${baseUrl}?view=home`, { waitUntil: 'domcontentloaded' });
    const headerMicro = page.getByTestId('btn-open-micro');
    await headerMicro.waitFor({ timeout: 30000 });
    const headerTray = await headerMicro.evaluate((button) => {
      const tray = button.closest('[role="group"]');
      return tray
        ? [...tray.querySelectorAll('button[data-testid]')].map((item) => item.getAttribute('data-testid'))
        : [];
    });
    assert.deepEqual(
      headerTray.slice(0, 5),
      ['btn-home', 'btn-open-lessons', 'btn-open-studio', 'btn-open-micro', 'btn-open-palette'],
      'Micro-learning must sit between Free study and Search in the Navigate tray'
    );
    await headerMicro.click();
    await page.getByTestId('tab-micro').waitFor({ timeout: 30000 });
    assert.equal(
      await page.getByTestId('tab-btn-tab-micro').getAttribute('aria-current'),
      'page',
      'the header tray must open the micro tab too'
    );
    // Leaving Home for a lesson must not take the Micro door with it: the workbench header has
    // its own branch, and that branch once forgot this prop.
    await page.getByTestId('btn-open-lessons').click();
    await page.getByTestId('lesson-brief').waitFor({ timeout: 30000 });
    assert.equal(
      await page.getByTestId('btn-open-micro').count(),
      1,
      'the Micro door must still be in the action tray on the lesson runner'
    );
    console.log('  ok the header tray opens micro-learning and keeps its door on the runner');

    // ---- 1. Home's door and the clean diagnostic path ----
    await openMicro(page, baseUrl);
    await page.evaluate(() => {
      window.__microSounds = [];
      window.addEventListener('mechalab:sound', (event) => {
        window.__microSounds.push(event.detail);
      });
    });
    assert.equal(await page.getByTestId('micro-next').count(), 1, 'an empty store offers the first concept');
    const variables = concept('variables');
    await page.getByTestId('micro-learn-variables').click();
    const walkthroughLines = page.locator('.micro-walkthrough-line');
    assert.equal(await walkthroughLines.count(), 1, 'the walkthrough starts with one line');
    await page.keyboard.press('t');
    assert.equal(
      await page.getByTestId('micro-diagnostics').count(),
      0,
      'the test key is inert until the trace is complete'
    );
    await page.keyboard.press('ArrowRight');
    await walkthroughLines.nth(1).waitFor({ timeout: 2000 });
    assert.equal(await walkthroughLines.count(), 2, 'the next key reveals one more line');
    const keyMotion = await walkthroughLines.last().evaluate((line) => {
      const walkthrough = line.closest('[data-testid="micro-walkthrough"]');
      const style = getComputedStyle(line);
      const frames = line.getAnimations()[0]?.effect?.getKeyframes?.() ?? [];
      return {
        input: walkthrough?.getAttribute('data-input'),
        duration: Number.parseFloat(style.animationDuration),
        animation: style.animationName,
        startsTransparent: frames[0]?.opacity === 0 || frames[0]?.opacity === '0',
      };
    });
    assert.equal(keyMotion.input, 'key', 'a key-driven reveal marks the keyboard input mode');
    assert.ok(keyMotion.duration >= 0.5, `the key transition should be slower than a click (${keyMotion.duration}s)`);
    assert.match(keyMotion.animation, /micro-line-in/);
    assert.ok(keyMotion.startsTransparent, 'the key-driven line fades in from transparent');
    const revealSequence = await page.evaluate(() => {
      const values = document.querySelector('.micro-walkthrough-values');
      const note = document.querySelector('.micro-walkthrough-note');
      if (!values || !note) return null;
      const value = document.querySelector('.micro-answer-value');
      if (!value) return null;
      const valuesStyle = getComputedStyle(values);
      const noteStyle = getComputedStyle(note);
      const valueStyle = getComputedStyle(value);
      return {
        valuesAnimation: valuesStyle.animationName,
        noteAnimation: noteStyle.animationName,
        valuesDuration: Number.parseFloat(valuesStyle.animationDuration),
        valueDuration: Number.parseFloat(valueStyle.animationDuration),
        noteDelay: Number.parseFloat(noteStyle.animationDelay),
      };
    });
    assert.ok(revealSequence, 'the reveal should separate the value block from the explanation');
    assert.match(revealSequence.valuesAnimation, /micro-values-in/);
    assert.match(revealSequence.noteAnimation, /micro-note-in/);
    assert.ok(revealSequence.valuesDuration >= 0.35, `the values should have their own fade (${revealSequence.valuesDuration}s)`);
    assert.ok(
      revealSequence.noteDelay >= revealSequence.valueDuration,
      `the explanation should wait for the value spring (${revealSequence.noteDelay}s vs ${revealSequence.valueDuration}s)`
    );
    assert.deepEqual(
      await page.evaluate(() => window.__microSounds.at(-1)),
      { kind: 'ui', role: 'nav', pan: 0 },
      'the next key also sounds the UI bus'
    );
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => document.querySelectorAll('.micro-walkthrough-line').length === 1);
    assert.equal(await walkthroughLines.count(), 1, 'the previous key goes back one line');
    await page.getByTestId('micro-keybind-toggle').click();
    await page.getByTestId('micro-keybind-next').click();
    await page.locator('[data-testid="micro-keybind-panel"][data-capture="next"]').waitFor();
    await page.keyboard.press('n');
    await page.waitForFunction(
      () => document.querySelector('[data-testid="micro-keybind-panel"]')?.getAttribute('data-capture') === null
    );
    assert.match((await page.getByTestId('micro-keybind-next').textContent()) ?? '', /N/);
    await page.keyboard.press('n');
    await walkthroughLines.nth(1).waitFor({ timeout: 2000 });
    assert.equal(await walkthroughLines.count(), 2, 'the custom next key reveals a line');
    await page.getByTestId('micro-keybind-previous').click();
    await page.locator('[data-testid="micro-keybind-panel"][data-capture="previous"]').waitFor();
    await page.keyboard.press('p');
    await page.waitForFunction(
      () => document.querySelector('[data-testid="micro-keybind-panel"]')?.getAttribute('data-capture') === null
    );
    await page.keyboard.press('p');
    await page.waitForFunction(() => document.querySelectorAll('.micro-walkthrough-line').length === 1);
    assert.equal(await walkthroughLines.count(), 1, 'the custom previous key goes back');
    await page.getByTestId('micro-keybind-toggle').click();
    await revealWalkthrough(page, variables);
    await page.getByTestId('micro-keybind-toggle').click();
    await page.getByTestId('micro-keybind-test').click();
    await page.locator('[data-testid="micro-keybind-panel"][data-capture="test"]').waitFor();
    await page.keyboard.press('x');
    await page.waitForFunction(
      () => document.querySelector('[data-testid="micro-keybind-panel"]')?.getAttribute('data-capture') === null
    );
    assert.match((await page.getByTestId('micro-keybind-test').textContent()) ?? '', /X/);
    await page.getByTestId('micro-keybind-toggle').click();
    // The binding is stored, not just remembered by this mount: a reload keeps it.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await openMicro(page, baseUrl);
    await page.evaluate(() => {
      window.__microSounds = [];
      window.addEventListener('mechalab:sound', (event) => window.__microSounds.push(event.detail));
    });
    await page.getByTestId('micro-learn-variables').click();
    await page.getByTestId('micro-keybind-toggle').click();
    assert.match(
      (await page.getByTestId('micro-keybind-test').textContent()) ?? '',
      /X/,
      'the custom test key survives a reload'
    );
    await page.getByTestId('micro-keybind-toggle').click();
    await revealWalkthrough(page, variables);
    await page.waitForFunction(() =>
      window.__microSounds.some((message) => message.kind === 'cue' && message.cue === 'verify')
    );
    // The badge commits before React re-registers the key listener with `testReady`; wait for the
    // button that reads that flag to enable, not just for the trace to finish painting.
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="micro-start-diagnostics"]')?.hasAttribute('disabled')
    );
    assert.match(
      (await page.getByTestId('micro-start-diagnostics').textContent()) ?? '',
      /X/,
      'the test button prints its custom shortcut'
    );
    const soundsBeforeTest = await page.evaluate(() => window.__microSounds.length);
    await page.keyboard.press('x');
    await page.getByTestId('micro-diagnostics').waitFor({ timeout: 5000 });
    const keyStage = await page.getByTestId('micro-diagnostics').evaluate((node) => {
      const style = getComputedStyle(node);
      const frames = node.getAnimations()[0]?.effect?.getKeyframes?.() ?? [];
      return {
        input: node.getAttribute('data-input'),
        duration: Number.parseFloat(style.animationDuration),
        animation: style.animationName,
        startsTransparent: frames[0]?.opacity === 0 || frames[0]?.opacity === '0',
      };
    });
    assert.equal(keyStage.input, 'key', 'the test key marks the stage change as key-driven');
    assert.match(keyStage.animation, /micro-reveal/);
    assert.ok(keyStage.duration >= 0.52, `the key stage change should be paced slower (${keyStage.duration}s)`);
    assert.ok(keyStage.startsTransparent, 'the key stage change fades in from transparent');
    const testSounds = await page.evaluate((from) => window.__microSounds.slice(from), soundsBeforeTest);
    assert.ok(
      testSounds.some((message) => message.kind === 'ui' && message.role === 'primary'),
      'the test key sounds the primary UI voice'
    );
    await answer(page, variables.diagnostics[0], true);
    await page.getByTestId('micro-answer-preview').first().waitFor({ timeout: 5000 });
    assert.equal(await page.getByTestId('micro-answer-preview').first().getAttribute('data-state'), 'pending');
    assert.equal(await page.getByTestId('micro-answer-result').count(), 0, 'the Python result starts hidden');
    await page.getByTestId('micro-answer-result-hidden').first().waitFor();
    const diagnosticCode = await page
      .getByTestId('micro-question-variables-d1')
      .locator('pre')
      .innerText();
    const diagnosticMatch = /sticker_count = (\d+)\s+sticker_count = sticker_count \+ (\d+)/.exec(
      diagnosticCode
    );
    assert.ok(diagnosticMatch, `the diagnostic should show two assignments: ${diagnosticCode}`);
    const stickerStart = Number(diagnosticMatch[1]);
    const stickerStep = Number(diagnosticMatch[2]);
    const stickerTotal = stickerStart + stickerStep;
    const equation = page.getByTestId('micro-answer-equation').first();
    await equation.waitFor({ timeout: 5000 });
    assert.match(
      (await equation.textContent()) ?? '',
      new RegExp(`sticker_count\\s*=\\s*${stickerStart}\\s*\\+\\s*${stickerStep}`)
    );
    const tone = await equation.evaluate((node) => {
      const original = node.querySelector('[data-token="number"]');
      const plugged = node.querySelector('.micro-plugged-value');
      return {
        original: original ? getComputedStyle(original).color : null,
        plugged: plugged ? getComputedStyle(plugged).color : null,
      };
    });
    assert.ok(tone.plugged, 'the plugged-in value has the substituted-value class');
    assert.notEqual(tone.plugged, tone.original, 'plugged values use a different colour from authored values');
    await page.getByTestId('micro-answer-reveal').first().click();
    const result = page.getByTestId('micro-answer-result').first();
    await result.waitFor({ timeout: 5000 });
    assert.match((await result.textContent()) ?? '', new RegExp(`sticker_count\\s*=\\s*${stickerTotal}`));
    await page.getByTestId('micro-answer-trace').first().click();
    const trace = page.getByTestId('micro-answer-trace-panel').first();
    await trace.waitFor({ timeout: 5000 });
    const traceText = (await trace.textContent()) ?? '';
    assert.match(traceText, new RegExp(`sticker_count\\s*=\\s*${stickerStart}\\s*\\+\\s*${stickerStep}`));
    assert.match(traceText, new RegExp(`sticker_count\\s*=\\s*${stickerTotal}`));
    for (const question of variables.diagnostics.slice(1)) await answer(page, question, true);
    const soundsBeforeDiagnostics = await page.evaluate(() => window.__microSounds.length);
    await page.getByTestId('micro-submit-diagnostics').click();
    await page.locator('[data-testid="micro-answer-preview"][data-state="correct"]').first().waitFor({ timeout: 5000 });
    assert.ok(
      await page.evaluate(
        (from) =>
          window.__microSounds.slice(from).some((message) => message.kind === 'cue' && message.cue === 'run-pass'),
        soundsBeforeDiagnostics
      ),
      'a clean pair should sound the pass cue'
    );
    assert.match((await result.textContent()) ?? '', new RegExp(`sticker_count\\s*=\\s*${stickerTotal}`));
    await page.getByTestId('micro-see-result').click();
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

    // ---- 1b. A P.2 concept cites its own parent lesson ----
    await page.getByTestId('micro-back').click();
    const p2 = concept('floor-division');
    assert.equal(await page.getByTestId('micro-group-P.2').count(), 1, 'the list must group P.2 under its own heading');
    await page.getByTestId('micro-learn-floor-division').click();
    const p2Anchor = await page.getByTestId('micro-source-anchor').getAttribute('href');
    assert.match(
      p2Anchor ?? '',
      new RegExp(`P\\.2-arithmetic-and-order-of-operations\\.md#${p2.anchor}$`),
      'a P.2 concept must link to its own anchored section'
    );
    console.log('  ok a P.2 concept links to its own parent section');

    // ---- 2. The wrong-diagnostic path, including a failed practice ----
    await page.getByTestId('micro-back').click();
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByTestId('micro-reset').click();
    await page.getByTestId('micro-learn-variables').click();
    await revealWalkthrough(page, variables);
    await page.getByTestId('micro-start-diagnostics').click();
    const pointerStage = await page.getByTestId('micro-diagnostics').evaluate((node) => ({
      input: node.getAttribute('data-input'),
      duration: Number.parseFloat(getComputedStyle(node).animationDuration),
    }));
    assert.equal(pointerStage.input, 'pointer', 'a click marks the stage change as pointer-driven');
    assert.ok(
      pointerStage.duration < keyStage.duration,
      `a click should pace the stage faster than the key (${pointerStage.duration}s vs ${keyStage.duration}s)`
    );
    for (const question of variables.diagnostics) await answer(page, question, false);
    const soundsBeforeWrong = await page.evaluate(() => window.__microSounds.length);
    await page.getByTestId('micro-submit-diagnostics').click();
    await page.locator('[data-testid="micro-answer-preview"][data-state="wrong"]').first().waitFor({ timeout: 5000 });
    assert.ok(
      await page.evaluate(
        (from) =>
          window.__microSounds.slice(from).some((message) => message.kind === 'cue' && message.cue === 'run-fail'),
        soundsBeforeWrong
      ),
      'a missed pair should sound the neutral fail cue'
    );
    await page.getByTestId('micro-continue-practice').click();
    await page.getByTestId('micro-practice').waitFor({ timeout: 15000 });
    await answer(page, variables.practice, false);
    await page.getByTestId('micro-submit-practice').click();
    await page.locator('[data-testid="micro-answer-preview"][data-state="wrong"]').waitFor({ timeout: 5000 });
    await page.getByTestId('micro-see-result').click();
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
    await page.evaluate(() => {
      window.__microSounds = [];
      window.addEventListener('mechalab:sound', (event) => window.__microSounds.push(event.detail));
    });
    await page.getByTestId('home-micro-open').click();
    await page.getByTestId('micro-due').waitFor({ timeout: 15000 });
    await page.getByTestId('micro-review-variables').click();
    const reviewQuestions = reviewSet(variables, 0);
    for (const question of reviewQuestions) await answer(page, question, true);
    const soundsBeforeReview = await page.evaluate(() => window.__microSounds.length);
    await page.getByTestId('micro-submit-review').click();
    await page.locator('[data-testid="micro-answer-preview"][data-state="correct"]').first().waitFor({ timeout: 5000 });
    assert.ok(
      await page.evaluate(
        (from) =>
          window.__microSounds.slice(from).some((message) => message.kind === 'cue' && message.cue === 'run-pass'),
        soundsBeforeReview
      ),
      'a clean review should sound the pass cue'
    );
    await page.getByTestId('micro-see-result').click();
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
      heroPadding: Number.parseFloat(
        getComputedStyle(document.querySelector('[data-testid="micro-hero"]')).paddingTop
      ),
      titleSize: Number.parseFloat(
        getComputedStyle(document.querySelector('[data-testid="tab-micro"] h1')).fontSize
      ),
    }));
    assert.equal(width.scroll, width.client, `micro must not scroll sideways at 390 px (${width.scroll} > ${width.client})`);
    assert.ok(width.heroPadding <= 14.5, `the phone hero should use compact padding (${width.heroPadding}px)`);
    assert.ok(width.titleSize <= 25, `the phone title should be one compact step (${width.titleSize}px)`);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForFunction(() => window.matchMedia('(min-width: 1280px)').matches);
    const wideOverview = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
      heroPadding: Number.parseFloat(
        getComputedStyle(document.querySelector('[data-testid="micro-hero"]')).paddingTop
      ),
      titleSize: Number.parseFloat(
        getComputedStyle(document.querySelector('[data-testid="tab-micro"] h1')).fontSize
      ),
    }));
    assert.equal(wideOverview.scroll, wideOverview.client, 'the wide layout must not scroll sideways');
    assert.ok(
      wideOverview.heroPadding > width.heroPadding,
      `the wide hero should loosen its padding (${wideOverview.heroPadding}px > ${width.heroPadding}px)`
    );
    assert.ok(
      wideOverview.titleSize > width.titleSize,
      `the wide title should grow (${wideOverview.titleSize}px > ${width.titleSize}px)`
    );
    await page.getByTestId('micro-learn-variables').click();
    await page.getByTestId('micro-walkthrough').waitFor({ timeout: 5000 });
    const wideColumns = await page.evaluate(
      () =>
        getComputedStyle(
          document.querySelector('[data-testid="micro-walkthrough"] > div.grid')
        ).gridTemplateColumns.split(' ').length
    );
    assert.ok(wideColumns >= 2, `the wide walkthrough should split into two columns (${wideColumns})`);
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.waitForFunction(() => window.matchMedia('(min-width: 1024px)').matches);
    const tabletColumns = await page.evaluate(() => {
      const grid = document.querySelector('[data-testid="micro-walkthrough"] > div.grid');
      return {
        columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
        borderLeft: getComputedStyle(grid.lastElementChild).borderLeftWidth,
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      };
    });
    assert.ok(
      tabletColumns.columns >= 2,
      `the 1024 px walkthrough should split into two columns (${tabletColumns.columns})`
    );
    assert.notEqual(tabletColumns.borderLeft, '0px', 'the split panel should take a left border at 1024 px');
    assert.equal(tabletColumns.scroll, tabletColumns.client, 'the 1024 px walkthrough must not scroll sideways');
    // The f-strings trace is the widest authored line; at 1024 it must still fit on one row.
    await page.getByTestId('micro-back').click();
    await page.getByTestId('micro-learn-f-strings').click();
    await page.getByTestId('micro-walkthrough').waitFor({ timeout: 5000 });
    await revealWalkthrough(page, concept('f-strings'));
    const longestLine = await page.evaluate(() => {
      const line = [...document.querySelectorAll('.micro-walkthrough-line')].find((node) =>
        node.textContent.includes('Weather:')
      );
      const code = line.querySelector('code');
      return {
        text: code.textContent.trim(),
        wrapped: code.getBoundingClientRect().height > Number.parseFloat(getComputedStyle(code).lineHeight) * 1.6,
      };
    });
    assert.equal(
      longestLine.wrapped,
      false,
      `the longest walkthrough line must not wrap at 1024 px (${longestLine.text})`
    );
    await page.setViewportSize({ width: 768, height: 900 });
    await page.waitForFunction(() => window.innerWidth === 768);
    const tabletOneColumn = await page.evaluate(() => {
      const grid = document.querySelector('[data-testid="micro-walkthrough"] > div.grid');
      const tracks = getComputedStyle(grid).gridTemplateColumns;
      return {
        columns: tracks === 'none' ? 1 : tracks.split(' ').length,
        borderLeft: getComputedStyle(grid.lastElementChild).borderLeftWidth,
        borderTop: getComputedStyle(grid.lastElementChild).borderTopWidth,
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      };
    });
    assert.equal(tabletOneColumn.columns, 1, 'the 768 px walkthrough should stay single-column');
    assert.equal(tabletOneColumn.borderLeft, '0px', 'the single-column panel should not take a left border');
    assert.notEqual(tabletOneColumn.borderTop, '0px', 'the single-column panel should use a top border');
    assert.equal(tabletOneColumn.scroll, tabletOneColumn.client, 'the 768 px walkthrough must not scroll sideways');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => window.innerWidth <= 390);
    const phoneColumns = await page.evaluate(
      () =>
        getComputedStyle(
          document.querySelector('[data-testid="micro-walkthrough"] > div.grid')
        ).gridTemplateColumns.split(' ').length
    );
    assert.equal(phoneColumns, 1, 'the walkthrough returns to one column when the viewport shrinks again');
    const compactAgain = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    assert.equal(compactAgain.scroll, compactAgain.client, 'the compact layout still fits after resizing back');
    console.log(
      '  ok the micro tab responds to viewport changes: compact at 390 px, one column at 768 px, two columns at 1024 and 1280 px, compact again'
    );

    assert.deepEqual(pageErrors, [], `the micro tab threw: ${pageErrors.join('; ')}`);
    await context.close();
    console.log('\nmicro e2e: passed');
  } finally {
    await browser.close();
    if (own) await own.viteServer.close();
  }
}

main().catch((error) => {
  console.error(`[FAIL] ${error.stack ?? error.message}`);
  process.exit(1);
});
