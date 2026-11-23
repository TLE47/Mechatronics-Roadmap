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
 * the text the editor actually holds. No assertion is relaxed for a random scenario. The last
 * section shrinks the phone to 360×640, where the band used to claim more height than the space
 * between the mode bar and the Study bar, and types at random speeds with the caret sampled every
 * frame against the bar's top.
 */

import { chromium } from 'playwright-core';
import { resolveChromiumExecutable, startDevServer } from './e2e_browser_workbench.mjs';
import { seedTourSeen } from './tour_seed.mjs';
import { waitForEditor, getEditorCode } from './editor-code.mjs';
import { mulberry32, planSpeedScenario } from './keyboard_stress.mjs';

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

    console.log('\nthe caret stays above the keys on a long file');

    // The phone's code editor used to be as tall as its document: a long file made the page
    // thousands of pixels tall, the editor's own scroller never moved, and the caret sat hundreds
    // of pixels under the keys. Typing then grew the page for every wrapped line — the scrollbar
    // that kept sliding up and down — while the line being typed was hidden. The editor is now a
    // measured band above the keys (`EditorCodePane`), and every keyboard edit reveals the caret
    // (`pythonEditorImpl.revealCaret`). These checks pin both the geometry and the page's stillness.
    const band = await page.evaluate(() => {
      const face = document.querySelector(
        '[data-testid="editor-panel"][data-phone-code="1"] [data-editor-face="code"]'
      );
      const box = face?.getBoundingClientRect();
      const header = document.querySelector('header[data-chrome="header"]');
      const rail = document.querySelector('[data-chrome="rail"]');
      return {
        marked: face?.getAttribute('data-phone-band') ?? null,
        height: box ? Math.round(box.height) : 0,
        keysTop: Math.round(
          document.querySelector('[data-testid="python-keyboard"]')?.getBoundingClientRect().top ?? 0
        ),
        bodyAttr: document.body.dataset.phoneTyping ?? null,
        rootAttr: document.documentElement.dataset.phoneTyping ?? null,
        header: header ? getComputedStyle(header).display : 'missing',
        rail: rail ? getComputedStyle(rail).display : 'missing',
        overflow: [
          getComputedStyle(document.documentElement).overflow,
          getComputedStyle(document.body).overflow,
        ],
      };
    });
    check(band.marked === '1', 'the phone code face is not a measured band');
    check(
      band.height >= 360 && band.height < band.keysTop,
      `the code face does not use the typing layer's room (${band.height}px of ${band.keysTop}px)`
    );
    check(
      band.bodyAttr === '1' && band.rootAttr === '1',
      'the phone typing layer is not marked on the document'
    );
    check(
      band.header === 'none' && band.rail === 'none',
      'the header and tab picker are still taking the typing screen'
    );
    check(
      band.overflow[0] === 'hidden' && band.overflow[1] === 'hidden',
      `the page is not locked while typing (${band.overflow.join(', ')})`
    );

    // A file the band cannot hold, with the caret at its end. The first real key is the press that
    // must bring the caret into the band; sampling starts after it, so what follows measures typing.
    const longFile = Array.from(
      { length: 32 },
      (_, index) => `step_${String(index).padStart(2, '0')} = ${index}  # a line the band cannot hold`
    ).join('\n');
    await page.evaluate((text) => {
      const editor = window.__mechalabEditors['editor-main'];
      editor.set(text);
      editor.setCursor(text.length);
      editor.focus();
    }, longFile);
    await delay(140);
    await dispatch('touchStart', [{ key: 'a', id: 1 }]);
    await delay(6);
    await dispatch('touchEnd', []);
    await delay(160);

    const bandEdge = await page.evaluate(() => {
      const study = document.querySelector('[data-phone-bar]');
      const keyboard = document.querySelector('[data-testid="python-keyboard"]');
      const face = document.querySelector(
        '[data-testid="editor-panel"][data-phone-code="1"] [data-editor-face="code"]'
      );
      return {
        top: Math.round(
          Math.min(
            study?.getBoundingClientRect().top ?? Infinity,
            keyboard?.getBoundingClientRect().top ?? Infinity
          )
        ),
        faceBottom: Math.round(face?.getBoundingClientRect().bottom ?? 0),
      };
    });
    const bandTop = bandEdge.top;
    // A band of the right height that has not been placed ends below the fold, where the caret
    // check above would only fail once a key was typed. Pin its bottom to the bar it sits on.
    check(
      Math.abs(bandEdge.faceBottom - bandTop) <= 2,
      `the code band ends at ${bandEdge.faceBottom}px, not at the Study bar's ${bandTop}px`
    );

    await page.evaluate(() => {
      const samples = [];
      window.__bandSamples = samples;
      const scroller = document.querySelector(
        '[data-testid="editor-panel"] [data-editor="editor-main"] .cm-scroller'
      );
      const sample = () => {
        const editor = window.__mechalabEditors['editor-main'];
        const coords = editor.coordsOf(editor.getCursor());
        samples.push({
          windowY: window.scrollY,
          docH: document.documentElement.scrollHeight,
          scrollTop: scroller ? scroller.scrollTop : 0,
          caretBottom: coords ? coords.bottom : null,
        });
        if (samples.length < 1500) window.__bandFrame = requestAnimationFrame(sample);
      };
      sample();
    });

    const scrollPlan = {
      seed: 'scroll',
      mode: 'single',
      keys: [...'typingfast'],
      gaps: [90, 70, 40, 20, 12, 9, 8, 8, 8, 8],
      holds: [8, 7, 6, 5, 4, 4, 3, 3, 3, 3],
      expected: 'typingfast',
    };
    await runPlan(scrollPlan);
    await delay(140);
    const bandRun = await page.evaluate(() => {
      cancelAnimationFrame(window.__bandFrame);
      return {
        samples: window.__bandSamples ?? [],
        text: window.__mechalabEditors['editor-main'].get(),
        cursor: window.__mechalabEditors['editor-main'].getCursor(),
      };
    });

    check(
      bandRun.text === `${longFile}a${scrollPlan.expected}`,
      `typing at the end of a long file produced ${JSON.stringify(bandRun.text.slice(-24))}`
    );
    check(
      bandRun.cursor === longFile.length + 1 + scrollPlan.expected.length,
      'the caret did not follow the typed text on a long file'
    );
    const hiddenFrames = bandRun.samples.filter(
      (sample) => sample.caretBottom !== null && sample.caretBottom > bandTop + 0.5
    );
    check(
      hiddenFrames.length === 0,
      `${hiddenFrames.length} of ${bandRun.samples.length} frames typed with the caret below the keys (${bandTop}px)`
    );
    const pageYs = new Set(bandRun.samples.map((sample) => Math.round(sample.windowY)));
    check(
      pageYs.size === 1,
      `the page scrolled while typing (window.scrollY ${[...pageYs].join(', ')})`
    );
    const docHeights = new Set(bandRun.samples.map((sample) => Math.round(sample.docH)));
    check(
      docHeights.size === 1,
      `the page changed height while typing (${[...docHeights].join(', ')}px)`
    );
    check(
      bandRun.samples.some((sample) => sample.scrollTop > 0),
      'the editor scroller never moved; the caret cannot have been followed'
    );
    ok('a long file is a band above the keys, and typing scrolls only that band');

    console.log('\na drifting thumb types once, and the page stays still');

    // A fast thumb is not a perfect tap: it lands on a key and slides while the key is held.
    // Before the keyboard opted out of touch panning, that slide moved the whole page (44 px for a
    // 48 px drift) and the next finger moved it back — the up-and-down recoil a learner sees while
    // typing fast. The keys are not a surface to scroll, so a drift must type exactly once and move
    // neither the page nor the code.
    const driftStart = 'alpha = 1';
    await page.evaluate((text) => {
      const editor = window.__mechalabEditors['editor-main'];
      editor.set(text);
      editor.setCursor(text.length);
      editor.focus();
    }, driftStart);
    await delay(200);

    const driftState = () =>
      page.evaluate(() => {
        const editor = window.__mechalabEditors['editor-main'];
        const scroller = document.querySelector(
          '[data-testid="editor-panel"] [data-editor="editor-main"] .cm-scroller'
        );
        return {
          text: editor.get(),
          cursor: editor.getCursor(),
          y: Math.round(window.scrollY),
          top: Math.round(scroller?.scrollTop ?? 0),
          docH: Math.round(document.documentElement.scrollHeight),
          scale: visualViewport?.scale ?? 1,
          keys: document
            .querySelector('[data-testid="mobile-keyboard-shell"]')
            ?.getAttribute('data-state'),
          focused: Boolean(document.activeElement?.closest('.cm-editor')),
        };
      });
    const beforeDrift = await driftState();

    /** Hold one key and slide the finger to where it actually went, then lift. */
    const dragOnKey = async (key, dy) => {
      await dispatch('touchStart', [{ key, id: 1 }]);
      await delay(10);
      for (let step = 1; step <= 5; step += 1) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [
            {
              ...points[key],
              y: points[key].y + (dy * step) / 5,
              id: 1,
              radiusX: 5,
              radiusY: 5,
              force: 1,
            },
          ],
        });
        await delay(8);
      }
      await dispatch('touchEnd', []);
      await delay(180);
    };

    await dragOnKey('a', 48);
    const afterDown = await driftState();
    check(
      afterDown.text === `${driftStart}a`,
      `a key slid 48 px down typed ${JSON.stringify(afterDown.text.slice(-24))}`
    );
    check(
      afterDown.y === beforeDrift.y,
      `a downward drift scrolled the page (${beforeDrift.y} -> ${afterDown.y})`
    );
    check(
      afterDown.top === beforeDrift.top,
      `a downward drift scrolled the code (${beforeDrift.top} -> ${afterDown.top})`
    );
    check(
      afterDown.docH === beforeDrift.docH,
      `a downward drift changed the page height (${beforeDrift.docH} -> ${afterDown.docH})`
    );
    check(afterDown.scale === 1, `a key drift zoomed the page to ${afterDown.scale}`);
    check(
      afterDown.keys === 'open' && afterDown.focused,
      'a key drift folded the keyboard or lost the caret'
    );

    await dragOnKey('a', -48);
    const afterUp = await driftState();
    check(
      afterUp.text === `${driftStart}aa`,
      `a key slid 48 px up typed ${JSON.stringify(afterUp.text.slice(-24))}`
    );
    check(
      afterUp.y === beforeDrift.y,
      `an upward drift scrolled the page (${beforeDrift.y} -> ${afterUp.y})`
    );
    check(afterUp.scale === 1, `an upward key drift zoomed the page to ${afterUp.scale}`);
    ok('a finger that slides 48 px on a key types one letter and never moves the page');

    // Two thumbs land together and both slide. The second finger used to be able to pinch the page
    // or drag it while the first was still down.
    const pairStart = 'alpha = 1';
    await page.evaluate((text) => {
      const editor = window.__mechalabEditors['editor-main'];
      editor.set(text);
      editor.setCursor(text.length);
      editor.focus();
    }, pairStart);
    await delay(160);
    const beforePair = await driftState();
    const pairA = points.a;
    const pairS = points.s;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { ...pairA, id: 1, radiusX: 5, radiusY: 5, force: 1 },
        { ...pairS, id: 2, radiusX: 5, radiusY: 5, force: 1 },
      ],
    });
    await delay(10);
    for (let step = 1; step <= 4; step += 1) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          { ...pairA, y: pairA.y + step * 8, id: 1, radiusX: 5, radiusY: 5, force: 1 },
          { ...pairS, y: pairS.y + step * 8, id: 2, radiusX: 5, radiusY: 5, force: 1 },
        ],
      });
      await delay(8);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await delay(180);
    const afterPair = await driftState();
    check(
      afterPair.text.length === beforePair.text.length + 2,
      `two sliding thumbs typed ${JSON.stringify(afterPair.text.slice(-24))}`
    );
    const typedPair = afterPair.text.slice(-2);
    check(typedPair === 'as' || typedPair === 'sa', `two sliding thumbs typed ${JSON.stringify(typedPair)}`);
    check(
      afterPair.y === beforePair.y,
      `two sliding thumbs scrolled the page (${beforePair.y} -> ${afterPair.y})`
    );
    check(afterPair.scale === 1, `two sliding thumbs zoomed the page to ${afterPair.scale}`);
    ok('two sliding thumbs type both letters without moving or zooming the page');

    console.log('\nthe band fits a short phone, not only a tall one');

    // The band used to have a 140 px floor whatever room existed. On a 360×640 phone the Study bar
    // began at 242 px while a 140 px face ended at 293 px, so the last two lines — including the
    // caret — sat behind the bar for the whole session. The face is now capped at the space
    // between the mode bar and the bar it rests on; a small band is honest, an overlapping one
    // hides the text being typed.
    await page.setViewportSize({ width: 360, height: 640 });
    await delay(500);
    const shortFace = await page.evaluate(() => {
      const face = document.querySelector(
        '[data-testid="editor-panel"][data-phone-code="1"] [data-editor-face="code"]'
      );
      const bar = document.querySelector('[data-phone-bar]');
      const box = face?.getBoundingClientRect();
      return {
        marked: face?.getAttribute('data-phone-band') ?? null,
        top: box ? Math.round(box.top) : 0,
        bottom: box ? Math.round(box.bottom) : 0,
        height: box ? Math.round(box.height) : 0,
        barTop: bar ? Math.round(bar.getBoundingClientRect().top) : 0,
        layer: [document.body.dataset.phoneTyping ?? null, document.documentElement.dataset.phoneTyping ?? null],
        header: getComputedStyle(document.querySelector('header[data-chrome="header"]')).display,
        rail: getComputedStyle(document.querySelector('[data-chrome="rail"]')).display,
      };
    });
    check(shortFace.marked === '1', 'the 360x640 phone did not get a measured band');
    check(
      shortFace.bottom <= shortFace.barTop + 2,
      `the code band overruns the Study bar (${shortFace.bottom}px > ${shortFace.barTop}px) on a 360x640 phone`
    );
    check(
      shortFace.height >= 170,
      `the 360x640 phone's typing layer left only ${shortFace.height}px of code`
    );
    check(
      shortFace.layer[0] === '1' && shortFace.layer[1] === '1' && shortFace.header === 'none' && shortFace.rail === 'none',
      'the short phone dropped the typing layer or brought its chrome back'
    );

    // The keys moved with the shorter viewport; the touch dispatcher reads `points`, so refresh it
    // in place rather than leaving the last phone's coordinates.
    const shortPoints = await page.evaluate(() => {
      const result = {};
      for (const element of document.querySelectorAll('[data-testid^="python-key-"]')) {
        const id = element.getAttribute('data-testid').slice('python-key-'.length);
        const rect = element.getBoundingClientRect();
        result[id] = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }
      return result;
    });
    Object.assign(points, shortPoints);

    const shortFile = Array.from(
      { length: 30 },
      (_, index) => `short_${String(index).padStart(2, '0')} = sensor[${index}] + offset`
    ).join('\n');
    await page.evaluate((text) => {
      const editor = window.__mechalabEditors['editor-main'];
      editor.set(text);
      editor.setCursor(text.length);
      editor.focus();
    }, shortFile);
    await delay(120);
    // The press that brings the end of the long file into the small band. Sampling starts after it,
    // so what follows measures typing, not the first reveal.
    await dispatch('touchStart', [{ key: 'a', id: 1 }]);
    await delay(6);
    await dispatch('touchEnd', []);
    await delay(160);

    await page.evaluate(() => {
      const samples = [];
      window.__shortSamples = samples;
      const scroller = document.querySelector(
        '[data-testid="editor-panel"] [data-editor="editor-main"] .cm-scroller'
      );
      const bar = document.querySelector('[data-phone-bar]');
      const sample = () => {
        const editor = window.__mechalabEditors['editor-main'];
        const coords = editor.coordsOf(editor.getCursor());
        samples.push({
          windowY: window.scrollY,
          docH: document.documentElement.scrollHeight,
          scrollTop: scroller ? scroller.scrollTop : 0,
          caretBottom: coords ? coords.bottom : null,
          // Read the bar every frame: it is the edge the text must stay above.
          barTop: bar ? bar.getBoundingClientRect().top : null,
        });
        if (samples.length < 1500) window.__shortFrame = requestAnimationFrame(sample);
      };
      sample();
    });

    const shortRng = mulberry32(20261123);
    const shortWord = 'shortband';
    for (const key of shortWord) {
      await dispatch('touchStart', [{ key, id: 1 }]);
      await delay(2 + Math.floor(shortRng() * 11));
      await dispatch('touchEnd', []);
      await delay(4 + Math.floor(shortRng() ** 2 * 220));
    }
    await delay(140);
    const shortRun = await page.evaluate(() => {
      cancelAnimationFrame(window.__shortFrame);
      return {
        samples: window.__shortSamples ?? [],
        text: window.__mechalabEditors['editor-main'].get(),
        cursor: window.__mechalabEditors['editor-main'].getCursor(),
        keys: document.querySelector('[data-testid="mobile-keyboard-shell"]')?.getAttribute('data-state'),
        focused: Boolean(document.activeElement?.closest('.cm-editor')),
      };
    });

    check(
      shortRun.text === `${shortFile}a${shortWord}`,
      `the short-phone run typed ${JSON.stringify(shortRun.text.slice(-24))}`
    );
    check(shortRun.cursor === shortRun.text.length, 'the caret did not follow the short-phone run');
    check(shortRun.keys === 'open', 'the keyboard folded during the short-phone run');
    check(shortRun.focused, 'the editor lost its caret during the short-phone run');
    const shortHidden = shortRun.samples.filter(
      (sample) => sample.caretBottom !== null && sample.barTop !== null && sample.caretBottom > sample.barTop + 0.5
    );
    check(
      shortHidden.length === 0,
      `${shortHidden.length} of ${shortRun.samples.length} frames typed behind the Study bar on a 360x640 phone`
    );
    const shortYs = new Set(shortRun.samples.map((sample) => Math.round(sample.windowY)));
    check(shortYs.size === 1, `the short-phone page scrolled while typing (${[...shortYs].join(', ')})`);
    const shortHeights = new Set(shortRun.samples.map((sample) => Math.round(sample.docH)));
    check(
      shortHeights.size === 1,
      `the short-phone page changed height while typing (${[...shortHeights].join(', ')})`
    );
    check(
      shortRun.samples.some((sample) => sample.scrollTop > 0),
      'the short phone\'s editor scroller never moved; the caret cannot have been followed'
    );
    ok('a 360x640 phone keeps the caret above the Study bar with the page still');

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
