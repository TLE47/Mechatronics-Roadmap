#!/usr/bin/env node
/**
 * Real-Browser End-to-End Test Suite for the MechaLab Workbench
 * (`scripts/e2e_browser_workbench.mjs`)
 *
 * Launches a real Vite HTTP server and drives a real Headless Chromium browser
 * via Playwright (`playwright-core`) with Web Worker Pyodide WASM execution to verify:
 * 1. Starter code fails verification (`0 / N Verified`, N read from the page's own tally).
 * 2. Print-only spoofing (`print(expectedOutput)`) passes presentation check but FAILS
 *    Instructor Behavioral Tests and never awards verification — on a beginner lesson and, in 2b,
 *    on a graded exercise whose self-check is appended to the editable program.
 * 3. Invalid Python syntax produces an understandable SyntaxError with line number.
 * 4. Accidental infinite loops (`while True:`) are stopped/recoverable via Worker step/time
 *    limits, Stop button, and Reset Runtime without losing editor code.
 * 5. Correct full solution passes both Instructor Behavioral Tests and Output Presentation
 *    check, awarding `1 / N Verified`.
 * 6. CDN failure (even when running the full solution) never awards verification.
 * 7. Progress survives a full browser reload (`page.reload()`).
 * 8. Portfolio export (`buildPortfolioMarkdown` modal preview) contains the exact, strictly
 *    separated completion categories (`Executed & Passed in Pyodide WASM` vs `Self-Marked Complete`).
 *
 * Every scenario runs on one page and one browser context, so the runtime each scenario needs is
 * shared rather than rebuilt: the scenarios that must start from zero progress clear the workbench's
 * `mechalab*` keys and reload instead of opening a second context, and the runtime is re-booted only
 * where a scenario is *about* the runtime dying (the trace-step limit, the Stop button, a load
 * failure, or the reload that proves persistence). Measured here: a boot is ~1.3-1.9 s and a warm run
 * is ~0.05 s, which is why the number of boots, not the number of runs, is what the suite pays for.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

/**
 * The dev server every workbench suite shares. `scripts/test_workbench.mjs` starts it once and hands
 * the URL to this suite through `E2E_BASE_URL`, so the smoke test, this suite and the built-bundle
 * suite do not each boot their own Vite.
 */
export async function startDevServer(repoRoot = process.cwd()) {
  const viteServer = await createServer({
    root: path.join(repoRoot, 'app'),
    server: { port: 0, host: '127.0.0.1' },
    logLevel: 'error',
  });
  await viteServer.listen();
  const address = viteServer.httpServer?.address();
  const port = typeof address === 'object' && address ? address.port : 4173;
  return { viteServer, baseUrl: `http://127.0.0.1:${port}/Mechatronics-Roadmap/` };
}

export function resolveChromiumExecutable() {
  if (
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH &&
    fs.existsSync(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH)
  ) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }
  try {
    const defaultPath = chromium.executablePath();
    if (defaultPath && fs.existsSync(defaultPath)) {
      return defaultPath;
    }
  } catch {
    // fallback to search paths below
  }

  const candidatePaths = [
    '/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell',
    '/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) return p;
  }

  // Search /ms-playwright if present
  if (fs.existsSync('/ms-playwright')) {
    const entries = fs.readdirSync('/ms-playwright');
    for (const entry of entries) {
      const sub1 = path.join(
        '/ms-playwright',
        entry,
        'chrome-headless-shell-linux64',
        'chrome-headless-shell'
      );
      if (fs.existsSync(sub1)) return sub1;
      const sub2 = path.join('/ms-playwright', entry, 'chrome-linux64', 'chrome');
      if (fs.existsSync(sub2)) return sub2;
    }
  }
  return undefined;
}

/** The N in the page's own `k / N Verified` tally; the registry grows with every graded exercise. */
async function readTally(page) {
  const text = (await page.getByTestId('runner-verified-count').textContent())?.trim() ?? '';
  const match = text.match(/^(\d+)\s*\/\s*(\d+)\s+Verified$/);
  assert.ok(match, `The verified tally must read "N / M Verified", got: ${text}`);
  return Number(match[2]);
}

/**
 * `baseUrl` is the already-running dev server (from `startDevServer`, via `E2E_BASE_URL`, or passed
 * by the combined runner). Without one this suite starts and closes its own, so `npm run test:e2e`
 * keeps working on its own.
 */
export async function runRealBrowserE2ETests({ baseUrl: externalBaseUrl } = {}) {
  const repoRoot = process.cwd();
  const own = externalBaseUrl ? null : await startDevServer(repoRoot);
  const baseUrl = externalBaseUrl
    ? externalBaseUrl.replace(/\/*$/, '/')
    : own.baseUrl;

  const executablePath = resolveChromiumExecutable();
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    headless: true,
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(baseUrl, { waitUntil: 'networkidle' });

    // 0. A first-time visitor lands on Step 1 with a guide that explains the editor, runs the
    //    starter for them, and turns the failure into a "what to fix" line. This is the whole
    //    first lesson without the README: the assertions are what a newcomer can actually see.
    await page.getByTestId('first-lesson-guide').waitFor({ timeout: 15000 });
    assert(
      (await page.getByTestId('first-lesson-guide').innerText()).includes('Lesson P.1'),
      'the first-lesson guide must name Lesson P.1'
    );
    await page.getByTestId('btn-guide-run').click();
    await page.getByTestId('status-behavior-failed').waitFor({ timeout: 45000 });
    const fixLine = await page.getByTestId('guide-what-to-fix').innerText();
    assert(
      fixLine.includes('Expected') && fixLine.includes('got'),
      `the guide must say what to fix using the check's own expected/got line; got: ${fixLine}`
    );
    await page.getByTestId('btn-guide-hint').click();
    assert.equal(
      (await page.getByTestId('btn-reveal-hint').innerText()).trim(),
      'Reveal Hint 2',
      'the guide\'s hint button must open Hint 1, leaving Hint 2 to reveal'
    );
    // A traceback's useful line is the last one, not its first: the guide must still say what to fix.
    await page.getByTestId('textarea-python-code').fill('def broken(\n    return 1\n');
    await page.getByTestId('btn-guide-run').click();
    await page.getByTestId('guide-what-to-fix').waitFor({ timeout: 45000 });
    assert(
      (await page.getByTestId('guide-what-to-fix').innerText()).includes('SyntaxError'),
      'the guide must surface the SyntaxError line for a broken starter edit'
    );
    await page.getByTestId('btn-reset-starter').click();

    // Open Tab 2: Run Python Lessons (32 Lessons)
    await page.getByTestId('tab-btn-tab-pyodide').click();
    await page.getByTestId('lesson-item-P.6').click();

    // The registry grows with every graded exercise, so the total is read from the page rather than
    // written here: a hard-coded 49 is how this suite would go red whenever a package was added.
    const TOTAL = await readTally(page);
    const verified = (n) => `${n} / ${TOTAL} Verified`;
    const marked = (n) => `${n} / ${TOTAL} Marked`;

    assert.equal(
      (await page.getByTestId('runner-verified-count').textContent())?.trim(),
      verified(0),
      `Initial verified count must be ${verified(0)}`
    );

    // 1. Starter code fails verification (caught by Instructor Behavioral Tests / assertions)
    await page.getByTestId('btn-run-verify').click();
    await page.getByTestId('status-behavior-failed').waitFor({ timeout: 30000 });
    assert(
      (await page.getByTestId('badge-behavior-check').textContent())?.includes('FAILED'),
      'Starter code must fail Instructor Behavioral Tests'
    );
    assert.equal(
      (await page.getByTestId('runner-verified-count').textContent())?.trim(),
      verified(0),
      `Starter code must fail and keep verified count at ${verified(0)}`
    );

    // 1b. The learning log is written by the UI itself, and a failed run keeps the first failing line
    //     — the record a friction report is built from. Nothing leaves the browser to prove this.
    const logged = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('mechalab.learningLog.v1') || '[]')
    );
    assert.ok(
      logged.some((e) => e.kind === 'lesson_open' && e.lesson === 'P.6'),
      'the learning log must record the lesson open'
    );
    const failedRun = logged.find((e) => e.kind === 'run' && e.lesson === 'P.6');
    assert.ok(failedRun, 'the learning log must record the run');
    assert.equal(failedRun.outcome, 'behavior_failed', 'a failed run must record its outcome');
    assert.ok(failedRun.fail && failedRun.fail.length > 0, 'a failed run must record its first failing line');
    assert.ok(typeof failedRun.ms === 'number', 'a run must record how long it took');

    // 2. Print-only spoofing passes presentation check but FAILS Instructor Behavioral Tests
    const expectedText = await page.getByTestId('pre-expected-stdout').textContent();
    const spoofedPython = `print(${JSON.stringify((expectedText || '').trim())})\n`;
    await page.getByTestId('textarea-python-code').fill(spoofedPython);
    await page.getByTestId('btn-run-verify').click();
    await page.waitForFunction(
      () => {
        const outBadge = document.querySelector('[data-testid="badge-output-check"]');
        const behBadge = document.querySelector('[data-testid="badge-behavior-check"]');
        return (
          outBadge?.textContent?.includes('MATCHED') &&
          behBadge?.textContent?.includes('FAILED')
        );
      },
      { timeout: 15000 }
    );
    await page.getByTestId('status-behavior-failed').waitFor({ timeout: 5000 });

    const behaviorBadgeSpoof = await page.getByTestId('badge-behavior-check').textContent();
    const outputBadgeSpoof = await page.getByTestId('badge-output-check').textContent();
    assert(
      behaviorBadgeSpoof?.includes('FAILED'),
      `Print-only spoof must fail behavior check, got: ${behaviorBadgeSpoof}`
    );
    assert(
      outputBadgeSpoof?.includes('MATCHED'),
      `Print-only spoof should match presentation check while failing behavior check, got: ${outputBadgeSpoof}`
    );
    assert.equal(
      (await page.getByTestId('runner-verified-count').textContent())?.trim(),
      verified(0),
      'Print-only spoof must NEVER award lesson verification'
    );

    // 2b. The same spoof on graded exercise entries, where the grader is the package's own
    // `selfcheck.py` executed from the registry. The appended copy is visible and learner-editable,
    // so printing its PASS line must satisfy the presentation check and fail the behavioural one.
    // One Tier 2 entry and one Tier 3 entry: a beginner meets the Tier 2 grader first, and the two
    // tiers' packages are generated the same way, so a Tier 3-only case would not notice a Tier 2
    // regression in how the self-check is attached.
    for (const exerciseLesson of ['EX.02-mechanics.T2.02a', 'EX.05-control.T3.05a']) {
      await page.getByTestId(`lesson-item-${exerciseLesson}`).scrollIntoViewIfNeeded();
      await page.getByTestId(`lesson-item-${exerciseLesson}`).click();
      await page.waitForFunction(
        () =>
          (document.querySelector('[data-testid="textarea-python-code"]')?.value ?? '').includes(
            'NotImplementedError'
          ),
        undefined,
        { timeout: 15000 }
      );
      const exerciseExpectedText = await page.getByTestId('pre-expected-stdout').textContent();
      assert.match(
        exerciseExpectedText ?? '',
        /SELF-CHECK PASS/,
        `${exerciseLesson} must publish its self-check PASS line as the expected output`
      );
      await page
        .getByTestId('textarea-python-code')
        .fill(`print(${JSON.stringify((exerciseExpectedText || '').trim())})\n`);
      await page.getByTestId('btn-run-verify').click();
      await page.waitForFunction(
        () => {
          const outBadge = document.querySelector('[data-testid="badge-output-check"]');
          const behBadge = document.querySelector('[data-testid="badge-behavior-check"]');
          return (
            outBadge?.textContent?.includes('MATCHED') &&
            behBadge?.textContent?.includes('FAILED')
          );
        },
        { timeout: 30000 }
      );
      await page.getByTestId('status-behavior-failed').waitFor({ timeout: 5000 });
      assert.equal(
        (await page.getByTestId('runner-verified-count').textContent())?.trim(),
        verified(0),
        `Printing ${exerciseLesson}'s PASS line must never verify a graded exercise`
      );
    }

    // Back to P.6: the steps below load its solution and expect it in the portfolio export.
    await page.getByTestId('lesson-item-P.6').click();

    // 3. Invalid Python syntax produces an understandable error
    await page.getByTestId('textarea-python-code').fill('def broken_syntax(\n    x = \n');
    await page.getByTestId('btn-run-verify').click();
    await page.getByTestId('status-execution-error').waitFor({ timeout: 15000 });
    const syntaxErrOut = await page.getByTestId('pre-actual-stdout').textContent();
    assert(
      syntaxErrOut?.includes('SyntaxError'),
      `Invalid Python must produce an understandable SyntaxError, got: ${syntaxErrOut}`
    );
    assert.equal(
      (await page.getByTestId('runner-verified-count').textContent())?.trim(),
      verified(0),
      'Invalid Python must never award verification'
    );

    // 4. Accidental infinite loop (while True:) is recoverable without losing editor work
    await page.evaluate(() => {
      window.__mechalabMaxTraceSteps = 5000;
    });
    const loopCode = '# important learner work to preserve\ni = 0\nwhile True:\n    i += 1\n';
    await page.getByTestId('textarea-python-code').fill(loopCode);
    await page.getByTestId('btn-run-verify').click();
    await page.getByTestId('status-execution-stopped').waitFor({ timeout: 15000 });

    const loopErrOut = await page.getByTestId('pre-actual-stdout').textContent();
    assert(
      loopErrOut?.includes('ExecutionTimeoutError') && loopErrOut?.includes('infinite loop'),
      `Infinite loop must report ExecutionTimeoutError recovery hint, got: ${loopErrOut}`
    );
    const preservedEditorValue = await page.getByTestId('textarea-python-code').inputValue();
    assert.equal(
      preservedEditorValue,
      loopCode,
      'Infinite loop recovery must preserve the learner code in the editor'
    );

    // Also verify clicking Stop during a long loop terminates the Worker cleanly
    await page.evaluate(() => {
      window.__mechalabMaxTraceSteps = 50000000;
      window.__mechalabExecutionTimeoutMs = 15000;
    });
    await page.getByTestId('btn-run-verify').click();
    await page.getByTestId('btn-stop-execution').waitFor({ timeout: 5000 });
    await page.getByTestId('btn-stop-execution').click();
    await page.getByTestId('status-execution-stopped').waitFor({ timeout: 5000 });
    const stoppedOut = await page.getByTestId('pre-actual-stdout').textContent();
    assert(
      stoppedOut?.includes('Execution stopped by user'),
      `Stop button must terminate worker and report cancellation, got: ${stoppedOut}`
    );
    assert.equal(
      await page.getByTestId('textarea-python-code').inputValue(),
      loopCode,
      'Stopping execution must preserve learner code'
    );
    await page.evaluate(() => {
      window.__mechalabMaxTraceSteps = undefined;
      window.__mechalabExecutionTimeoutMs = undefined;
    });

    // 5. Correct solution passes both Behavioral Tests and Output Presentation check. Both clicks
    // happen in one task, so this also pins `Run` reading the editor's live text: a handler that runs
    // the program it was rendered with would run the starter here and fail the assertions below.
    await page.evaluate(() => {
      document.querySelector('[data-testid="btn-load-solution"]').click();
      document.querySelector('[data-testid="btn-run-verify"]').click();
    });
    await page.getByTestId('status-assert-passed').waitFor({ timeout: 30000 });

    assert(
      (await page.getByTestId('badge-behavior-check').textContent())?.includes('PASSED'),
      'Correct solution must pass Instructor Behavioral Tests'
    );
    assert(
      (await page.getByTestId('badge-output-check').textContent())?.includes('MATCHED'),
      'Correct solution must pass Output Presentation check'
    );
    assert.equal(
      (await page.getByTestId('runner-verified-count').textContent())?.trim(),
      verified(1),
      `Passing solution must increment verified count to ${verified(1)}`
    );

    // 6. CDN failure never awards verification (even with full solution loaded)
    await page.getByTestId('lesson-item-P.7').click();
    await page.getByTestId('btn-load-solution').click();
    await page.evaluate(() => {
      // A refused connection, not an unresolvable host: the loader used to sit on DNS for ~10 s
      // before reporting the same 'could not be loaded' failure this asserts.
      window.__mechalabPyodideCdnUrl = 'http://127.0.0.1:1/pyodide/';
    });
    await page.getByTestId('btn-reset-runtime').click();
    await page.getByTestId('btn-run-verify').click();
    await page.getByTestId('status-execution-error').waitFor({ timeout: 15000 });

    const cdnErrText = await page.getByTestId('pre-actual-stdout').textContent();
    assert(
      cdnErrText?.includes('Pyodide WebAssembly runtime could not be loaded'),
      `CDN failure must report WASM load error, got: ${cdnErrText}`
    );
    assert.equal(
      (await page.getByTestId('runner-verified-count').textContent())?.trim(),
      verified(1),
      'CDN failure must NEVER award verification even when the full solution is in the editor'
    );

    // Restore CDN URL and self-mark Lesson P.7 complete (manual checklist)
    await page.evaluate(() => {
      window.__mechalabPyodideCdnUrl = undefined;
    });
    await page.getByTestId('btn-reset-runtime').click();
    await page.getByTestId('btn-toggle-lesson-complete').click();
    assert.equal(
      (await page.getByTestId('runner-self-marked-count').textContent())?.trim(),
      marked(1),
      `Self-marking P.7 must update self-marked count to ${marked(1)}`
    );

    // 7. Progress survives full browser reload
    await page.reload({ waitUntil: 'networkidle' });
    const bodyAfterReload = await page.locator('body').textContent();
    assert(
      bodyAfterReload?.includes(`Executed & Passed: 1/${TOTAL}`),
      `Executed & Passed count (1/${TOTAL}) must survive full browser reload`
    );
    assert(
      bodyAfterReload?.includes(`Self-Marked: 1/${TOTAL}`),
      `Self-Marked count (1/${TOTAL}) must survive full browser reload`
    );

    // 8. Portfolio export contains the correct completion categories
    await page.getByTestId('btn-export-portfolio').click();
    const portfolioPreview = await page.getByTestId('portfolio-markdown-preview').textContent();
    assert(
      portfolioPreview?.includes(
        `**Execution-Verified In-Browser Python Lessons (Executed & Passed in Pyodide WASM):** 1 / ${TOTAL}`
      ),
      `Portfolio export must report 1 / ${TOTAL} Execution-Verified lessons`
    );
    assert(
      portfolioPreview?.includes(
        `**Self-Marked Completed Python Lessons (Manual Checklist):** 1 / ${TOTAL}`
      ),
      `Portfolio export must report 1 / ${TOTAL} Self-Marked lessons`
    );
    assert(
      portfolioPreview?.includes('Lesson P.6') &&
        portfolioPreview?.includes('*(Executed & Passed in Pyodide WASM)*'),
      'Portfolio export must list Lesson P.6 under Execution-Verified Python Exercises'
    );
    assert(
      portfolioPreview?.includes('Lesson P.7') &&
        portfolioPreview?.includes('*(Self-Marked Complete)*'),
      'Portfolio export must list Lesson P.7 under Self-Marked Completed Python Lessons'
    );

    // 9. Verify School-Math Diagnostic & Tier 1 -> Tier 2 Exit Readiness Review interactive sub-tabs
    await page.getByLabel('Close export modal').click();
    await page.getByTestId('tab-btn-tab-placement').click();
    await page.getByTestId('tab-math-diagnostic').click();
    await page.getByTestId('panel-school-math-diagnostic').waitFor({ timeout: 5000 });
    await page.getByTestId('tab-tier1-exit-review').click();
    await page.getByTestId('panel-tier1-exit-review').waitFor({ timeout: 5000 });

    // 10. Formatting is graded separately from behaviour: a behaviourally correct run must not be blocked
    // by harmless whitespace, while a lesson whose Expected Output is a padded table still grades its
    // columns. What these scenarios need is the progress counters at zero, which used to mean a second
    // browser context - a second page, a second Pyodide download and a second runtime. Same page now:
    // clear the workbench's progress keys and reload, so the app re-mounts with no progress and the
    // runtime re-boots from the bundle already on disk.
    // Every key the workbench writes starts with `mechalab` (`mechalab_pyodide_verified_v1`,
    // `mechalab_completed_v1`, `mechalab.learningLog.v1`, ...), so this clears progress without
    // naming each one.
    await page.evaluate(() => {
      for (const key of Object.keys(window.localStorage)) {
        if (key.startsWith('mechalab')) window.localStorage.removeItem(key);
      }
    });
    await page.reload({ waitUntil: 'networkidle' });
    const formattingPage = page;
    await formattingPage.getByTestId('tab-btn-tab-pyodide').click();
    const formatTotal = await readTally(formattingPage);
    const formatVerified = (n) => `${n} / ${formatTotal} Verified`;

    // 10a. Lesson 03.1 declares exact formatting and still fails when its table columns lose their padding.
    await formattingPage.getByTestId('lesson-item-03.1').click();
    const exactModeNote = await formattingPage.getByTestId('note-output-match-mode').textContent();
    assert(
      exactModeNote?.includes('grades exact formatting'),
      `Lesson 03.1 must say it grades exact formatting, got: ${exactModeNote}`
    );
    await formattingPage.getByTestId('btn-load-solution').click();
    const tableSolution = await formattingPage.getByTestId('textarea-python-code').inputValue();
    const unpadded = tableSolution.replace(/:(?:[<>^=])?\d+(\.\d+)?([fdegsx%])/g, ':$1$2');
    assert.notEqual(unpadded, tableSolution, 'the 03.1 solution must pad its table with field widths');
    await formattingPage.getByTestId('textarea-python-code').fill(unpadded);
    await formattingPage.getByTestId('btn-run-verify').click();
    await formattingPage.getByTestId('status-output-mismatch').waitFor({ timeout: 30000 });
    assert(
      (await formattingPage.getByTestId('badge-behavior-check').textContent())?.includes('PASSED'),
      'Dropping field widths must not change the behavioural verdict'
    );
    assert(
      (await formattingPage.getByTestId('badge-output-check').textContent())?.includes('DIFFERS'),
      'Lesson 03.1 must still fail presentation when its table columns are unpadded'
    );
    assert.equal(
      (await formattingPage.getByTestId('runner-verified-count').textContent())?.trim(),
      formatVerified(0),
      'A formatting-only difference must never award lesson verification'
    );
    await formattingPage.getByTestId('btn-load-solution').click();
    await formattingPage.getByTestId('btn-run-verify').click();
    await formattingPage.getByTestId('status-assert-passed').waitFor({ timeout: 30000 });
    assert.equal(
      (await formattingPage.getByTestId('runner-verified-count').textContent())?.trim(),
      formatVerified(1),
      'The unmodified 03.1 solution must still verify'
    );

    // 10b. Lesson P.6 keeps the numbers but changes every harmless whitespace, and must still verify.
    await formattingPage.getByTestId('lesson-item-P.6').click();
    const plainModeNote = await formattingPage.getByTestId('note-output-match-mode').textContent();
    assert(
      plainModeNote?.includes('Formatting is ignored'),
      `Lesson P.6 must say that whitespace is ignored, got: ${plainModeNote}`
    );
    await formattingPage.getByTestId('btn-load-solution').click();
    const plainSolution = await formattingPage.getByTestId('textarea-python-code').inputValue();
    const rewrapped = [
      'import contextlib, io',
      '_buffer = io.StringIO()',
      'with contextlib.redirect_stdout(_buffer):',
      ...plainSolution.split('\n').map((line) => (line ? `    ${line}` : line)),
      "print('')",
      'for _line in _buffer.getvalue().splitlines():',
      '    print("   " + _line.replace(" | ", "   |   "))',
      "print('')",
    ].join('\n');
    await formattingPage.getByTestId('textarea-python-code').fill(rewrapped);
    await formattingPage.getByTestId('btn-run-verify').click();
    await formattingPage.getByTestId('status-assert-passed').waitFor({ timeout: 30000 });
    assert(
      (await formattingPage.getByTestId('badge-behavior-check').textContent())?.includes('PASSED'),
      'A re-indented, re-spaced solution must still pass the behavioural tests'
    );
    assert(
      (await formattingPage.getByTestId('badge-output-check').textContent())?.includes('MATCHED'),
      'A whitespace-only difference must not fail a lesson that does not grade formatting'
    );
    await formattingPage.getByTestId('note-formatting-normalized').waitFor({ timeout: 5000 });
    assert.equal(
      (await formattingPage.getByTestId('runner-verified-count').textContent())?.trim(),
      formatVerified(2),
      'A behaviourally correct run with different whitespace must award lesson verification'
    );
    console.log(
      '  ok formatting is graded separately from behaviour: 03.1 keeps its padded table, P.6 accepts re-spaced output'
    );

    // 11. The shared plant is importable inside Pyodide. An exercise may `import mechalab_plant`
    // and get the arm the Tier 1 capstone builds - the same numbers CI tests on the host, which is
    // the whole point of one plant every exercise shares.
    const plantProbe = `import mechalab_plant as plant

print(plant.plant_summary())
print("gravity holding torque at q1=q2=0: %.4f, %.4f N*m" % plant.gravity_torque(0.0, 0.0))
run = plant.simulate_arm(steps=1000)
print("tip err max=%.2f mm rms=%.2f mm" % (run["max_dyn_err_mm"], run["rms_dyn_err_mm"]))
print("uart dropped @115.2k=%d, @500k=%d" % (plant.simulate_uart_tx(1000, 20, 0.001, 115200), plant.simulate_uart_tx(1000, 20, 0.001, 500000)))
`;
    await formattingPage.getByTestId('textarea-python-code').fill(plantProbe);
    await formattingPage.getByTestId('btn-run-verify').click();
    await formattingPage.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="pre-actual-stdout"]')
          ?.textContent?.includes('encoder=4096 cpr'),
      { timeout: 30000 }
    );
    const plantStdout = (await formattingPage.getByTestId('pre-actual-stdout').textContent()) || '';
    assert(
      plantStdout.includes('2-DOF planar arm: L1=0.10 m, L2=0.10 m'),
      `the shared plant must be importable in the browser, got: ${plantStdout}`
    );
    assert(
      plantStdout.includes('I=(0.0080, 0.0030) kg*m^2') &&
        plantStdout.includes('tau_limit=2.5 N*m'),
      `the in-browser plant must carry the capstone's joint values, got: ${plantStdout}`
    );
    assert(
      plantStdout.includes('gravity holding torque at q1=q2=0: 0.3188, 0.0736 N*m'),
      `the in-browser plant must reproduce the capstone's gravity torques, got: ${plantStdout}`
    );
    assert(
      plantStdout.includes('tip err max=2.40 mm rms=0.91 mm'),
      `the in-browser plant must reproduce the capstone's tracking error, got: ${plantStdout}`
    );
    assert(
      plantStdout.includes('uart dropped @115.2k=412, @500k=0'),
      `the in-browser plant must reproduce the capstone's UART budget, got: ${plantStdout}`
    );
    assert.equal(
      (await formattingPage.getByTestId('runner-verified-count').textContent())?.trim(),
      formatVerified(2),
      'Using the shared plant must not award lesson verification on its own'
    );
    console.log(
      '  ok the shared plant imports inside Pyodide and reproduces the capstone numbers in the browser'
    );

    console.log(
      '[PASS] Real-browser Chromium E2E tests passed (Starter fail, Print-spoof rejection, SyntaxError, Infinite-loop Stop/Timeout recovery, Solution pass, CDN failure protection, Reload persistence, Portfolio export categories, Diagnostic/Exit Review tabs, whitespace-vs-formatting grading & shared-plant import).'
    );
  } finally {
    await browser.close();
    if (own) await own.viteServer.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runRealBrowserE2ETests({ baseUrl: process.env.E2E_BASE_URL }).catch((err) => {
    console.error('[FAIL] Real-browser E2E test failed:', err);
    process.exit(1);
  });
}
