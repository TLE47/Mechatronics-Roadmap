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
 * 6. **The editor knows Python.** Completions come from Jedi inside this worker (`math.` offers
 *    `acos` with its signature, and picking one keeps the module name), the lint comes from
 *    pyflakes (an unused import is named with its line, and the note clears when the import is
 *    used), the pointer over a name opens Jedi's card for it (`def acos`, the call, the docstring),
 *    typing a call shows its signature with the argument marked, and a Run still works afterwards -
 *    all of these share one worker and one interpreter.
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
    await page.evaluate(() => {
      window.__mechalabEditors['editor-main'].setCursor(9999);
      // The same command `Ctrl-Space` runs. A synthetic key press into a contenteditable after a tab
      // switch is not what this suite is testing, and the binding is CodeMirror's own.
      window.__mechalabEditors['editor-main'].startCompletion();
    });
    await page.waitForSelector('.cm-tooltip-autocomplete li', { timeout: 120000 });
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
    await page.click('[data-testid="btn-breakpoints"]');
    await page.waitForSelector('[data-testid="breakpoint-condition-3"]', { timeout: 5000 });
    // Typed one key at a time, not filled: the input's value is the stored condition, so a normaliser
    // that trims would swallow the space bar and `n == 3` could never be written by a learner.
    await page.click('[data-testid="breakpoint-condition-3"]');
    await page.keyboard.type('n == 3');
    const typedCondition = (await page.inputValue('[data-testid="breakpoint-condition-3"]')).trim();
    await page.click('[data-testid="btn-breakpoints"]');
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
    await page.click('[data-testid="btn-breakpoints"]');
    await page.click('[data-testid="btn-clear-breakpoint-3"]');
    await page.click('[data-testid="btn-breakpoints"]');
    await page.click('[data-testid="breakpoint-slot-4"]');
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="breakpoint-slot-4"]')?.getAttribute('data-breakpoint') ===
        'on',
      undefined,
      { timeout: 5000 }
    );
    await page.click('[data-testid="btn-breakpoints"]');
    await page.waitForSelector('[data-testid="breakpoint-condition-4"]', { timeout: 5000 });
    await page.fill('[data-testid="breakpoint-condition-4"]', 'missing == 3');
    await page.click('[data-testid="btn-breakpoints"]');
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
    '       raises parks with the interpreter\u2019s sentence), a parked frame\u2019s values can be changed before it moves on (or are'
  );
  console.log(
    '       refused in the interpreter\u2019s words), stopping a parked run keeps the interpreter; the page never blocks,'
  );
  console.log(
    '       Jedi completes math.acos without losing the module, hovers'
  );
  console.log(
    '       `def acos`, shows the signature of a call being typed, pyflakes names an unused import, and a run still works.'
  );
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  main().catch((error) => {
    console.error('[FAIL] Runtime E2E failed:', error?.stack ?? error);
    process.exit(1);
  });
}
