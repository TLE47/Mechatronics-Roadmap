#!/usr/bin/env node
/**
 * The Python runtime's contract in a real browser (`scripts/e2e_runtime.mjs`, `npm run test:runtime`)
 *
 * Three promises the plan's Phase 0 is judged on, none of which a unit test can check:
 *
 * 1. **Stop is real.** A `while True:` loop ends within a second of the click, by interrupt rather
 *    than by killing the worker — so the 10 MB interpreter is still loaded afterwards and the
 *    session's variables are still there. The old behaviour reloaded the runtime and threw the
 *    session away; this suite runs a variable, stops a loop, then reads the variable back.
 * 2. **`input()` works.** A beginner's first program blocks in the worker (never the page), and the
 *    line the learner types comes back as the return value.
 * 3. **The page stays alive.** The main thread is free while Python runs: the Stop button is
 *    clickable, and after the interrupt the tabs still switch.
 * 4. **A breakpoint is a park that was placed.** The gutter is armed before the run, and the
 *    interpreter stops on that line with nobody pressing Pause (`app/src/editor/breakpoints.ts`).
 * 5. **A parked frame can be changed.** A value the learner types is evaluated in the frame the
 *    interpreter is stopped in and written back to it, so Continue runs the next line with it — at
 *    top level and inside a function (where the frame's `f_locals` has to be pushed into its fast
 *    locals). A refused expression names itself and the run stays parked.
 * 5b. **A condition narrows a park to the pass that matters.** `n == 3` on a line inside a loop is
 *    sent with the dots, evaluated in the frame that reached the line, and the run stops on the
 *    third turn only — and a condition that raises parks anyway, with the interpreter's sentence,
 *    because a typo in the condition is not a reason to end the run.
 * 5c. **Step in reaches the call.** Step runs a call to its end; Step in takes the called function's
 *    first line — in the learner's own file, and in the shared plant, where the bar must name the
 *    file and quote **its** line rather than main.py's. Step inside the plant stays in the plant.
 * 5d. **Step out comes back.** From inside a function or the plant, Step out stops in the caller on
 *    the line that made the call — a frame **return**, because a call is often the last thing on a
 *    line and the caller would otherwise never get a line event to stop at.
 * 5e. **A watch is a question asked at every park.** An expression pinned in the paused bar is
 *    evaluated in whichever frame the run stops in, so the same name is answered at every stop
 *    rather than only where it happens to be a local; one this frame cannot answer says so in place
 *    and the run stays parked, and the list is remembered per lesson.
 * 5f. **The file can be tidied in place.** Format asks the worker for Black's own output, applies it to
 *    the editor, and says which of three things happened (tidied, already tidy, a parse refusal that
 *    leaves the file alone); the change is one undo.
 * 6. **The editor knows Python.** Completions come from Jedi inside this worker (`math.` offers
 *    `acos` with its signature, and picking one keeps the module name), the lint comes from two
 *    tools - pyflakes (an unused import is named with its line, and the note clears when the
 *    import is used) and pycodestyle (a style rule is named with the code that can be looked up,
 *    and a line that is merely long is *not* a note, because the line-length family is off by
 *    measurement) - the pointer over a name opens Jedi's card for it (`def acos`, the call, the
 *    docstring), typing a call shows its signature with the argument marked, and a Run still works
 *    afterwards - all of these share one worker and one interpreter.
 *
 * Cross-origin isolation is checked first, because without `SharedArrayBuffer` the interrupt path
 * cannot exist at all (the app then falls back to terminating the worker).
 *
 * It is its own CI step rather than a fifth parallel suite: it downloads Pyodide, and under that
 * much contention the older browser suites start missing their click timeouts.
 *
 * `E2E_BASE_URL` points it at a running dev server; alone, it boots its own.
 */

import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
// The same executable search the other browser suites use: a machine with a system Chrome and no
// Playwright download is a normal machine, and this suite has to run there too.
import { resolveChromiumExecutable, startDevServer } from './e2e_browser_workbench.mjs';
import { getEditorCode, setEditorCode } from './editor-code.mjs';
import { readBulk } from './bulk_store_page.mjs';
import { clickToolbar } from './e2e_toolbar.mjs';
import { seedTourSeen } from './tour_seed.mjs';

const EDITOR = '[data-editor="editor-main"] .cm-content';
const RUN = '[data-testid="btn-run-verify"]';
const STOP = '[data-testid="btn-stop-execution"]';
const OUTPUT = '[data-testid="pre-actual-stdout"]';
const PAUSE = '[data-testid="btn-pause-execution"]';
const PAUSED_LINE = '[data-testid="paused-line"]';
const STATUS = '[data-testid="runner-runtime-status"]';

async function main() {
  const own = process.env.E2E_BASE_URL ? null : await startDevServer(process.cwd());
  const baseUrl = process.env.E2E_BASE_URL ?? own.baseUrl;
  const executablePath = resolveChromiumExecutable();
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox'],
  });
  let failures = 0;
  const notes = [];

  /**
   * Run the editor's code and wait for it to end.
   *
   * The Run button is disabled exactly while a run is in flight, so waiting for it to be enabled
   * again is the one signal that cannot be confused with the previous run's leftover output — a
   * fast script finishes before the Stop button is even painted.
   */
  const runAndWait = async (page, source) => {
    await setEditorCode(page, source);
    await page.click(RUN);
    await page.waitForFunction(
      () => {
        const button = document.querySelector('[data-testid="btn-run-verify"]');
        return Boolean(button) && !button.disabled;
      },
      null,
      { timeout: 60000 }
    );
    return (await page.textContent(OUTPUT)) ?? '';
  };

  const check = (name, fn) => {
    try {
      fn();
      console.log(`  ok ${name}`);
    } catch (error) {
      failures += 1;
      notes.push(`${name}: ${error.message}`);
      console.error(`  FAIL ${name}\n       ${error.message}`);
    }
  };

  try {
    const context = await browser.newContext();
    // The predict-first gate is its own suite (`test:e2e:predict`); this one is about the runtime.
    await context.addInitScript(() => {
      window.__mechalabPredictFirst = false;
    });
    // And the first-run tour is seeded away for the same reason: the runtime is what is under test.
    await seedTourSeen(context);
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(EDITOR, { timeout: 60000 });

    // 1. Cross-origin isolation: without it there is no SharedArrayBuffer and no interrupt.
    const isolation = await page.evaluate(() => ({
      isolated: window.crossOriginIsolated,
      sab: typeof SharedArrayBuffer,
    }));
    check('the page is cross-origin isolated', () => {
      assert.equal(
        isolation.sab,
        'function',
        'expected SharedArrayBuffer in the page; check the COOP/COEP headers on the dev server, since without it Stop can only terminate the worker'
      );
      assert.equal(
        isolation.isolated,
        true,
        'expected crossOriginIsolated: true; a missing COEP header silently disables the interrupt path'
      );
    });

    // 2. Warm start, measured and named: the status line is what a learner reads while waiting.
    // Wait on the state the chip declares, not on the word "ready": the pre-warm label also used to
    // contain it, so a text match could resolve before Pyodide had loaded at all.
    await page.waitForFunction(
      (selector) => document.querySelector(selector)?.getAttribute('data-runtime-status') === 'ready',
      STATUS,
      { timeout: 240000 }
    );
    const statusText = await page.textContent(STATUS);
    check('the runtime warms before the first Run and says how long it took', () => {
      assert.match(
        statusText ?? '',
        /ready in \d+\.\d+ s/,
        `expected the status chip to report the measured load ("Python ready in 1.4 s"), got "${statusText}"`
      );
    });

    // 3. input(): the worker blocks, the page does not; the typed line is the return value.
    await setEditorCode(page, 'name = input("Your name: ")\nprint(f"Hello, {name}!")');
    await page.click(RUN);
    await page.waitForSelector('[data-testid="stdin-prompt"]', { timeout: 60000 });
    const prompt = (await page.textContent('[data-testid="stdin-prompt"]')) ?? '';
    check('input() asks for a line in the page', () => {
      assert.match(prompt, /Your name:/, `expected the prompt "Your name: " on screen, got "${prompt}"`);
    });
    await page.fill('[data-testid="input-stdin"]', 'Ada');
    await page.click('[data-testid="btn-stdin-submit"]');
    await page.waitForFunction(
      (selector) => (document.querySelector(selector)?.textContent ?? '').includes('Hello, Ada!'),
      OUTPUT,
      { timeout: 30000 }
    );
    check('the typed line comes back as the input() value', () => {
      // The wait above is the assertion; reaching here means stdout carried the greeting.
      assert.ok(true);
    });

    // 3b. The study panel's clock line follows a run it did not make. The run is written by the
    //     runner, one component over from the panel that prints the clock; before the clock announced
    //     its writes, the panel kept the number the store held when the lesson mounted and the timed
    //     walk in `docs/pilot-results.md` ended with 232 s stored and "under a minute" on screen.
    await runAndWait(page, 'print("clock")');
    const panelRuns = await page.getAttribute('[data-testid="study-sitting"]', 'data-sitting-runs');
    const storedSittings = JSON.parse((await readBulk(page, 'mechalab_sittings_v1')) ?? '[]');
    check('a run moves the panel\'s clock line without a reload', () => {
      assert.ok(storedSittings.length > 0, 'the run wrote no sitting at all');
      const storedRuns = storedSittings.at(-1).runs;
      assert.equal(
        Number(panelRuns),
        storedRuns,
        `the panel shows ${panelRuns} run(s) and the store holds ${storedRuns}: the clock line is reading a number it last saw on mount`
      );
    });

    // 4. Stop must interrupt the interpreter, not replace it. The worker reports a boot id; a
    // restart would change it, and an interrupt would not.
    const bootBefore = await page.getAttribute(STATUS, 'data-runtime-boot');
    // A loop that is slow per line: `pass` would burn the harness's 400k-line step budget in
    // ~200 ms and end by itself, which would pass the timing check without proving the interrupt.
    await setEditorCode(page, 'while True:\n    sum(range(1000))');
    await page.click(RUN);
    await page.waitForSelector(STOP, { timeout: 60000 });
    await page.waitForTimeout(200); // let the loop run for a moment, so Stop interrupts real work
    const started = Date.now();
    await page.click(STOP);
    await page.waitForFunction(
      () => Boolean(document.querySelector('[data-testid="status-execution-stopped"]')),
      null,
      { timeout: 5000 }
    );
    const stopMs = Date.now() - started;
    const afterStop = (await page.textContent(OUTPUT)) ?? '';
    const statusAfterStop = (await page.textContent(STATUS)) ?? '';
    check(`Stop ends a while-True loop by interrupt (${stopMs} ms)`, () => {
      assert.ok(
        stopMs < 1000,
        `expected the run to end within 1 s of the click (target 200 ms), took ${stopMs} ms; a slow Stop means the interrupt word is not reaching CPython`
      );
      assert.doesNotMatch(
        afterStop,
        /ExecutionTimeoutError/,
        'expected the Stop to interrupt the loop, not the harness step budget to end it; a timeout here means the interrupt word never reached CPython'
      );
      assert.match(
        afterStop,
        /stopped by user/i,
        `expected the console to say the run was stopped by the learner, got "${afterStop.slice(0, 120)}"`
      );
      assert.match(
        statusAfterStop,
        /ready/i,
        `expected the runtime to still be loaded after the interrupt, got "${statusAfterStop}"; a reset status means Stop terminated the worker`
      );
    });

    // 5. Same worker, and it still runs code: the 10 MB runtime was never reloaded.
    const bootAfter = await page.getAttribute(STATUS, 'data-runtime-boot');
    const afterSession = await runAndWait(page, 'print("still here")');
    check('the interpreter survives the Stop instead of being replaced', () => {
      assert.ok(
        bootBefore,
        'expected the status chip to carry a runtime boot id (data-runtime-boot); without it this check cannot tell an interrupt from a restart'
      );
      assert.equal(
        bootAfter,
        bootBefore,
        `expected the same worker after the interrupt, got boot id ${bootAfter} (was ${bootBefore}); a new id means Stop terminated and reloaded the runtime`
      );
      assert.match(
        afterSession,
        /still here/,
        `expected the runtime to keep executing after the interrupt, got "${afterSession.slice(0, 120)}"`
      );
    });

    // 6. The page was never blocked, and still responds after the interrupt.
    await page.click('[data-testid="tab-btn-tab-bode"]');
    await page.waitForFunction(
      () => document.querySelector('[data-testid="tab-btn-tab-bode"]')?.getAttribute('aria-current') === 'page',
      null,
      { timeout: 10000 }
    );
    check('the tab rail still responds after a stopped run', () => {
      assert.equal(pageErrors.length, 0, `expected no uncaught page errors, got: ${pageErrors.join(' | ')}`);
    });

    // 7. Completions from Jedi. The keyword source this editor shipped with knows `print` and the
    // names in the file; it has never known `math.acos` or a docstring. Both are here, which means the
    // request reached the worker, the analyzers installed, and Jedi answered about this buffer.
    //
    // Switching back to the tab remounts the runner and therefore rewarms a worker, so the status is
    // waited for again: completions are only asked of a loaded interpreter (a request sent into the
    // 10 MB download would time out), and that gate is exactly what this wait lines up with.
    await page.click('[data-testid="tab-btn-tab-pyodide"]');
    await page.waitForFunction(
      (selector) => document.querySelector(selector)?.getAttribute('data-runtime-status') === 'ready',
      STATUS,
      { timeout: 120000 }
    );
    await setEditorCode(page, 'import math\nmath.');
    // The ask is repeated, not sent once. The analyzers install on the first request of a fresh worker
    // (~1.5 MB through micropip) and the client drops a request that arrives mid-install rather than
    // hanging on it — on a loaded runner the first `startCompletion()` can land exactly there, and the
    // suite then waited two minutes for a tooltip nobody had asked for again. Re-asking is what a
    // learner's next keystroke does, and the assertion below is unchanged: Jedi must answer about this
    // buffer, with the module's names.
    const completionDeadline = Date.now() + 120000;
    let completionListed = false;
    while (!completionListed && Date.now() < completionDeadline) {
      await page.evaluate(() => {
        window.__mechalabEditors['editor-main'].setCursor(9999);
        // The same command `Ctrl-Space` runs. A synthetic key press into a contenteditable after a tab
        // switch is not what this suite is testing, and the binding is CodeMirror's own.
        window.__mechalabEditors['editor-main'].startCompletion();
      });
      completionListed = await page
        .waitForSelector('.cm-tooltip-autocomplete li', { timeout: 10000 })
        .then(() => true)
        .catch(() => false);
    }
    assert.ok(
      completionListed,
      'expected the completion list within two minutes, re-asking every ten seconds; the analyzer never answered'
    );
    const completions = await page.$$eval('.cm-tooltip-autocomplete li', (items) =>
      items.map((item) => item.textContent ?? '')
    );
    check('a dotted name completes from the module, with its signature', () => {
      assert.ok(
        completions.some((label) => label.startsWith('acos')),
        `expected Jedi's math module in the list, got: ${completions.slice(0, 12).join(' | ')}`
      );
      assert.ok(
        completions.some((label) => /SupportsFloat|acos\(/.test(label)),
        `expected the signature or docstring beside the name, got: ${completions.slice(0, 12).join(' | ')}`
      );
    });

    // Picking an option replaces only the text after the dot: `math.ac` must become `math.acos`,
    // never `acos`. This is the whole reason the inserted span is computed rather than taken from
    // CodeMirror's word match. `aco` is typed to filter the list (Jedi also offers the dunders), which
    // is what a learner does anyway.
    await page.keyboard.type('aco');
    await page.waitForFunction(
      () =>
        (document.querySelector('.cm-tooltip-autocomplete li[aria-selected="true"]')?.textContent ?? '').startsWith(
          'acos'
        ),
      null,
      { timeout: 20000 }
    );
    await page.keyboard.press('Enter');
    const afterPick = await getEditorCode(page);
    check('the picked completion keeps the module it was completed from', () => {
      assert.match(
        afterPick,
        /math\.acos\b/,
        `expected math.acos in the editor, held: ${afterPick.slice(-80)}`
      );
    });

    // 8. Lint from pyflakes: an unused import is named with the line to look at, and the note clears
    // as soon as the name is used.
    await setEditorCode(page, 'import os\n\nprint("hi")\n');
    // Wait for *this* note, not for the panel: the previous buffer's note (`math.` is a syntax error)
    // keeps the panel on screen, so its existence proves nothing about the new code.
    await page.waitForFunction(
      () =>
        /'os' imported but unused/.test(
          document.querySelector('[data-testid="analysis-notes"]')?.textContent ?? ''
        ),
      null,
      { timeout: 60000 }
    );
    const notes = await page.$$eval('[data-testid^="lint-note-"]', (items) =>
      items.map((item) => item.textContent ?? '')
    );
    check('an unused import is named with its line', () => {
      assert.ok(
        notes.some((note) => /'os' imported but unused/.test(note)),
        `expected pyflakes to name the unused import, got: ${notes.join(' | ')}`
      );
      assert.ok(
        notes.some((note) => /line 1/.test(note)),
        `expected the note to say which line, got: ${notes.join(' | ')}`
      );
    });
    await setEditorCode(page, 'import os\nprint(os.getcwd())\n');
    await page
      .waitForFunction(() => !document.querySelector('[data-testid="analysis-notes"]'), null, {
        timeout: 30000,
      })
      .catch(() => undefined);
    const leftoverPanels = await page.locator('[data-testid="analysis-notes"]').count();
    check('using the import clears the note', () => {
      assert.equal(
        leftoverPanels,
        0,
        'expected the checker panel to disappear once pyflakes has nothing to say'
      );
    });

    // 8b. The style half, from pycodestyle. Two assertions, and the second is a policy rather than an
    // omission: at 88 columns the line-length rule fires 740 times across this repo's own 100
    // starters and solutions, so it is not selected, and a file that is merely wide must stay quiet.
    // One buffer carries both cases, so the panel is known to be showing *this* answer.
    const wide = 'x'.repeat(90);
    await setEditorCode(
      page,
      `import os\nvalue = 1\nif value == None:\n    print(os.getcwd())\nlabel = "${wide}"\n`
    );
    await page.waitForFunction(
      () => /E711/.test(document.querySelector('[data-testid="analysis-notes"]')?.textContent ?? ''),
      null,
      { timeout: 60000 }
    );
    const stylePanel = await page.$eval(
      '[data-testid="analysis-notes"]',
      (element) => element.textContent ?? ''
    );
    check('a style nit is named with its rule, and a wide line is not a note', () => {
      assert.match(
        stylePanel,
        /E711 comparison to None/,
        `expected pycodestyle to name the rule, read: ${stylePanel}`
      );
      assert.match(stylePanel, /line 3/, `expected the note to say which line, read: ${stylePanel}`);
      assert.doesNotMatch(
        stylePanel,
        /E501/,
        `line length is deliberately not selected; read: ${stylePanel}`
      );
      assert.match(
        stylePanel,
        /pycodestyle/,
        `the strip must say which linters answered, read: ${stylePanel}`
      );
    });

    // 9. Hover: Jedi's card for the name under the pointer. The real mouse is moved to the name's
    // coordinates - hover is a gesture CodeMirror owns, and a synthetic event would test the harness.
    await setEditorCode(page, 'import math\nprint(math.acos(0.5))\n');
    await page.locator(EDITOR).scrollIntoViewIfNeeded();
    const acosPoint = await page.evaluate(() => {
      const bridge = window.__mechalabEditors['editor-main'];
      const at = bridge.get().indexOf('acos') + 1;
      return at > 0 ? bridge.coordsOf(at) : null;
    });
    let hoverText = '';
    try {
      assert.ok(acosPoint, 'the editor bridge did not report on-screen coordinates for `acos`');
      await page.mouse.move(0, 0);
      await page.mouse.move(acosPoint.left + 3, (acosPoint.top + acosPoint.bottom) / 2);
      await page.waitForSelector('[data-testid="hover-tip"]', { timeout: 60000 });
      hoverText = (await page.textContent('[data-testid="hover-tip"]')) ?? '';
    } catch (error) {
      failures += 1;
      notes.push(`the hover card did not open: ${error.message}`);
      console.error(`  FAIL the hover card opens over a name\n       ${error.message}`);
    }
    check('the hover card shows the definition, the call and the docstring', () => {
      assert.match(hoverText, /def acos/, `expected Jedi's definition line in the card, got "${hoverText}"`);
      assert.match(hoverText, /acos\(/, `expected the call signature in the card, got "${hoverText}"`);
      assert.match(
        hoverText,
        /arc cosine/i,
        `expected the docstring in the card, got "${hoverText}"`
      );
    });
    // The pointer leaves the name: the card belongs to that name and should go with it.
    await page.mouse.move(0, 0);
    const hoverLeft = await page
      .waitForFunction(() => !document.querySelector('[data-testid="hover-tip"]'), null, { timeout: 10000 })
      .then(() => true)
      .catch(() => false);
    check('the hover card closes when the pointer leaves the name', () => {
      assert.equal(hoverLeft, true, 'expected the hover card to disappear once the pointer moved away');
    });

    // 10. Signature help: typing a call shows its signature with the argument being typed marked,
    // and closing the call takes it away. `(` auto-closes, so the cursor is inside `()` after typing.
    await setEditorCode(page, 'import math\n');
    await page.evaluate(() => {
      const bridge = window.__mechalabEditors['editor-main'];
      bridge.setCursor(bridge.get().length);
    });
    await page.keyboard.type('math.acos(');
    let signatureText = '';
    let activeParam = null;
    let activeText = '';
    try {
      await page.waitForSelector('[data-testid="signature-tip"]', { timeout: 60000 });
      signatureText = (await page.textContent('[data-testid="signature-tip"]')) ?? '';
      activeParam = await page.getAttribute('[data-testid="signature-tip"]', 'data-active-param');
      activeText =
        (await page.textContent('[data-testid="signature-tip"] .cm-mechalab-tip-sig-active')) ?? '';
    } catch (error) {
      failures += 1;
      notes.push(`the signature card did not open: ${error.message}`);
      console.error(`  FAIL typing a call shows its signature\n       ${error.message}`);
    }
    check('typing a call shows its signature and marks the argument being typed', () => {
      assert.match(signatureText, /acos\(/, `expected the call in the card, got "${signatureText}"`);
      assert.equal(activeParam, '0', `expected the first parameter to be active, got "${activeParam}"`);
      assert.match(activeText, /^x\b/, `expected the active parameter to be x, got "${activeText}"`);
    });
    await page.keyboard.type(')');
    const signatureLeft = await page
      .waitForFunction(() => !document.querySelector('[data-testid="signature-tip"]'), null, {
        timeout: 20000,
      })
      .then(() => true)
      .catch(() => false);
    check('closing the call closes the signature', () => {
      assert.equal(signatureLeft, true, 'expected the signature card to disappear once the call is closed');
    });

    // 11. The analyzers share the worker with runs. A run queued after a completion is still a run.
    const afterAnalysis = await runAndWait(page, 'print(2 + 2)');
    check('a run still works once the analyzers are installed', () => {
      assert.match(afterAnalysis, /\b4\b/, `expected the run's own output, got "${afterAnalysis.slice(0, 120)}"`);
      assert.equal(pageErrors.length, 0, `expected no uncaught page errors, got: ${pageErrors.join(' | ')}`);
    });

    // 12. Pause is real, and it is a park rather than a stop: the interpreter waits on a shared word
    //     until this page answers, so the session survives it and the next run starts from the same
    //     10 MB runtime. Stepping is the point of parking - "where is my loop now" is answered by
    //     the line it is about to run, one line at a time.
    await setEditorCode(
      page,
      'import time\ntotal = 0\nwhile True:\n    total += 1\n    time.sleep(0.05)\n'
    );
    await page.click(RUN);
    await page.waitForSelector(PAUSE, { timeout: 60000 });
    await page.waitForTimeout(400); // a few lines in, so the pause lands inside the loop
    await page.click(PAUSE);
    const parked = await page
      .waitForSelector('[data-testid="paused-bar"]', { timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    const parkedLine = parked ? ((await page.textContent(PAUSED_LINE)) ?? '').trim() : '';
    check('Pause parks the interpreter on the line it was about to run', () => {
      assert.equal(
        parked,
        true,
        'no paused bar appeared; a park needs the shared command word to reach the trace hook, so check both halves before the widget'
      );
      assert.match(
        parkedLine,
        /^(while True:|total \+= 1|time\.sleep\()/,
        `expected the parked line to be one of the program's own lines, got "${parkedLine}"`
      );
      assert.equal(pageErrors.length, 0, `expected no uncaught page errors, got: ${pageErrors.join(' | ')}`);
    });

    const stepFrom = parkedLine;
    await page.click('[data-testid="btn-step"]');
    const stepped = await page
      .waitForFunction(
        (previous) => {
          const line = document.querySelector('[data-testid="paused-line"]')?.textContent?.trim();
          return Boolean(document.querySelector('[data-testid="paused-bar"]')) && Boolean(line) && line !== previous;
        },
        stepFrom,
        { timeout: 15000 }
      )
      .then(() => true)
      .catch(() => false);
    check('Step runs one line and parks on the next', () => {
      assert.equal(
        stepped,
        true,
        `expected a second pause on a different line after Step; still showing "${stepFrom}" means the hook did not re-arm`
      );
    });

    // Stop from a park: the worker is waiting on the pause word, not the interrupt word, so this is
    // the check that the stop reaches a *parked* run rather than one that is executing.
    const bootParked = await page.getAttribute(STATUS, 'data-runtime-boot');
    await page.click(STOP);
    await page.waitForFunction(
      () => Boolean(document.querySelector('[data-testid="status-execution-stopped"]')),
      null,
      { timeout: 10000 }
    );
    const afterParkedStop = await runAndWait(page, 'print("recovered")');
    const bootAfterParked = await page.getAttribute(STATUS, 'data-runtime-boot');
    check('Stop ends a parked run, and the interpreter is still the same one', () => {
      assert.equal(
        bootAfterParked,
        bootParked,
        `expected the same worker after stopping a parked run, got boot id ${bootAfterParked} (was ${bootParked}); a new id means the park could not be woken`
      );
      assert.match(
        afterParkedStop,
        /recovered/,
        `expected the runtime to keep running after a parked stop, got "${afterParkedStop.slice(0, 120)}"`
      );
    });

    // Continue, on a program that ends by itself: a park must not eat the rest of the run.
    await setEditorCode(
      page,
      'import time\ntotal = 0\nfor i in range(20):\n    total += i\n    time.sleep(0.05)\nprint(total)\n'
    );
    await page.click(RUN);
    await page.waitForSelector(PAUSE, { timeout: 60000 });
    await page.click(PAUSE);
    await page.waitForSelector('[data-testid="paused-bar"]', { timeout: 15000 });
    await page.click('[data-testid="btn-continue"]');
    await page.waitForFunction(
      () => {
        const button = document.querySelector('[data-testid="btn-run-verify"]');
        return Boolean(button) && !button.disabled;
      },
      null,
      { timeout: 20000 }
    );
    const continued = (await page.textContent(OUTPUT)) ?? '';
    check('Continue lets a parked run finish, with its own output', () => {
      assert.match(
        continued,
        /\b190\b/,
        `expected the loop's own total (190) after Continue, got "${continued.slice(0, 120)}"`
      );
    });

    // 13. A breakpoint is the park that was placed rather than asked for: the line is armed in the
    //     gutter before the run starts, and the interpreter stops there with nobody pressing Pause.
    //     The page only sees `paused` when the trace hook reaches that line, so this also pins that
    //     the list travelled with the request and that the harness's clock ignores the pause.
    // The breakpoint is on a line that runs **once** (`print(total)`). A dot inside the loop is a
    // standard debugger: every pass stops again, and Continue means "run to the next breakpoint",
    // which is that same line next time round. Arming the print keeps this check about the park.
    const breakpointCode = 'total = 0\nfor n in (2, 3):\n    total = total + n\nprint(total)\n';
    await setEditorCode(page, breakpointCode);
    await page.click('[data-testid="breakpoint-slot-4"]');
    // The dot is drawn from React state after the click, one effect later: the assertion waits for
    // the gutter to agree rather than for the click to return.
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="breakpoint-slot-4"]')?.getAttribute('data-breakpoint') ===
        'on',
      undefined,
      { timeout: 5000 }
    );
    await page.click(RUN);
    const broke = await page
      .waitForSelector('[data-testid="paused-bar"]', { timeout: 60000 })
      .then(() => true)
      .catch(() => false);
    const brokeReason = broke
      ? await page.getAttribute('[data-testid="paused-bar"]', 'data-paused-reason')
      : null;
    const brokeLine = broke ? ((await page.textContent(PAUSED_LINE)) ?? '').trim() : '';
    check('a breakpoint parks the run where it was placed', () => {
      assert.equal(
        broke,
        true,
        'no paused bar appeared: a breakpoint needs its list to reach the worker with the request, and the trace hook to check the line it is about to run'
      );
      assert.equal(
        brokeReason,
        'breakpoint',
        `expected the bar to say the park was a breakpoint, got "${brokeReason}"`
      );
      assert.equal(
        brokeLine,
        'print(total)',
        `expected the parked line to be the armed one, got "${brokeLine}"`
      );
    });
    await page.click('[data-testid="btn-continue"]');
    await page.waitForFunction(
      () => {
        const button = document.querySelector('[data-testid="btn-run-verify"]');
        return Boolean(button) && !button.disabled;
      },
      null,
      { timeout: 20000 }
    );
    const afterBreakpoint = (await page.textContent(OUTPUT)) ?? '';
    check('Continue runs on from a breakpoint to the end of the program', () => {
      assert.match(
        afterBreakpoint,
        /\b5\b/,
        `expected the loop's own total (5) after leaving the breakpoint, got "${afterBreakpoint.slice(0, 120)}"`
      );
    });
    // Disarm, so a later visit to this page cannot be parked by this suite.
    await page.click('[data-testid="breakpoint-slot-4"]');

    // 14. A parked frame's values can be changed before it moves on. A value chip opens a one-line
    //     form, the worker evaluates the expression **in the frame it is stopped in** and stays
    //     parked, and Continue runs the next line with the new value. A refused expression must say
    //     so and leave the run parked rather than looking applied.
    const editSource = 'total = 1\nprint(total)\n';
    await setEditorCode(page, editSource);
    await page.click('[data-testid="breakpoint-slot-2"]');
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="breakpoint-slot-2"]')?.getAttribute('data-breakpoint') ===
        'on',
      undefined,
      { timeout: 5000 }
    );
    await page.click(RUN);
    await page.waitForSelector('[data-testid="paused-bar"]', { timeout: 60000 });

    // A refused expression: the bar keeps the form open and says why, in the interpreter's words.
    await page.click('[data-testid="paused-value-total"]');
    await page.fill('[data-testid="frame-edit-expression"]', '1 +');
    await page.click('[data-testid="btn-frame-edit-apply"]');
    const refused = await page
      .waitForSelector('[data-testid="frame-edit-error"]', { timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    const refusedText = refused
      ? ((await page.textContent('[data-testid="frame-edit-error"]')) ?? '').trim()
      : '';
    const stillParked = await page.locator('[data-testid="paused-bar"]').count();
    check('a refused edit is named and the run stays parked', () => {
      assert.equal(refused, true, 'expected a sentence under the edit form for an expression that does not parse');
      assert.match(
        refusedText,
        /SyntaxError|Error/,
        `expected the interpreter's own failure, got "${refusedText}"`
      );
      assert.equal(stillParked, 1, 'a refused edit must not move the program on');
    });
    await page.click('[data-testid="btn-frame-edit-cancel"]');

    await page.click('[data-testid="paused-value-total"]');
    await page.fill('[data-testid="frame-edit-expression"]', '41');
    await page.click('[data-testid="btn-frame-edit-apply"]');
    const chipUpdated = await page
      .waitForFunction(
        () => (document.querySelector('[data-testid="paused-value-total"]')?.textContent ?? '').includes('41'),
        undefined,
        { timeout: 15000 }
      )
      .then(() => true)
      .catch(() => false);
    const codeAfterEdit = (await getEditorCode(page)).trim();
    check('an edit is applied in the parked frame, and the bar shows the new value', () => {
      assert.equal(
        chipUpdated,
        true,
        'expected the value chip to read 41 after the edit; the worker re-posts the park with the frame it now holds'
      );
      assert.equal(
        codeAfterEdit,
        editSource.trim(),
        'changing a frame value must not touch the learner\u2019s code'
      );
    });
    await page.click('[data-testid="btn-continue"]');
    await page.waitForFunction(
      () => {
        const button = document.querySelector('[data-testid="btn-run-verify"]');
        return Boolean(button) && !button.disabled;
      },
      null,
      { timeout: 20000 }
    );
    const afterEdit = (await page.textContent(OUTPUT)) ?? '';
    check('the program continues with the value it was given', () => {
      assert.match(
        afterEdit,
        /\b41\b/,
        `expected print(total) to print the edited value (41), got "${afterEdit.slice(0, 120)}"`
      );
    });
    await page.click('[data-testid="breakpoint-slot-2"]');

    // Inside a function the frame's `f_locals` is a snapshot on CPython 3.12, so this is the check
    // that the value is pushed back into the frame's fast locals rather than only into the copy the
    // bar reads. If this interpreter cannot do it, the worker says so instead of pretending.
    const editFunction = 'def f():\n    x = 1\n    return x\nprint(f())\n';
    await setEditorCode(page, editFunction);
    await page.click('[data-testid="breakpoint-slot-3"]');
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="breakpoint-slot-3"]')?.getAttribute('data-breakpoint') ===
        'on',
      undefined,
      { timeout: 5000 }
    );
    await page.click(RUN);
    await page.waitForSelector('[data-testid="paused-bar"]', { timeout: 60000 });
    await page.click('[data-testid="paused-value-x"]');
    await page.fill('[data-testid="frame-edit-expression"]', '99');
    await page.click('[data-testid="btn-frame-edit-apply"]');
    await page
      .waitForFunction(
        () => (document.querySelector('[data-testid="paused-value-x"]')?.textContent ?? '').includes('99'),
        undefined,
        { timeout: 15000 }
      )
      .catch(() => undefined);
    await page.click('[data-testid="btn-continue"]');
    await page.waitForFunction(
      () => {
        const button = document.querySelector('[data-testid="btn-run-verify"]');
        return Boolean(button) && !button.disabled;
      },
      null,
      { timeout: 20000 }
    );
    const functionEdit = (await page.textContent(OUTPUT)) ?? '';
    const functionError = await page.textContent('[data-testid="pre-actual-stdout"]').catch(() => '');
    check('a local inside a function is changed for the frame that holds it', () => {
      assert.match(
        functionEdit,
        /\b99\b/,
        `expected the function to return the edited local (99), got "${String(functionError).slice(0, 120)}"`
      );
    });
    await page.click('[data-testid="breakpoint-slot-3"]');

    // 15. A condition on a breakpoint. The dot is armed on a line the loop runs three times and the
    //     condition `n == 3` is typed into the Breakpoints panel, which is the only place one is
    //     written. The gutter must draw the narrower park differently (a hollow ring), and the run
    //     must stop on the third pass with the frame's own `n` in the bar — the check that it was not
    //     the first pass, which an unconditional dot would have stopped on.
    const conditionalCode = 'total = 0\nfor n in (1, 2, 3):\n    total = total + n\nprint(total)\n';
    await setEditorCode(page, conditionalCode);
    await page.click('[data-testid="breakpoint-slot-3"]');
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="breakpoint-slot-3"]')?.getAttribute('data-breakpoint') ===
        'on',
      undefined,
      { timeout: 5000 }
    );
    await clickToolbar(page, 'btn-breakpoints');
    await page.waitForSelector('[data-testid="breakpoint-condition-3"]', { timeout: 5000 });
    // Typed one key at a time, not filled: the input's value is the stored condition, so a normaliser
    // that trims would swallow the space bar and `n == 3` could never be written by a learner.
    await page.click('[data-testid="breakpoint-condition-3"]');
    await page.keyboard.type('n == 3');
    const typedCondition = (await page.inputValue('[data-testid="breakpoint-condition-3"]')).trim();
    await clickToolbar(page, 'btn-breakpoints');
    const narrowed = await page
      .waitForFunction(
        () =>
          document.querySelector('[data-testid="breakpoint-slot-3"]')?.getAttribute('data-breakpoint') ===
          'conditional',
        undefined,
        { timeout: 5000 }
      )
      .then(() => true)
      .catch(() => false);
    await page.click(RUN);
    const narrowedParked = await page
      .waitForSelector('[data-testid="paused-bar"]', { timeout: 60000 })
      .then(() => true)
      .catch(() => false);
    const narrowedLine = narrowedParked ? ((await page.textContent(PAUSED_LINE)) ?? '').trim() : '';
    // The frame's own `n`, read from its chip: the whole values line is `total = 3n = 3` (the chips
    // have no separator of their own), so a match on the text would not say which name held 3.
    const narrowedN = narrowedParked
      ? ((await page.textContent('[data-testid="paused-value-n"]').catch(() => '')) ?? '').trim()
      : '';
    check('a conditional breakpoint stops on the pass it names, not the first', () => {
      assert.equal(
        typedCondition,
        'n == 3',
        `expected the typed condition to read back as typed, got "${typedCondition}"`
      );
      assert.equal(
        narrowed,
        true,
        'expected a dot that waits for its condition to be drawn hollow (data-breakpoint="conditional")'
      );
      assert.equal(
        narrowedParked,
        true,
        'no paused bar appeared: the condition has to reach the worker with the dot, be compiled once, and be false on the first two passes'
      );
      assert.equal(
        narrowedLine,
        'total = total + n',
        `expected the run to park on the armed line, got "${narrowedLine}"`
      );
      assert.equal(
        narrowedN,
        'n = 3',
        `expected the parked frame to hold n = 3 (the third pass), got "${narrowedN.slice(0, 120)}"`
      );
    });
    await page.click('[data-testid="btn-continue"]');
    await page.waitForFunction(
      () => {
        const button = document.querySelector('[data-testid="btn-run-verify"]');
        return Boolean(button) && !button.disabled;
      },
      null,
      { timeout: 20000 }
    );
    const narrowedOutput = (await page.textContent(OUTPUT)) ?? '';
    check('the passes the condition skipped still ran', () => {
      assert.match(
        narrowedOutput,
        /\b6\b/,
        `expected every pass to count (1 + 2 + 3 = 6), got "${narrowedOutput.slice(0, 120)}"`
      );
    });

    // 16. A condition that raises. `missing == 3` compiles (it is a real expression) but the name is
    //     not bound at this line, so evaluation fails where the run is. The park must still happen —
    //     silently skipping it would hide the learner's own typo — and the bar must carry the
    //     interpreter's sentence rather than a message of our own invention. The dot goes on line 4,
    //     which this program runs once, so one Continue finishes it.
    await clickToolbar(page, 'btn-breakpoints');
    await page.click('[data-testid="btn-clear-breakpoint-3"]');
    await clickToolbar(page, 'btn-breakpoints');
    await page.click('[data-testid="breakpoint-slot-4"]');
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="breakpoint-slot-4"]')?.getAttribute('data-breakpoint') ===
        'on',
      undefined,
      { timeout: 5000 }
    );
    await clickToolbar(page, 'btn-breakpoints');
    await page.waitForSelector('[data-testid="breakpoint-condition-4"]', { timeout: 5000 });
    await page.fill('[data-testid="breakpoint-condition-4"]', 'missing == 3');
    await clickToolbar(page, 'btn-breakpoints');
    await page.click(RUN);
    const raisedParked = await page
      .waitForSelector('[data-testid="paused-bar"]', { timeout: 60000 })
      .then(() => true)
      .catch(() => false);
    const raisedText = raisedParked
      ? ((await page.textContent('[data-testid="condition-error"]').catch(() => '')) ?? '').trim()
      : '';
    check('a condition that raises parks and names the interpreter sentence', () => {
      assert.equal(
        raisedParked,
        true,
        'expected the run to park on a line whose condition could not be evaluated'
      );
      assert.match(
        raisedText,
        /NameError/,
        `expected the interpreter's own NameError under the parked line, got "${raisedText.slice(0, 160)}"`
      );
      assert.match(
        raisedText,
        /missing/,
        `expected the sentence to name the name that is not bound, got "${raisedText.slice(0, 160)}"`
      );
    });
    await page.click('[data-testid="btn-continue"]');
    await page.waitForFunction(
      () => {
        const button = document.querySelector('[data-testid="btn-run-verify"]');
        return Boolean(button) && !button.disabled;
      },
      null,
      { timeout: 20000 }
    );
    await page.click('[data-testid="breakpoint-slot-4"]');

    // 17. Step in, in the learner's own file. The park is the line that makes the call; Step would run
    //     it to its end, Step in takes the function's first line instead - the one thing a debugger
    //     must be able to do that a pause cannot. The bar's header names the frame (`double()`), so
    //     the check reads what the learner reads rather than counting parks.
    const stepInCode = 'def double(x):\n    return x * 2\n\nprint(double(21))\n';
    await setEditorCode(page, stepInCode);
    await page.click('[data-testid="breakpoint-slot-4"]');
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="breakpoint-slot-4"]')?.getAttribute('data-breakpoint') ===
        'on',
      undefined,
      { timeout: 5000 }
    );
    await page.click(RUN);
    await page.waitForSelector('[data-testid="paused-bar"]', { timeout: 60000 });
    await page.click('[data-testid="btn-step-in"]');
    const steppedIn = await page
      .waitForFunction(
        () =>
          (document.querySelector('[data-testid="paused-line"]')?.textContent ?? '').trim() ===
          'return x * 2',
        undefined,
        { timeout: 20000 }
      )
      .then(() => true)
      .catch(() => false);
    const steppedInLine = steppedIn ? ((await page.textContent(PAUSED_LINE)) ?? '').trim() : '';
    const steppedInHeader = steppedIn
      ? ((await page.textContent('[data-testid="paused-bar"]')) ?? '').trim()
      : '';
    check('Step in stops at the first line of the function that was called', () => {
      assert.equal(
        steppedIn,
        true,
        `expected the park to move into the call (line 2 of the file), got "${steppedInLine}"`
      );
      assert.match(
        steppedInHeader,
        /double\(\)/,
        `expected the bar to name the frame it stepped into, got "${steppedInHeader.slice(0, 120)}"`
      );
    });
    await page.click('[data-testid="btn-continue"]');
    await page.waitForFunction(
      () => {
        const button = document.querySelector('[data-testid="btn-run-verify"]');
        return Boolean(button) && !button.disabled;
      },
      null,
      { timeout: 20000 }
    );
    const steppedInOutput = (await page.textContent(OUTPUT)) ?? '';
    check('the program finishes after stepping into a call', () => {
      assert.match(
        steppedInOutput,
        /\b42\b/,
        `expected double(21) to print 42, got "${steppedInOutput.slice(0, 120)}"`
      );
    });
    await page.click('[data-testid="breakpoint-slot-4"]');

    // 18. Step in, in a file that is not the learner's. Every run has the shared plant on the Pyodide
    //     filesystem, so `plant.fk(...)` is a call into a read-only tab. The park must name that file
    //     and quote **its** line (`return (`), not main.py's line 116: the payload's `file` is what
    //     makes the bar a statement about this program. A Step from inside the plant then stays in the
    //     plant (it steps over a frame at its own depth), which is what makes reading a helper
    //     possible at all.
    const plantCode = 'import mechalab_plant as plant\nprint(plant.fk(0.1, 0.2))\n';
    await setEditorCode(page, plantCode);
    await page.click('[data-testid="breakpoint-slot-2"]');
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="breakpoint-slot-2"]')?.getAttribute('data-breakpoint') ===
        'on',
      undefined,
      { timeout: 5000 }
    );
    await page.click(RUN);
    await page.waitForSelector('[data-testid="paused-bar"]', { timeout: 60000 });
    await page.click('[data-testid="btn-step-in"]');
    const plantParked = await page
      .waitForFunction(
        () =>
          (document.querySelector('[data-testid="paused-file"]')?.textContent ?? '').trim() ===
          'mechalab_plant.py',
        undefined,
        { timeout: 20000 }
      )
      .then(() => true)
      .catch(() => false);
    const plantFile = plantParked
      ? ((await page.textContent('[data-testid="paused-file"]')) ?? '').trim()
      : '';
    const plantLine = plantParked ? ((await page.textContent(PAUSED_LINE)) ?? '').trim() : '';
    const plantHeader = plantParked
      ? ((await page.textContent('[data-testid="paused-bar"]')) ?? '').trim()
      : '';
    check('Step in lands in the shared plant, and the bar quotes the plant', () => {
      assert.equal(
        plantParked,
        true,
        'expected the step to land in mechalab_plant.py: the plant is a file the learner can open, so it is a place to stand'
      );
      assert.equal(plantFile, 'mechalab_plant.py');
      assert.match(
        plantHeader,
        /fk\(\)/,
        `expected the bar to name the plant's frame, got "${plantHeader.slice(0, 140)}"`
      );
      assert.equal(
        plantLine,
        'l1 * math.cos(q1) + l2 * math.cos(q1 + q2),',
        `expected the plant's own first executable line of fk (117), got "${plantLine}"`
      );
    });
    await page.click('[data-testid="btn-step"]');
    const plantStepped = await page
      .waitForFunction(
        () =>
          (document.querySelector('[data-testid="paused-line"]')?.textContent ?? '').trim() ===
          'l1 * math.sin(q1) + l2 * math.sin(q1 + q2),',
        undefined,
        { timeout: 20000 }
      )
      .then(() => true)
      .catch(() => false);
    const plantStepFile = plantStepped
      ? ((await page.textContent('[data-testid="paused-file"]')) ?? '').trim()
      : '';
    check('Step inside a helper stays in that helper', () => {
      assert.equal(
        plantStepped,
        true,
        'expected Step to advance one line inside the plant rather than jumping back to main.py'
      );
      assert.equal(plantStepFile, 'mechalab_plant.py');
    });
    await page.click('[data-testid="btn-continue"]');
    await page.waitForFunction(
      () => {
        const button = document.querySelector('[data-testid="btn-run-verify"]');
        return Boolean(button) && !button.disabled;
      },
      null,
      { timeout: 20000 }
    );
    const plantOutput = (await page.textContent(OUTPUT)) ?? '';
    check('the call returns the plant\u2019s own answer after stepping through it', () => {
      assert.match(
        plantOutput,
        /0\.195/,
        `expected plant.fk(0.1, 0.2) to print x = 0.1950, got "${plantOutput.slice(0, 120)}"`
      );
    });
    await page.click('[data-testid="breakpoint-slot-2"]');

    // 19. Step out. Step in reaches `double`'s body; Step out runs the rest of that frame and stops in
    //     the caller — on the **call line**, which is where the program goes next even though that line
    //     will not get another line event of its own. The header is back to `top level` and the park is
    //     the learner's own file, so no file label is shown: a label that stayed would say the run is
    //     still inside a helper.
    const stepOutCode = 'def double(x):\n    y = x * 2\n    return y\n\nprint(double(21))\n';
    await setEditorCode(page, stepOutCode);
    await page.click('[data-testid="breakpoint-slot-5"]');
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="breakpoint-slot-5"]')?.getAttribute('data-breakpoint') ===
        'on',
      undefined,
      { timeout: 5000 }
    );
    await page.click(RUN);
    await page.waitForSelector('[data-testid="paused-bar"]', { timeout: 60000 });
    await page.click('[data-testid="btn-step-in"]');
    await page
      .waitForFunction(
        () =>
          (document.querySelector('[data-testid="paused-line"]')?.textContent ?? '').trim() ===
          'y = x * 2',
        undefined,
        { timeout: 20000 }
      )
      .catch(() => undefined);
    await page.click('[data-testid="btn-step-out"]');
    const steppedOut = await page
      .waitForFunction(
        () =>
          (document.querySelector('[data-testid="paused-line"]')?.textContent ?? '').trim() ===
            'print(double(21))' &&
          !document.querySelector('[data-testid="paused-file"]'),
        undefined,
        { timeout: 20000 }
      )
      .then(() => true)
      .catch(() => false);
    const steppedOutLine = steppedOut ? ((await page.textContent(PAUSED_LINE)) ?? '').trim() : '';
    const steppedOutHeader = steppedOut
      ? ((await page.textContent('[data-testid="paused-bar"]')) ?? '').trim()
      : '';
    check('Step out stops in the caller, on the line that made the call', () => {
      assert.equal(
        steppedOut,
        true,
        `expected the park at the call line with no file label, got "${steppedOutLine}"`
      );
      assert.match(
        steppedOutHeader,
        /top level/,
        `expected the caller's frame in the header, got "${steppedOutHeader.slice(0, 120)}"`
      );
    });
    await page.click('[data-testid="btn-continue"]');
    await page.waitForFunction(
      () => {
        const button = document.querySelector('[data-testid="btn-run-verify"]');
        return Boolean(button) && !button.disabled;
      },
      null,
      { timeout: 20000 }
    );
    const steppedOutOutput = (await page.textContent(OUTPUT)) ?? '';
    check('the program finishes after stepping out', () => {
      assert.match(
        steppedOutOutput,
        /\b42\b/,
        `expected double(21) to print 42, got "${steppedOutOutput.slice(0, 120)}"`
      );
    });
    await page.click('[data-testid="breakpoint-slot-5"]');

    // 20. Step out of a helper and back into the learner's file. The plant's frame returns through a
    //     `return (` tuple, so this also pins that the park is on the return **event**: the caller's
    //     line (`print(plant.fk(...))`) is mid-expression and gets no line event of its own.
    const plantOutCode =
      'import mechalab_plant as plant\nprint(plant.fk(0.1, 0.2))\nprint("done")\n';
    await setEditorCode(page, plantOutCode);
    await page.click('[data-testid="breakpoint-slot-2"]');
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="breakpoint-slot-2"]')?.getAttribute('data-breakpoint') ===
        'on',
      undefined,
      { timeout: 5000 }
    );
    await page.click(RUN);
    await page.waitForSelector('[data-testid="paused-bar"]', { timeout: 60000 });
    await page.click('[data-testid="btn-step-in"]');
    await page
      .waitForFunction(
        () =>
          (document.querySelector('[data-testid="paused-file"]')?.textContent ?? '').trim() ===
          'mechalab_plant.py',
        undefined,
        { timeout: 20000 }
      )
      .catch(() => undefined);
    await page.click('[data-testid="btn-step-out"]');
    const plantOut = await page
      .waitForFunction(
        () =>
          (document.querySelector('[data-testid="paused-line"]')?.textContent ?? '').trim() ===
            'print(plant.fk(0.1, 0.2))' &&
          !document.querySelector('[data-testid="paused-file"]'),
        undefined,
        { timeout: 20000 }
      )
      .then(() => true)
      .catch(() => false);
    check('Step out of the plant lands back in the learner\u2019s file', () => {
      assert.equal(
        plantOut,
        true,
        'expected the caller line of the call that entered the plant, with no helper label'
      );
    });
    await page.click('[data-testid="btn-continue"]');
    await page.waitForFunction(
      () => {
        const button = document.querySelector('[data-testid="btn-run-verify"]');
        return Boolean(button) && !button.disabled;
      },
      null,
      { timeout: 20000 }
    );
    const plantOutOutput = (await page.textContent(OUTPUT)) ?? '';
    check('the call finishes after stepping out of the plant', () => {
      assert.match(
        plantOutOutput,
        /0\.195/,
        `expected the tuple to print after the step out, got "${plantOutOutput.slice(0, 120)}"`
      );
      assert.match(
        plantOutOutput,
        /done/,
        `expected the next line to run too, got "${plantOutOutput.slice(0, 120)}"`
      );
    });
    await page.click('[data-testid="breakpoint-slot-2"]');

    // 21. Watch expressions. A watch is written once and answered in **every frame the run parks
    //     in**, which is the one thing the bar's value chips cannot do: they list this frame's
    //     locals, so a name that is not one of them has nothing to show. Pinned while parked, so the
    //     first answer arrives in the frame the learner is standing in rather than one Step later.
    const watchCode = 'total = 0\nfor n in (1, 2, 3):\n    total = total + n\nprint(total)\n';
    await setEditorCode(page, watchCode);
    await page.click('[data-testid="breakpoint-slot-3"]');
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="breakpoint-slot-3"]')?.getAttribute('data-breakpoint') ===
        'on',
      undefined,
      { timeout: 5000 }
    );
    // Narrowed to the first pass, so Continue really does run to the end: an unconditional dot in
    // the loop would park again on the second turn and the run would never finish.
    if (!(await page.locator('[data-testid="breakpoint-condition-3"]').count())) {
      await clickToolbar(page, 'btn-breakpoints');
    }
    await page.waitForSelector('[data-testid="breakpoint-condition-3"]', { timeout: 5000 });
    await page.fill('[data-testid="breakpoint-condition-3"]', 'n == 1');
    if ((await page.getAttribute('[data-testid="btn-breakpoints"]', 'aria-expanded')) === 'true') {
      await clickToolbar(page, 'btn-breakpoints');
    }
    await page.click(RUN);
    await page.waitForSelector('[data-testid="paused-bar"]', { timeout: 60000 });
    // The chip carries its unpin button, so its text ends with the multiplication sign; the checks
    // read what is beside the expression rather than the whole row.
    const watchText = async (index) =>
      ((await page.textContent(`[data-testid="paused-watch-${index}"]`)) ?? '')
        .replace(/\s+/g, ' ')
        .trim();
    await page.fill('[data-testid="watch-input"]', 'total');
    await page.press('[data-testid="watch-input"]', 'Enter');
    const firstWatchShown = await page
      .waitForSelector('[data-testid="paused-watch-0"]', { timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    const firstWatch = firstWatchShown ? await watchText(0) : '';
    check('a watch pinned while parked is answered in that frame, not one step later', () => {
      assert.equal(firstWatchShown, true, 'expected the pinned expression to appear on the bar');
      assert.match(
        firstWatch,
        /total\s*=\s*0\b/,
        `expected total = 0 at the first pass of the loop, got "${firstWatch}"`
      );
    });
    await page.click('[data-testid="btn-step"]');
    const steppedWatchShown = await page
      .waitForFunction(
        () => /total\s*=\s*1\b/.test(document.querySelector('[data-testid="paused-watch-0"]')?.textContent ?? ''),
        undefined,
        { timeout: 20000 }
      )
      .then(() => true)
      .catch(() => false);
    const steppedWatch = steppedWatchShown ? await watchText(0) : '';
    check('the same watch is evaluated again at the next park', () => {
      assert.equal(
        steppedWatchShown,
        true,
        `expected total = 1 one Step later, got "${steppedWatch}"`
      );
    });
    // A watch this frame cannot answer says so in place: `missing` was never assigned, and the run
    // must stay parked rather than treating the NameError as a failure of the program.
    await page.fill('[data-testid="watch-input"]', 'missing');
    await page.press('[data-testid="watch-input"]', 'Enter');
    const watchErrorShown = await page
      .waitForFunction(
        () => /NameError/.test(document.querySelector('[data-testid="paused-watch-1"]')?.textContent ?? ''),
        undefined,
        { timeout: 20000 }
      )
      .then(() => true)
      .catch(() => false);
    const erroredWatch = watchErrorShown ? await watchText(1) : '';
    check('a watch the frame cannot evaluate names the error and leaves the run parked', () => {
      assert.equal(
        watchErrorShown,
        true,
        `expected a NameError beside "missing", got "${erroredWatch}"`
      );
      assert.match(erroredWatch, /missing/, `expected the expression to stay readable, got "${erroredWatch}"`);
    });
    const storedWatches = await page.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem('mechalab_watches_v1') || 'null');
      } catch {
        return null;
      }
    });
    check('the pinned list is remembered per lesson, in the order it was written', () => {
      const lists = storedWatches && Object.values(storedWatches);
      assert.ok(
        Array.isArray(lists) && lists.length === 1,
        `expected the store to hold one lesson's list, got ${JSON.stringify(storedWatches)}`
      );
      assert.deepEqual(
        lists[0],
        ['total', 'missing'],
        `expected both expressions in order, got ${JSON.stringify(lists[0])}`
      );
    });
    await page.click('[data-testid="btn-unwatch-0"]');
    const unpinned = await page
      .waitForFunction(
        () => {
          const chip = document.querySelector('[data-testid="paused-watch-0"]')?.textContent ?? '';
          return !/total/.test(chip) && /NameError/.test(chip);
        },
        undefined,
        { timeout: 20000 }
      )
      .then(() => true)
      .catch(() => false);
    check('unpinning removes that expression and leaves the rest, without moving the run', () => {
      assert.equal(
        unpinned,
        true,
        'expected the remaining chip to be the NameError one: unpinning is not a Step'
      );
    });
    await page.click('[data-testid="btn-continue"]');
    await page.waitForFunction(
      () => {
        const button = document.querySelector('[data-testid="btn-run-verify"]');
        return Boolean(button) && !button.disabled;
      },
      null,
      { timeout: 20000 }
    );
    const watchOutput = (await page.textContent(OUTPUT)) ?? '';
    check('the program finishes with its own answer after the watches were read', () => {
      assert.match(
        watchOutput,
        /\b6\b/,
        `expected the loop to sum to 6, got "${watchOutput.slice(0, 120)}"`
      );
    });
    await page.click('[data-testid="breakpoint-slot-3"]');

    // 22. Format with Black. The formatter is a pure-Python library in the same worker — installed on the
    //     first press, because it is ~2 MB of wheels — so the three things a unit test cannot see are
    //     pinned here: the answer becomes the file, a file Black cannot read is a sentence about the
    //     syntax (and leaves the file alone), and the change is one undo, which is what the status line
    //     promises when it says ⌘Z puts it back.
    const messy = "x=1\nif x>0:\n  print( x )\nprint( 'a',1 )\n";
    await setEditorCode(page, messy);
    await clickToolbar(page, 'btn-format');
    const formattedShown = await page
      .waitForFunction(
        () =>
          document.querySelector('[data-testid="format-status"]')?.getAttribute('data-format-state') ===
          'done',
        undefined,
        { timeout: 120000 }
      )
      .then(() => true)
      .catch(() => false);
    const formattedText = (await getEditorCode(page)) ?? '';
    check('Format rewrites the file exactly as Black would', () => {
      assert.equal(
        formattedShown,
        true,
        'expected a done status after the first press, which also installs Black'
      );
      assert.equal(
        formattedText,
        'x = 1\nif x > 0:\n    print(x)\nprint("a", 1)\n',
        `expected Black's own output, got ${JSON.stringify(formattedText)}`
      );
    });
    // The status line promises one undo, so the promise is checked: the caret goes to the editor and
    // the platform's undo chord does what the sentence says.
    await page.evaluate(() => window.__mechalabEditors?.['editor-main']?.focus());
    await page.keyboard.press('ControlOrMeta+z');
    const undone = await page
      .waitForFunction(
        () =>
          window.__mechalabEditors?.['editor-main']?.get() ===
          "x=1\nif x>0:\n  print( x )\nprint( 'a',1 )\n",
        undefined,
        { timeout: 10000 }
      )
      .then(() => true)
      .catch(() => false);
    check('one undo puts the learner\u2019s own text back', () => {
      assert.equal(undone, true, 'expected the formatted document to be a single undo step');
    });
    // Back to the tidied file, so the second press has something it has already formatted.
    await setEditorCode(page, formattedText);
    await clickToolbar(page, 'btn-format');
    const alreadyTidy = await page
      .waitForFunction(
        () => /Already tidy/.test(document.querySelector('[data-testid="format-status"]')?.textContent ?? ''),
        undefined,
        { timeout: 30000 }
      )
      .then(() => true)
      .catch(() => false);
    check('a second press says the file is already tidy', () => {
      assert.equal(alreadyTidy, true, 'expected the second Format to report that nothing changed');
    });
    const brokenCode = 'def f(:\n    return 1\n';
    await setEditorCode(page, brokenCode);
    await clickToolbar(page, 'btn-format');
    const parseShown = await page
      .waitForFunction(
        () => /could not parse/.test(document.querySelector('[data-testid="format-status"]')?.textContent ?? ''),
        undefined,
        { timeout: 30000 }
      )
      .then(() => true)
      .catch(() => false);
    const parseStatus = ((await page.textContent('[data-testid="format-status"]')) ?? '').trim();
    const afterBroken = await getEditorCode(page);
    check('a file Black cannot parse says so in the parser\u2019s words, and is left alone', () => {
      assert.equal(parseShown, true, `expected a parse refusal, got "${parseStatus}"`);
      assert.match(
        parseStatus,
        /cannot parse: \d+:\d+/i,
        `expected the parser's own position in the sentence, got "${parseStatus}"`
      );
      assert.equal(
        afterBroken,
        brokenCode,
        'a refused format must not touch the learner\u2019s file'
      );
    });
    // The palette's own route to it: the command reaches the runner through a nonce, not a callback, so
    // the wiring is worth one press.
    await setEditorCode(page, messy);
    await page.keyboard.press('Control+k');
    await page.getByTestId('input-palette-search').fill('format');
    await page.getByTestId('palette-item-action-format-file').waitFor({ timeout: 10000 });
    await page.keyboard.press('Enter');
    const paletteFormatted = await page
      .waitForFunction(
        () =>
          document.querySelector('[data-testid="format-status"]')?.getAttribute('data-format-state') ===
            'done' &&
          (window.__mechalabEditors?.['editor-main']?.get() ?? '').startsWith('x = 1'),
        undefined,
        { timeout: 60000 }
      )
      .then(() => true)
      .catch(() => false);
    check('the palette\u2019s Format command formats the open file', () => {
      assert.equal(
        paletteFormatted,
        true,
        'expected ⌘K \u2192 "format" \u2192 Enter to tidy the editor, through the runner\u2019s request counter'
      );
    });

    await context.close();
  } finally {
    await browser.close();
    if (own) await own.viteServer.close();
  }

  if (failures) {
    console.error(`\n[FAIL] ${failures} runtime check(s) failed:\n  ${notes.join('\n  ')}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    '\n[PASS] Interruptible Python: input() round-trips, a while-True loop stops by interrupt, the session survives it, '
  );
  console.log(
    '       a run parks on a shared word and steps line by line, Continue finishes it, a breakpoint parks on'
  );
  console.log(
    '       the line it was placed on, a condition narrows a park to the pass it names (and one that'
  );
  console.log(
    '       raises parks with the interpreter\u2019s sentence), Step in reaches the call (in the lesson\u2019s'
  );
  console.log(
    '       file and in the shared plant, quoted from the plant\u2019s own line), Step out returns to it,'
  );
  console.log(
    '       a pinned expression is answered in every frame the run parks in (and says so when it cannot be),'
  );
  console.log(
    '       Format rewrites the file as Black would, in one undo, and a parse refusal leaves it alone,'
  );
  console.log(
    '       a parked frame\u2019s values can be changed before it moves on (or are'
  );
  console.log(
    '       refused in the interpreter\u2019s words), stopping a parked run keeps the interpreter; the page never blocks,'
  );
  console.log(
    '       Jedi completes math.acos without losing the module, hovers'
  );
  console.log(
    '       `def acos`, shows the signature of a call being typed, pyflakes names an unused import and'
  );
  console.log(
    '       pycodestyle names a style rule (and leaves a merely long line alone), and a run still works.'
  );
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  main().catch((error) => {
    console.error('[FAIL] Runtime E2E failed:', error?.stack ?? error);
    process.exit(1);
  });
}
