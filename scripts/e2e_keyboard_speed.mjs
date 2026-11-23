#!/usr/bin/env node
/**
 * Fast-typing gate (`scripts/e2e_keyboard_speed.mjs`, `npm run test:e2e:keyboard-speed`).
 *
 * The broad phone gate proves one touch at a time at several constant speeds. This one is about a
 * learner changing speed without warning: a slow opening, then a burst, then another pause, with
 * two-thumb overlap in the fast stretches. A key acts on pointerdown, so a press is counted even
 * when the next finger lands before the previous one lifts. Before that change the browser's
 * synthetic click never arrived for those overlapping touches and every character in the overlap
 * was lost.
 *
 * Every plan is seeded and reproducible. A failure prints the seed, the plan's keys/gaps/holds and
 * the text the editor actually holds. No assertion is relaxed for a random scenario.
 */

import { chromium } from 'playwright-core';
import { resolveChromiumExecutable, startDevServer } from './e2e_browser_workbench.mjs';
import { seedTourSeen } from './tour_seed.mjs';
import { waitForEditor, getEditorCode } from './editor-code.mjs';
import { planSpeedScenario } from './keyboard_stress.mjs';

const PHONE = { width: 390, height: 844 };
const COUNT = Number(process.env.KEYBOARD_SPEED_COUNT ?? 100);
const OVERLAP_WINDOW = 14;

function ok(message) {
  console.log(`  ok   ${message}`);
}

function fail(message) {
  console.log(`  FAIL ${message}`);
  throw new Error(message);
}

function check(condition, message) {
  if (!condition) fail(message);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const ownServer = process.env.E2E_BASE_URL ? null : await startDevServer(process.cwd());
  const baseUrl = process.env.E2E_BASE_URL ?? ownServer.baseUrl;
  const browser = await chromium.launch({
    executablePath: resolveChromiumExecutable(),
    headless: true,
  });

  try {
    const context = await browser.newContext({
      viewport: PHONE,
      screen: PHONE,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
    });
    await seedTourSeen(context);
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('phone-tab-nav').waitFor({ state: 'visible', timeout: 30000 });
    await page.addStyleTag({ content: '*, html { scroll-behavior: auto !important; }' });

    /** A trusted touch tap used only to reach the editor, never to grade typing. */
    const tap = async (locator, label) => {
      const box = await locator.boundingBox();
      check(Boolean(box), `${label} has no box to touch`);
      const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ ...point, id: 1, radiusX: 5, radiusY: 5, force: 1 }],
      });
      await delay(40);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await delay(120);
    };

    await tap(page.getByTestId('btn-tab-picker'), 'the tab picker');
    await page.getByTestId('tab-picker-sheet').waitFor({ state: 'visible', timeout: 10000 });
    await delay(250);
    await tap(page.getByTestId('tab-picker-item-tab-pyodide'), 'the Study tab');
    await page.getByTestId('tab-picker-sheet').waitFor({ state: 'hidden', timeout: 10000 });
    await tap(page.getByTestId('phone-surface-code'), 'the Code surface');
    await page
      .locator('[data-testid="editor-panel"][data-phone-code="1"]')
      .waitFor({ state: 'visible', timeout: 20000 });
    await waitForEditor(page);
    const shell = page.getByTestId('mobile-keyboard-shell');
    await shell.waitFor({ state: 'visible', timeout: 10000 });
    await delay(320);
    check(
      (await shell.getAttribute('data-state')) === 'open',
      'the editor keyboard did not open before the speed gate'
    );

    const points = await page.evaluate(() => {
      const result = {};
      for (const element of document.querySelectorAll('[data-testid^="python-key-"]')) {
        const id = element.getAttribute('data-testid').slice('python-key-'.length);
        const rect = element.getBoundingClientRect();
        result[id] = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }
      return result;
    });
    const required = [...'abcdefghijklmnopqrstuvwxyz', 'backspace'];
    for (const key of required) {
      check(points[key], `the speed gate is missing the ${key} key`);
    }

    const dispatch = (type, entries) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: entries.map(({ key, id }) => ({
          ...points[key],
          id,
          radiusX: 5,
          radiusY: 5,
          force: 1,
        })),
      });

    const reset = async () => {
      await page.evaluate(() => window.__mechalabEditors['editor-main'].set(''));
      await page.waitForFunction(
        () => document.querySelector('[data-testid="editor-main-text"]')?.textContent === '',
        undefined,
        { timeout: 2000 }
      );
      await page.evaluate(() => window.__mechalabEditors['editor-main'].setCursor(0));
      await delay(10);
    };

    /** One plan's exact touch timeline; no synthetic key events, no insertText. */
    const runPlan = async (plan) => {
      if (plan.mode === 'single') {
        for (let index = 0; index < plan.keys.length; index += 1) {
          await dispatch('touchStart', [{ key: plan.keys[index], id: 1 }]);
          await delay(plan.holds[index]);
          // An empty list is the lift of the only active point; naming the point here leaves the
          // protocol's active-touch list primed for the next start.
          await dispatch('touchEnd', []);
          const next = plan.gaps[index + 1] ?? 0;
          await delay(Math.max(0, next - plan.holds[index]));
        }
        return;
      }

      // Two-thumb overlap: the next finger lands while the previous one is still down, then the
      // previous one lifts. The browser emits pointerdown for both; it emits no click for either.
      let active = { key: plan.keys[0], id: 1 };
      await dispatch('touchStart', [active]);
      for (let index = 1; index < plan.keys.length; index += 1) {
        await delay(Math.max(3, plan.gaps[index] - OVERLAP_WINDOW));
        const next = { key: plan.keys[index], id: active.id === 1 ? 2 : 1 };
        // A touchStart carries the new point only; the finger already down stays down without
        // being named again. Naming it again is what confused the protocol at higher speeds.
        await dispatch('touchStart', [next]);
        await delay(OVERLAP_WINDOW);
        await dispatch('touchEnd', [active]);
        active = next;
      }
      // Releasing the last active point is the empty-list form; naming a single remaining point is
      // rejected by the protocol after the previous point's lift.
      await dispatch('touchEnd', []);
    };

    const assertPlan = async (plan, label) => {
      await reset();
      await runPlan(plan);
      await delay(80);
      const actual = await getEditorCode(page);
      check(
        actual === plan.expected,
        `${label} (${plan.mode}) typed ${JSON.stringify(actual)}, expected ${JSON.stringify(
          plan.expected
        )}\nkeys ${JSON.stringify(plan.keys)}\ngaps ${JSON.stringify(plan.gaps)}\nholds ${JSON.stringify(
          plan.holds
        )}`
      );
      check(!actual.includes('\n'), `${label}: a typing key produced a line break`);
      check(
        (await page.evaluate(() => window.__mechalabEditors['editor-main'].getCursor())) ===
          plan.expected.length,
        `${label}: the caret is not after the typed text`
      );
      check(
        (await shell.getAttribute('data-state')) === 'open',
        `${label}: the keyboard folded during the speed run`
      );
      check(
        await page.evaluate(() => Boolean(document.activeElement?.closest('.cm-editor'))),
        `${label}: the editor lost its caret during the speed run`
      );
    };

    console.log('\nthe speed changes a person makes');

    // A fixed slow-to-fast run. With the old click-on-release path this passed; it remains the
    // baseline that the change did not make ordinary fast typing slower or lossy.
    const ramp = planSpeedScenario(1);
    ramp.mode = 'single';
    ramp.keys = [...'abcdefghij'];
    ramp.expected = 'abcdefghij';
    ramp.gaps = [120, 110, 95, 40, 12, 9, 9, 8, 8, 8];
    ramp.holds = [8, 8, 7, 6, 5, 4, 4, 4, 4, 4];
    await assertPlan(ramp, 'fixed acceleration ramp');
    ok('a slow opening that suddenly accelerates to 8 ms keys all ten letters');

    // The exact two-thumb sequence that produced no text at all before keys acted on pointerdown.
    const overlap = {
      seed: 'overlap',
      mode: 'overlap',
      keys: ['s', 'd', 'f'],
      gaps: [0, 15, 15],
      holds: [0, 0, 0],
      expected: 'sdf',
    };
    await assertPlan(overlap, 'fixed overlapping thumbs');
    ok('two overlapping thumbs type every key once');

    console.log(`\n${COUNT} randomized speed plans`);

    let touches = 0;
    let overlapPlans = 0;
    let singlePlans = 0;
    const started = performance.now();
    for (let seed = 1; seed <= COUNT; seed += 1) {
      const plan = planSpeedScenario(seed);
      touches += plan.keys.length;
      if (plan.mode === 'overlap') overlapPlans += 1;
      else singlePlans += 1;
      await assertPlan(plan, `speed seed ${seed}`);
      if (seed % 25 === 0) ok(`${seed} seeds and ${touches} touches passed`);
    }
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    ok(
      `${COUNT} randomized speed plans passed: ${touches} touches, ${singlePlans} single-thumb / ${overlapPlans} overlapping, ${seconds}s`
    );

    check(pageErrors.length === 0, `the speed session threw: ${pageErrors.join('; ')}`);
    check(
      consoleErrors.length === 0,
      `the speed session logged ${consoleErrors.length} console error(s): ${consoleErrors
        .slice(0, 3)
        .join('; ')}`
    );
    console.log('\nkeyboard speed gate green');
  } finally {
    await browser.close();
    if (ownServer) await ownServer.viteServer.close();
  }
}

await main();
