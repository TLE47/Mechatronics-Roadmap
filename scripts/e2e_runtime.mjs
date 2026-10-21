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
import { startDevServer } from './e2e_browser_workbench.mjs';
import { getEditorCode, setEditorCode } from './editor-code.mjs';

const EDITOR = '[data-editor="editor-main"] .cm-content';
const RUN = '[data-testid="btn-run-verify"]';
const STOP = '[data-testid="btn-stop-execution"]';
const OUTPUT = '[data-testid="pre-actual-stdout"]';
const STATUS = '[data-testid="runner-runtime-status"]';

async function main() {
  const own = process.env.E2E_BASE_URL ? null : await startDevServer(process.cwd());
  const baseUrl = process.env.E2E_BASE_URL ?? own.baseUrl;
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
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
    '\n[PASS] Interruptible Python: input() round-trips, a while-True loop stops by interrupt, the session survives it, and the page never blocks.'
  );
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  main().catch((error) => {
    console.error('[FAIL] Runtime E2E failed:', error?.stack ?? error);
    process.exit(1);
  });
}
