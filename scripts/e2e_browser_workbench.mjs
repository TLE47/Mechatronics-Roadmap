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
 * 7. Progress survives a full browser reload (`page.reload()`), a plain visit with no query string
 *    reopens the lesson the learner was last on, and the roadmap offers it back as a resume card -
 *    then hands that offer forward to the next unverified lesson once the first is passed, and
 *    names the unfinished edit the editor is holding (which reopening from a plain visit restores)
 *    along with how many of the starter's marked steps it has written, so "continue" always means
 *    forward progress and never a fresh starter.
 * 8. Portfolio export (`buildPortfolioMarkdown` modal preview) contains the exact, strictly
 *    separated completion categories (`Executed & Passed in Pyodide WASM` vs `Self-Marked Complete`).
 * 9. Lesson 08.1 passes only when its four-fault bench grades every repair at target: a repair left
 *    10% short keeps its real 1.20 mm on the card and leaves the lesson unverified.
 * 10. The Tier 3 capstone (`EX.08-capstones.T3.07a`) passes only when its budget bench does: a
 *    zero-order hold charged double a tick keeps its real 42.7 deg margin and leaves it unverified.
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
import { ISOLATION_HEADERS } from './isolation-headers.mjs';
import { getEditorCode, setEditorCode, waitForEditor } from './editor-code.mjs';
import { createServer } from 'vite';

/** The one copy of the Start here words, the same file the README block is generated from. */
const START_HERE = JSON.parse(
  fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app', 'src', 'data', 'startHere.json'),
    'utf8'
  )
);

/**
 * The dev server every workbench suite shares. `scripts/test_workbench.mjs` starts it once and hands
 * the URL to this suite through `E2E_BASE_URL`, so the smoke test, this suite and the built-bundle
 * suite do not each boot their own Vite.
 */
export async function startDevServer(repoRoot = process.cwd()) {
  const viteServer = await createServer({
    root: path.join(repoRoot, 'app'),
    // Cross-origin isolation is what gives the page a SharedArrayBuffer, and without it the
    // interrupt-based Stop cannot exist. The production host is GitHub Pages, which cannot send
    // headers; `app/public/sw.js` covers that, and every local server sends them here.
    server: { port: 0, host: '127.0.0.1', headers: ISOLATION_HEADERS },
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

    // 0. The landing screen opens with the README's Start here block, and its Lesson 1 link is the
    //    same page the README links, so the two doors agree on the first thing to do.
    const startHere = page.getByTestId('start-here');
    await startHere.waitFor({ timeout: 15000 });
    const startHereText = await startHere.innerText();
    assert(
      startHereText.includes(START_HERE.heading),
      "the landing screen must open with the README's Start here heading"
    );
    // A newcomer meets the word "MechaLab" in the wordmark and nowhere explained; the block has to
    // say what it is and when a lesson expects them to be in it, in the words the README uses.
    assert(
      startHereText.includes(START_HERE.definition) && startHereText.includes(START_HERE.note),
      `the landing block must define MechaLab and say when to use it; got: ${startHereText}`
    );
    assert.equal(
      await page.getByTestId('start-here-lesson-link').getAttribute('href'),
      'https://github.com/TLE47/Mechatronics-Roadmap/blob/main/track-p/P.1-variables-and-data-types.md',
      'the Start here link must open the same Lesson 1 page the README links'
    );
    // Two doors, two verbs: the reading link leaves for GitHub, and the button stays to run the
    // same lesson here. Clicking it must not navigate away from the workbench.
    const runHere = page.getByTestId('btn-start-here-run');
    assert(
      (await runHere.innerText()).includes('Run Lesson 1 here'),
      'the Start here button must say that it runs the lesson here, not that it reads it'
    );
    await runHere.click();
    assert.equal(
      new URL(page.url()).pathname,
      new URL(baseUrl).pathname,
      'the run-here button must not navigate to GitHub'
    );
    await page.getByTestId('lesson-item-P.1').waitFor({ timeout: 5000 });
    assert.equal(
      await page.getByTestId('link-lesson-page').getAttribute('href'),
      'https://github.com/TLE47/Mechatronics-Roadmap/blob/main/track-p/P.1-variables-and-data-types.md',
      "the runner's reading link must point at the selected lesson's own page"
    );

    // 0c. A page's callout links `?lesson=<id>`, so that address has to open the workbench on that
    //     entry. Without this the callout's link is only the workbench's front door again, and the
    //     reader is back to searching for the id the page just handed them.
    const deepPage = await context.newPage();
    await deepPage.goto(`${baseUrl}?lesson=EX.05-control.T2.05a`, { waitUntil: 'networkidle' });
    await waitForEditor(deepPage, undefined, 15000);
    assert(
      (await deepPage.getByTestId('link-lesson-page').getAttribute('href'))?.endsWith(
        '/exercises/05-control.T2.05a/solution.py'
      ),
      `?lesson=EX.05-control.T2.05a must open that exercise's own editor entry, not the default one`
    );
    assert.equal(
      new URL(deepPage.url()).search,
      '?lesson=EX.05-control.T2.05a',
      'the deep link must survive the load, so the address still names the lesson on screen'
    );
    // Picking another entry writes the address too: a URL copied after browsing reopens what is open.
    await deepPage.getByTestId('lesson-item-P.7').click();
    assert.equal(
      new URL(deepPage.url()).search,
      '?lesson=P.7',
      'selecting a lesson must put it in the address bar, or a copied URL reopens the old one'
    );
    // An id the registry does not list never opens an empty editor. It falls back to the lesson the
    // learner was last on - here P.7, chosen just above - and only to Lesson 1 when nothing is
    // remembered: a broken link is not evidence that they wanted to start over (`src/lastLesson.ts`).
    await deepPage.goto(`${baseUrl}?lesson=NOT.A.LESSON`, { waitUntil: 'networkidle' });
    await waitForEditor(deepPage, undefined, 15000);
    const unknownIdMeta = (await deepPage.getByTestId('lesson-meta').textContent()) ?? '';
    assert(
      unknownIdMeta.includes('Lesson P.7'),
      `an unknown ?lesson= id must resume the last lesson (P.7), not blank the editor; got: ${unknownIdMeta}`
    );
    await deepPage.close();
    console.log('  ok ?lesson= opens the named entry, follows the editor, and ignores unknown ids');

    // 0a. A first-time visitor lands on Step 1 with a guide that explains the editor, runs the
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
    // 0a-i. The failing check names its own hint. The card under the badges says which check is red
    //       and which rung answers it, and opening that rung from the card opens *one* rung: the
    //       formula block below it is the near-solution, so it waits for a run after the nudge.
    const behaviourCard = page.getByTestId('check-failure-behaviour');
    await behaviourCard.waitFor({ timeout: 5000 });
    const behaviourCardText = await behaviourCard.innerText();
    assert(
      behaviourCardText.includes('Behavioural check failed'),
      `the card must name the check that failed; got: ${behaviourCardText}`
    );
    assert(
      behaviourCardText.includes('Hint 1'),
      `the failing check must name the rung that answers it; got: ${behaviourCardText}`
    );
    await page.getByTestId('btn-check-hint-behaviour').click();
    assert(
      await page.getByTestId('hint-for-check').isVisible(),
      'the rung a check points at must be marked where the hint is read'
    );
    const nudgeHintButton = page.getByTestId('btn-reveal-hint');
    assert(
      await nudgeHintButton.isDisabled(),
      'opening the nudge from a check must not open the formula block with it'
    );
    assert.equal(
      (await nudgeHintButton.innerText()).trim(),
      'Run again to unlock Hint 2',
      'Hint 2 must be earned by an attempt after the nudge, not by the run already on screen'
    );
    assert.equal(
      await page.getByText('Hint 2:', { exact: false }).count(),
      0,
      'exactly one rung may be on screen after a check opens its hint'
    );
    // The guide's own hint control still works, and now reports the open rung instead of offering it.
    await page.getByTestId('btn-guide-hint').click();
    assert.equal(
      (await page.getByTestId('btn-guide-hint').innerText()).trim(),
      'Hint 1 is open below',
      'the guide must not present a rung as unopened when the check card already opened it'
    );
    // A traceback's useful line is the last one, not its first: the guide must still say what to fix.
    await setEditorCode(page, 'def broken(\n    return 1\n');
    await page.getByTestId('btn-guide-run').click();
    await page.getByTestId('guide-what-to-fix').waitFor({ timeout: 45000 });
    assert(
      (await page.getByTestId('guide-what-to-fix').innerText()).includes('SyntaxError'),
      'the guide must surface the SyntaxError line for a broken starter edit'
    );
    await page.getByTestId('btn-reset-starter').click();

    // 0b. Every lesson gets its own brief, not just P.1: P.2 must name its own first hole, and
    //     hiding P.2 must not hide P.3's brief.
    await page.getByTestId('lesson-item-P.2').click();
    await page.getByTestId('first-lesson-guide').waitFor({ timeout: 5000 });
    const p2Guide = await page.getByTestId('first-lesson-guide').innerText();
    assert(
      p2Guide.includes('Lesson P.2') && p2Guide.includes('new_pos_m'),
      `the P.2 guide must name P.2 and its first starter hole; got: ${p2Guide}`
    );
    // 0b. Hint 1 is open without a run. Hint 2 is nearly the full fix, so it stays locked until
    //     the learner has actually run the lesson once - reading it first is not an attempt.
    await page.getByTestId('btn-reveal-hint').click();
    const nextHintButton = page.getByTestId('btn-reveal-hint');
    assert(
      await nextHintButton.isDisabled(),
      'Hint 2 must stay locked until the learner has run the lesson'
    );
    assert(
      (await nextHintButton.innerText()).includes('Run to unlock Hint 2'),
      'the locked hint control must say that a run unlocks it'
    );
    await page.getByTestId('btn-guide-run').click();
    await page.getByTestId('status-behavior-failed').waitFor({ timeout: 45000 });
    await page.waitForFunction(
      () => {
        const button = document.querySelector('[data-testid="btn-reveal-hint"]');
        return button && !button.disabled;
      },
      null,
      { timeout: 5000 }
    );
    assert.equal(
      (await nextHintButton.innerText()).trim(),
      'Reveal Hint 2',
      'a completed run must unlock Hint 2'
    );
    await nextHintButton.click();
    assert(
      await page.getByText('new_pos_m = start_pos_m', { exact: false }).first().isVisible(),
      'Hint 2 must open as the code-block hint it is documented as'
    );
    // Hint 2 is the ladder's last rung on every page: opening it must not offer, or open, a third.
    assert.equal(
      await page.getByTestId('btn-reveal-hint').count(),
      0,
      'opening the last rung must not leave a control that opens another - a hint never cascades'
    );
    await page.getByTestId('btn-guide-dismiss').click();
    await page.getByTestId('first-lesson-guide').waitFor({ state: 'detached', timeout: 5000 });
    await page.getByTestId('lesson-item-P.3').click();
    await page.getByTestId('first-lesson-guide').waitFor({ timeout: 5000 });
    assert(
      (await page.getByTestId('first-lesson-guide').innerText()).includes('Lesson P.3'),
      'hiding P.2\'s guide must not hide P.3\'s guide'
    );

    // Open the Run Python Lessons tab
    await page.getByTestId('tab-btn-tab-pyodide').click();

    // The five track-filter chips must stay inside the lesson list's own card. They once shared a
    // line with the count and ran ~200px past the card, where the editor's opaque background hid
    // them: nothing scrolled them into view, because the page itself never scrolls sideways.
    const filters = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="lesson-list-card"]');
      const group = document.querySelector('[data-testid="track-filters"]');
      if (!card || !group) return null;
      const cardBox = card.getBoundingClientRect();
      return {
        cardRight: Math.round(cardBox.right),
        overflow: group.scrollWidth - group.clientWidth,
        escaped: [...group.querySelectorAll('button')]
          .map((chip) => ({ label: chip.textContent?.trim() ?? '', box: chip.getBoundingClientRect() }))
          .filter(({ box }) => box.right > cardBox.right + 1 || box.bottom > cardBox.bottom + 1)
          .map(({ label, box }) => `${label} to ${Math.round(box.right)}px`),
      };
    });
    assert(filters, 'the lesson list must expose its card and its track filters');
    assert.equal(
      filters.escaped.length,
      0,
      `every track-filter chip must stay inside the lesson list card (card ends at ${filters.cardRight}px); ` +
        `escaped: ${filters.escaped.join(', ')}`
    );
    assert(
      filters.overflow <= 0,
      `the track-filter row must not overflow its column, but it does by ${filters.overflow}px`
    );

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
    await setEditorCode(page, spoofedPython);
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
        (key) =>
          (window.__mechalabEditors?.[key]?.get() ?? '').includes('NotImplementedError'),
        'editor-main',
        { timeout: 15000 }
      );
      const exerciseExpectedText = await page.getByTestId('pre-expected-stdout').textContent();
      assert.match(
        exerciseExpectedText ?? '',
        /SELF-CHECK PASS/,
        `${exerciseLesson} must publish its self-check PASS line as the expected output`
      );
      await setEditorCode(page, `print(${JSON.stringify((exerciseExpectedText || '').trim())})\n`);
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
    await setEditorCode(page, 'def broken_syntax(\n    x = \n');
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
    await setEditorCode(page, loopCode);
    await page.getByTestId('btn-run-verify').click();
    await page.getByTestId('status-execution-stopped').waitFor({ timeout: 15000 });

    const loopErrOut = await page.getByTestId('pre-actual-stdout').textContent();
    assert(
      loopErrOut?.includes('ExecutionTimeoutError') && loopErrOut?.includes('infinite loop'),
      `Infinite loop must report ExecutionTimeoutError recovery hint, got: ${loopErrOut}`
    );
    const preservedEditorValue = await getEditorCode(page);
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
      await getEditorCode(page),
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

    // 7b. A visit with no query string reopens the lesson the learner was last on. The address bar
    //     only carries a lesson for the tab it was typed in, so a bookmark of the plain workbench URL
    //     used to open P.1 on every return - on the tenth verification as much as the first.
    await page.getByTestId('lesson-item-P.4').scrollIntoViewIfNeeded();
    await page.getByTestId('lesson-item-P.4').click();
    assert.equal(
      new URL(page.url()).search,
      '?lesson=P.4',
      'choosing a lesson must still write the address, or a copied URL reopens the previous one'
    );
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await waitForEditor(page, undefined, 15000);
    const resumedMeta = (await page.getByTestId('lesson-meta').textContent()) ?? '';
    assert(
      resumedMeta.includes('Lesson P.4'),
      `a plain visit must reopen the lesson last chosen (P.4); the runner opened: ${resumedMeta}`
    );
    // The title the runner is showing, so the resume card can be read against the same string rather
    // than a hand-copied one that would go stale the first time a lesson is renamed.
    const resumedTitle = (await page.getByTestId('lesson-title').textContent())?.trim() ?? '';
    assert(resumedTitle.length > 3, `the runner must name the lesson it opened; got: "${resumedTitle}"`);
    // The address itself is not asserted, and the reason is React: in development StrictMode runs the
    // mount effect twice, so its second pass writes the lesson it just restored and a plain visit
    // ends up with `?lesson=P.4`. In the production build the effect runs once and the address stays
    // as it arrived. This suite drives the dev server, so pinning the URL here would pin StrictMode's
    // double-invoke instead of the workbench; what the feature promises is the lesson and the memory.
    assert.equal(
      await page.evaluate(() => localStorage.getItem('mechalab_last_lesson_v1')),
      'P.4',
      'the remembered lesson must be the one chosen, so the next plain visit opens it again'
    );
    console.log('  ok a plain visit reopens the lesson the learner was last on');

    // 7c. And the roadmap says it out loud. Remembering the lesson only helped a learner who went
    //     straight back to the runner; the tab that answers "what is next" still started at Step 1.
    //     It now opens with the lesson they stopped on, named by id and title, and one click continues
    //     it - P.4 has been opened but not verified, which is the case worth resuming. Step 7d then
    //     proves the same card moves forward rather than repeating itself.
    await page.getByTestId('tab-btn-tab-arch').click();
    const resumeCard = page.getByTestId('resume-card');
    await resumeCard.waitFor({ timeout: 5000 });
    const resumeId = (await page.getByTestId('resume-lesson-id').textContent())?.trim();
    assert.equal(
      resumeId,
      'P.4',
      `the roadmap must open with the lesson the learner stopped on (P.4); it named: ${resumeId}`
    );
    assert.equal(
      await resumeCard.getAttribute('data-resume-reason'),
      'resume',
      'an unfinished lesson is a resume, and the card must carry that reason for the assertions below'
    );
    const resumeCardText = (await resumeCard.textContent()) ?? '';
    assert(
      resumeCardText.includes(resumedTitle),
      `the resume card must name the lesson, not just its id; expected "${resumedTitle}" in: ${resumeCardText}`
    );
    assert(
      resumeCardText.includes('opened, never run'),
      `the card must tell a lesson read and left apart from one attempted; got: ${resumeCardText}`
    );
    await page.getByTestId('btn-resume-lesson').click();
    await waitForEditor(page, undefined, 15000);
    const continuedMeta = (await page.getByTestId('lesson-meta').textContent()) ?? '';
    assert(
      continuedMeta.includes('Lesson P.4'),
      `the resume card must continue the lesson it names; the runner opened: ${continuedMeta}`
    );
    assert.equal(
      (await page.getByTestId('lesson-title').textContent())?.trim(),
      resumedTitle,
      'the resume card must open the very lesson whose title it printed'
    );
    await page.getByTestId('tab-btn-tab-arch').click();
    console.log('  ok the roadmap opens with the lesson the learner stopped on');

    // 7d. And passing it hands the offer forward. A card that kept naming the lesson just verified
    //     would ask for it twice, on the screen whose job is to say what is next - so with P.4
    //     passed the card moves to P.5 and changes its words from "continue" to "next".
    const verifiedBefore = await page.evaluate(() =>
      localStorage.getItem('mechalab_pyodide_verified_v1')
    );
    await page.evaluate(() => {
      const key = 'mechalab_pyodide_verified_v1';
      const flags = JSON.parse(localStorage.getItem(key) ?? '{}');
      flags['P.4'] = true;
      localStorage.setItem(key, JSON.stringify(flags));
    });
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.getByTestId('tab-btn-tab-arch').click();
    const nextCard = page.getByTestId('resume-card');
    await nextCard.waitFor({ timeout: 5000 });
    const nextId = (await page.getByTestId('resume-lesson-id').textContent())?.trim();
    assert.equal(
      nextId,
      'P.5',
      `a passed lesson must hand the offer forward to the next unverified one (P.5); the card named: ${nextId}`
    );
    assert.equal(
      await nextCard.getAttribute('data-resume-reason'),
      'next',
      'a card pointing past a finished lesson must say so, not call it a resume'
    );
    const nextText = (await nextCard.textContent()) ?? '';
    assert(
      nextText.toLowerCase().includes('next unverified lesson'),
      `the card must name what it is offering; got: ${nextText}`
    );
    assert(
      !nextText.includes('executed and passed'),
      `the card must not describe an unpassed lesson as passed; got: ${nextText}`
    );
    const nextButton = (await page.getByTestId('btn-resume-lesson').textContent())?.trim() ?? '';
    assert(
      nextButton.includes('Start P.5'),
      `a lesson not yet opened is started, not continued; the button said: ${nextButton}`
    );
    // Put the progress back exactly as the scenarios before this one left it: the portfolio counts
    // in section 8 read one verified and one self-marked lesson.
    await page.evaluate((previous) => {
      const key = 'mechalab_pyodide_verified_v1';
      if (previous === null) localStorage.removeItem(key);
      else localStorage.setItem(key, previous);
    }, verifiedBefore);
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    console.log('  ok a passed lesson hands the roadmap card forward');

    // 7e. And the card knows what is half-written, not just which lesson. The editor keeps the
    //     unfinished program, the card says how far it has moved from the starter, and reopening it
    //     from a plain visit hands the work back - a card naming an exercise whose typing it then
    //     replaced with the starter would be the same loss in a new place.
    await page.getByTestId('tab-btn-tab-pyodide').click();
    await waitForEditor(page, undefined, 15000);
    const p4Starter = await getEditorCode(page);
    // A real half-finished attempt: P.4's one measurable step (`# TODO 1` over `safe_cmd = cmd`) is
    // written, and nothing else is. The card has to say "1 of 1", not "2 lines changed".
    const halfWritten = p4Starter.replace(
      'safe_cmd = cmd',
      'safe_cmd = min(max(cmd, 0), 255)'
    );
    assert.notEqual(halfWritten, p4Starter, 'P.4 starter must still carry the TODO 1 placeholder');
    await setEditorCode(page, halfWritten);
    // The draft is written on a pause, not on every keystroke, so wait for the store to have it
    // rather than for a fixed number of milliseconds - a slower CI runner would otherwise reach the
    // roadmap before the debounce fired and read an untouched starter.
    await page.waitForFunction(
      (marker) => (localStorage.getItem('mechalab_drafts_v1') ?? '').includes(marker),
      'min(max(cmd',
      { timeout: 15000 }
    );
    await page.getByTestId('tab-btn-tab-arch').click();
    const draftLine = page.getByTestId('resume-draft');
    await draftLine.waitFor({ timeout: 15000 });
    const draftText = (await draftLine.textContent()) ?? '';
    const draftProgressText = (await page.getByTestId('resume-draft-progress').textContent())?.trim();
    assert.equal(
      draftProgressText,
      '1 of 2 TODO lines written',
      `the card must say how close the exercise is to done, not only how long the diff is; got: ${draftProgressText}`
    );
    assert(
      draftText.includes('lines changed'),
      `the card keeps the raw diff beside the step count; got: ${draftText}`
    );
    const draftState = (await page.getByTestId('resume-lesson-state').textContent()) ?? '';
    assert(
      draftState.includes('edited, never run'),
      `typed-but-unrun is its own state, not "opened"; the state line said: ${draftState}`
    );
    const draftCard = (await page.getByTestId('resume-card').textContent()) ?? '';
    assert(
      draftCard.includes('resume'.toUpperCase()) === false && draftCard.includes('P.4'),
      `the draft belongs to the lesson the learner stopped on; the card said: ${draftCard}`
    );
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await waitForEditor(page, undefined, 15000);
    assert.equal(
      await getEditorCode(page),
      halfWritten,
      'a plain visit must reopen the unfinished edit, not the starter it was written over'
    );
    // 7f. Running it, even to a failure, is the next rung of that ladder: the card stops saying
    //     "edited, never run" and starts counting attempts, which is the difference the log exists for.
    await page.getByTestId('btn-run-verify').click();
    // Parsed, not substring-matched: `"kind":"run"` and `"lesson":"P.4"` can each come from a
    // different event, so a raw search for both resolves on the previous lesson's run and the card is
    // then read before this run has finished - which is exactly how this assertion failed on CI once.
    await page.waitForFunction(
      () => {
        try {
          const events = JSON.parse(localStorage.getItem('mechalab.learningLog.v1') ?? '[]');
          return Array.isArray(events) && events.some((e) => e.kind === 'run' && e.lesson === 'P.4');
        } catch {
          return false;
        }
      },
      undefined,
      { timeout: 60000 }
    );
    await page.getByTestId('tab-btn-tab-arch').click();
    await page.getByTestId('resume-card').waitFor({ timeout: 15000 });
    // The card reads the log at render, so give that render a moment rather than reading the first
    // frame after the click; a card that never says `tried` still fails here, with its own text below.
    await page
      .waitForFunction(
        () =>
          (document.querySelector('[data-testid="resume-card"]')?.textContent ?? '').includes('tried'),
        undefined,
        { timeout: 15000 }
      )
      .catch(() => {});
    const triedText = (await page.getByTestId('resume-card').textContent()) ?? '';
    assert(
      triedText.includes('tried once, not passed yet'),
      `a lesson run and not passed must say so; got: ${triedText}`
    );
    // The roadmap's step cards carry the same distinction, so the whole map can be read as
    // "never opened / opened and left / tried and failed / passed" at a glance.
    assert.equal(
      await page.getByTestId('practice-entry-P.4').first().getAttribute('data-state'),
      'tried',
      'the step chip for a run-but-unpassed lesson must show the attempt'
    );
    assert.equal(
      await page.getByTestId('practice-entry-P.6').first().getAttribute('data-state'),
      'passed',
      'the step chip for a verified lesson must stay passed'
    );
    await page.getByTestId('tab-btn-tab-pyodide').click();
    // 7g. A run files the code it started from, so the version before the last edit is one click
    //     away. The draft keeps only the latest text; this is the attempt behind it.
    await page.getByTestId('btn-draft-history').click();
    await page.getByTestId('draft-history').waitFor({ timeout: 5000 });
    // P.4 grades behaviour before stdout, so a half-written starter fails its checks, not its output.
    assert.equal(
      (await page.getByTestId('history-entry-0-verdict').textContent())?.trim(),
      'checks failed',
      'the filed attempt must carry the verdict its run got'
    );
    // Overwrite it in the editor, then take the filed version back.
    await setEditorCode(page, `${halfWritten}\nprint("a later, worse edit")\n`);
    await page.getByTestId('btn-restore-history-0').click();
    await page.waitForFunction(
      (expected) => window.__mechalabEditors?.['editor-main']?.get() === expected,
      halfWritten,
      { timeout: 5000 }
    );
    // Restoring is not a run: the badges described the code that was just replaced, so they clear.
    assert.ok(
      (await page.getByTestId('btn-run-verify').textContent())?.includes('Run & Verify'),
      'the restored version must be ungraded until it is run again'
    );
    // Reset Starter is the one edit that means "forget this one", so the card stops mentioning it.
    await page.getByTestId('btn-reset-starter').click();
    await page.waitForTimeout(200);
    await page.getByTestId('tab-btn-tab-arch').click();
    await page.getByTestId('resume-card').waitFor({ timeout: 5000 });
    assert.equal(
      await page.getByTestId('resume-draft').count(),
      0,
      'resetting to the starter must clear the draft, or the card would keep advertising it'
    );
    console.log('  ok the card shows the unfinished edit and reopening hands it back');

    // 7h. The Scope draws what the run's own loop produced. `mechalab.scope` is the module the lesson
    //     prose names, so this is the learner's path: import it, stream a trace, press Run, look.
    await page.getByTestId('tab-btn-tab-pyodide').click();
    await setEditorCode(
      page,
      [
        'import math',
        'from mechalab import scope',
        '',
        'ts = [i / 100 for i in range(400)]',
        'ys = [1 - math.exp(-t) for t in ts]',
        'scope.stream("step response", ts, ys)',
        'print("traced", len(ts), "points")',
        '',
      ].join('\n')
    );
    await page.getByTestId('btn-run-verify').click();
    await page.getByTestId('scope-legend').waitFor({ timeout: 90000 });
    const legendText = (await page.getByTestId('scope-legend').textContent()) ?? '';
    assert(
      legendText.includes('step response') && legendText.includes('0.9815'),
      `the legend must name the trace and its last value; got: ${legendText}`
    );
    // A canvas that exists but was never painted is the bug this asserts against: the plot has to have
    // ink on it, not just a mounted element.
    const ink = await page.evaluate(() => {
      const canvas = document.querySelector('[data-testid="scope-canvas"]');
      if (!canvas) return { painted: 0, total: 0 };
      const context = canvas.getContext('2d');
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let painted = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted += 1;
      return { painted, total: data.length / 4 };
    });
    assert(
      ink.painted > ink.total * 0.002,
      `the trace must be drawn, not only mounted; ${ink.painted} of ${ink.total} pixels painted`
    );
    // The numbers exist as text too: a canvas is invisible to a screen reader.
    await page.getByTestId('btn-scope-table').click();
    await page.getByTestId('scope-table').waitFor({ timeout: 5000 });
    const tableRows = await page.getByTestId('scope-table').locator('tbody tr').count();
    assert(tableRows >= 5, `the table must sample the window, got ${tableRows} rows`);
    const lastTableRow =
      (await page.getByTestId('scope-table').locator('tbody tr').last().textContent()) ?? '';
    assert(
      lastTableRow.includes('0.9815'),
      `the table's last row must carry the settling value; got: ${lastTableRow}`
    );
    // ...and switching back repaints the canvas it unmounted.
    await page.getByTestId('btn-scope-table').click();
    await page.getByTestId('scope-canvas').waitFor({ timeout: 5000 });
    const repainted = await page.evaluate(() => {
      const canvas = document.querySelector('[data-testid="scope-canvas"]');
      const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      let painted = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted += 1;
      return painted;
    });
    assert(repainted > 0, 'returning from the table must draw the trace again');
    console.log('  ok a run traces its own signal into the Scope, as a plot and as a table');

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

    // 9b. Beginner View opens the roadmap matrix on the Beginner column only, and the deeper
    // Tier 2/Tier 3 columns are opt-in. This is the first place a beginner would meet the matrix.
    await page.getByTestId('tab-btn-tab-arch').click();
    await page.getByTestId('btn-arch-matrix').click();
    const matrixBeginner = await page.getByTestId('arch-matrix').textContent();
    assert(
      matrixBeginner?.includes('Beginner path'),
      'Beginner View matrix must label its only column in plain English'
    );
    assert(
      !matrixBeginner?.includes('Open in Tier 2') && !matrixBeginner?.includes('Open in Tier 3'),
      'Beginner View matrix must start without Tier 2 or Tier 3 columns'
    );

    // 9c. The matrix is plannable: every row prices its own step in the same words the step
    // card uses, and the footer is those rows added up rather than a second hand-typed total.
    // The total sits on its own line and the arm/depth split under it; Step 10 is all arm work
    // and prints no depth clause, every other row prints one.
    const rowShape = /^(\d+(?:\.\d+)?)(?:–(\d+(?:\.\d+)?))? h$/;
    const layerShape = /^arm (\d+(?:\.\d+)?)(?:–(\d+(?:\.\d+)?))? h(?: · depth (\d+(?:\.\d+)?)(?:–(\d+(?:\.\d+)?))? h)?$/;
    const rowCosts = [];
    for (let number = 3; number <= 10; number += 1) {
      const text = (await page.getByTestId(`matrix-cost-${number}`).textContent())?.trim() ?? '';
      const hit = rowShape.exec(text);
      assert(hit, `matrix row ${number} must print its step's focused hours, got: ${text}`);
      rowCosts.push([Number(hit[1]), Number(hit[2] ?? hit[1])]);
      const layer =
        (await page.getByTestId(`matrix-layer-${number}`).textContent())?.trim() ?? '';
      const layerHit = layerShape.exec(layer);
      assert(
        layerHit,
        `matrix row ${number} must split its hours into the arm pass and the depth pass, got: ${layer}`
      );
      assert.equal(
        !!layerHit[3],
        number !== 10,
        `matrix row ${number} ${number === 10 ? 'has no depth layer and must not claim one' : 'must name its depth pass'}`
      );
    }
    const totalText = (await page.getByTestId('matrix-cost-total').textContent())?.trim() ?? '';
    const totalHit = /^(\d+(?:\.\d+)?)–(\d+(?:\.\d+)?) h · arm /.exec(totalText);
    assert(totalHit, `matrix footer must total its eight rows, got: ${totalText}`);
    const round2 = (value) => Math.round(value * 100) / 100;
    assert.equal(
      Number(totalHit[1]),
      round2(rowCosts.reduce((sum, row) => sum + row[0], 0)),
      `matrix footer low total must be the rows' low hours added up, got: ${totalText}`
    );
    assert.equal(
      Number(totalHit[2]),
      round2(rowCosts.reduce((sum, row) => sum + row[1], 0)),
      `matrix footer high total must be the rows' high hours added up, got: ${totalText}`
    );
    await page.getByTestId('btn-toggle-advanced-columns').click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="arch-matrix"]')?.textContent?.includes('Open in Tier 2') &&
        document.querySelector('[data-testid="arch-matrix"]')?.textContent?.includes('Open in Tier 3')
    );

    // 9d. Each column prices its own layer: Depth 1 is the arm pass, Depth 2 the step's Tier 2
    // modules, Depth 3 its Tier 3 ones. An empty cell is an em dash, not a free 0 h, and each
    // footer column is the cells above it added up - never a second typed number.
    const parseCell = (text, where) => {
      if (text === '—') return [0, 0];
      const hit = /^(\d+(?:\.\d+)?)(?:–(\d+(?:\.\d+)?))? h$/.exec(text);
      assert(hit, `${where} must print hours or an em dash, got: ${text}`);
      return [Number(hit[1]), Number(hit[2] ?? hit[1])];
    };
    for (const [column, suffix] of [
      [1, 'd1'],
      [2, 'd2'],
      [3, 'd3'],
    ]) {
      const cells = [];
      for (let number = 3; number <= 10; number += 1) {
        const text =
          (await page.getByTestId(`matrix-cost-${number}-${suffix}`).textContent())?.trim() ?? '';
        cells.push(parseCell(text, `matrix step ${number} Depth ${column}`));
      }
      const footerText =
        (await page.getByTestId(`matrix-cost-col-${column}`).textContent())?.trim() ?? '';
      const footer = parseCell(footerText, `matrix Depth ${column} footer`);
      assert.equal(
        footer[0],
        round2(cells.reduce((sum, cell) => sum + cell[0], 0)),
        `Depth ${column} footer low total must be its cells added up, got: ${footerText}`
      );
      assert.equal(
        footer[1],
        round2(cells.reduce((sum, cell) => sum + cell[1], 0)),
        `Depth ${column} footer high total must be its cells added up, got: ${footerText}`
      );
    }
    await page.getByTestId('btn-toggle-advanced-columns').click();
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="arch-matrix"]')?.textContent?.includes('Open in Tier 2')
    );

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
    const tableSolution = await getEditorCode(formattingPage);
    const unpadded = tableSolution.replace(/:(?:[<>^=])?\d+(\.\d+)?([fdegsx%])/g, ':$1$2');
    assert.notEqual(unpadded, tableSolution, 'the 03.1 solution must pad its table with field widths');
    await setEditorCode(formattingPage, unpadded);
    await formattingPage.getByTestId('btn-run-verify').click();
    await formattingPage.getByTestId('status-output-mismatch').waitFor({ timeout: 30000 });
    // The presentation check has its own card, and it names the output line that differs: a
    // formatting slip is mechanical, so the Expected Output panel is the fix and the nudge is the
    // only rung offered - the code block would hand over the answer to a padded table.
    const presentationCard = formattingPage.getByTestId('check-failure-presentation');
    await presentationCard.waitFor({ timeout: 5000 });
    const presentationText = await presentationCard.innerText();
    assert(
      presentationText.includes('Presentation check failed') && /line \d+/.test(presentationText),
      `the presentation card must name the check and the output line that differs; got: ${presentationText}`
    );
    assert(
      presentationText.includes('Hint 1') && !presentationText.includes('Hint 2'),
      `the card must name the nudge and never the formula block; got: ${presentationText}`
    );
    assert.equal(
      await formattingPage.getByTestId('check-failure-behaviour').count(),
      0,
      'a behavioural check that passed must not open a card'
    );
    await formattingPage.getByTestId('btn-check-hint-presentation').click();
    assert(
      await formattingPage.getByTestId('hint-for-check').isVisible(),
      'the rung the presentation check names must be marked as answering it'
    );
    assert(
      (await formattingPage.getByTestId('btn-reveal-hint').innerText()).trim(),
      'Run again to unlock Hint 2',
      'the formatting card must not unlock the code-block hint on the run that was already on screen'
    );
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
    const plainSolution = await getEditorCode(formattingPage);
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
    await setEditorCode(formattingPage, rewrapped);
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
    await setEditorCode(formattingPage, plantProbe);
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

    // 12. The landing Start here block closes to one line once Lesson 1 is verified. Everything
    //     above saw the full first-timer block; a returning learner should get the compact line
    //     without losing the lesson link.
    await formattingPage.getByTestId('lesson-item-P.1').click();
    await formattingPage.getByTestId('btn-load-solution').click();
    await formattingPage.getByTestId('btn-run-verify').click();
    await formattingPage.getByTestId('status-assert-passed').waitFor({ timeout: 30000 });
    const collapsedStartHere = formattingPage.getByTestId('start-here');
    await collapsedStartHere.waitFor({ timeout: 5000 });
    assert.equal(
      await collapsedStartHere.getAttribute('data-collapsed'),
      'true',
      'verifying Lesson 1 must collapse the Start here block to one line'
    );
    const collapsedText = await collapsedStartHere.innerText();
    assert(
      collapsedText.includes('Lesson 1 verified') &&
        !collapsedText.includes(START_HERE.definition),
      `the collapsed block must say Lesson 1 is verified and drop the first-timer copy; got: ${collapsedText}`
    );
    assert(
      (await formattingPage.getByTestId('start-here-lesson-link').getAttribute('href'))?.endsWith(
        '/track-p/P.1-variables-and-data-types.md'
      ),
      'the collapsed block must keep the Lesson 1 link'
    );
    console.log('  ok the Start here block collapses to one line after Lesson 1 is verified');

    // 12b. The collapsed line can be dismissed for good, and the roadmap tab restores it. The
    //      roadmap's own first step card follows that pass's milestone, not Lesson 1: verifying
    //      P.1 leaves the card whole, checking Tier 1's first milestone closes it, and Tier 2 stays
    //      open until its own first step is done.
    await formattingPage.getByTestId('btn-dismiss-start-here').click();
    await formattingPage.getByTestId('start-here').waitFor({ state: 'detached', timeout: 5000 });
    await formattingPage.getByTestId('tab-btn-tab-arch').click();
    const restoreStartHere = formattingPage.getByTestId('btn-restore-start-here');
    await restoreStartHere.waitFor({ timeout: 5000 });
    assert(
      (await restoreStartHere.innerText()).includes('Show the Start here block'),
      'the roadmap must name the control that brings the block back'
    );
    await formattingPage.getByTestId('step-card-t1_tr00').waitFor({ timeout: 5000 });
    assert.equal(
      await formattingPage.getByTestId('step-card-t1_tr00').getAttribute('data-collapsed'),
      null,
      'verifying Lesson 1 alone must leave the roadmap first step card whole'
    );
    await formattingPage.getByTestId('btn-milestone-t1_tr00').click();
    await formattingPage.getByTestId('btn-step-expand').waitFor({ timeout: 5000 });
    assert.equal(
      await formattingPage.getByTestId('step-card-t1_tr00').getAttribute('data-collapsed'),
      'true',
      "checking a pass's own first milestone must collapse its first step card"
    );
    assert(
      (await formattingPage.getByTestId('pass-first-step-complete-tier1').count()) === 1 &&
        (await formattingPage.getByTestId('pass-first-step-complete-tier2').count()) === 0,
      "the pass selector must mark Tier 1's completed Step 1 and leave Tier 2 unmarked"
    );
    await formattingPage.getByTestId('btn-step-expand').click();
    await formattingPage.getByTestId('btn-step-collapse').waitFor({ timeout: 5000 });
    await formattingPage.getByTestId('btn-step-collapse').click();
    await formattingPage.getByTestId('btn-step-expand').waitFor({ timeout: 5000 });
    await formattingPage.getByTestId('btn-pass-card-tier2').click();
    await formattingPage.getByTestId('step-card-t2_tr00').waitFor({ timeout: 5000 });
    assert.equal(
      await formattingPage.getByTestId('step-card-t2_tr00').getAttribute('data-collapsed'),
      null,
      "Tier 1's completed first step must not collapse Tier 2's first step"
    );
    assert.equal(
      await formattingPage.getByTestId('pass-first-step-complete-tier2').count(),
      0,
      "selecting Tier 2 must not mark its first step complete"
    );
    await formattingPage.getByTestId('btn-pass-card-tier1').click();
    await formattingPage.getByTestId('btn-step-expand').waitFor({ timeout: 5000 });

    // The dismissal is remembered across a reload, and the restore control survives it too.
    await formattingPage.reload({ waitUntil: 'networkidle' });
    assert(
      (await formattingPage.getByTestId('start-here').count()) === 0,
      'a dismissed Start here line must stay dismissed after a reload'
    );
    await formattingPage.getByTestId('tab-btn-tab-arch').click();
    assert.equal(
      await formattingPage.getByTestId('step-card-t1_tr00').getAttribute('data-collapsed'),
      'true',
      'a checked first milestone must keep its card collapsed after a reload'
    );
    assert.equal(
      await formattingPage.getByTestId('pass-first-step-complete-tier1').count(),
      1,
      "a completed first step must keep its pass-card check after a reload"
    );
    await formattingPage.getByTestId('btn-restore-start-here').click();
    await formattingPage.getByTestId('start-here').waitFor({ timeout: 5000 });
    assert(
      (await formattingPage.getByTestId('start-here').getAttribute('data-collapsed')) === 'true',
      'restoring from the roadmap must bring the line back on the landing screen, still collapsed'
    );
    console.log('  ok the collapsed Start here line can be dismissed and restored from the roadmap');

    // 13. The capstone's pass condition is its four-fault bench. A repair that is 10% short keeps its
    //     real metric on the card (1.20 mm, still broken) and the lesson stays unverified, even though
    //     the program runs cleanly and prints a repair line; the intended repairs verify it. The bench
    //     calls the learner's own functions, so the edit is one line inside `repair_encoder_offset`
    //     rather than a removed assertion.
    await formattingPage.getByTestId('tab-btn-tab-pyodide').click();
    await formattingPage.getByTestId('lesson-item-08.1').scrollIntoViewIfNeeded();
    await formattingPage.getByTestId('lesson-item-08.1').click();
    await formattingPage.getByTestId('btn-load-solution').click();
    const benchSolution = await getEditorCode(formattingPage);
    const shortRepair = benchSolution.replace(
      'def repair_encoder_offset(q_measured, offset_rad):\n    return q_measured - offset_rad',
      'def repair_encoder_offset(q_measured, offset_rad):\n    return q_measured - 0.9 * offset_rad'
    );
    assert.notEqual(
      shortRepair,
      benchSolution,
      'the 08.1 solution must contain the one-line offset repair this scenario shortens'
    );
    const countBeforeBench = (await formattingPage.getByTestId('runner-verified-count').textContent())?.trim();
    const benchVerifiedBefore = Number((countBeforeBench || '').match(/^(\d+)/)?.[1]);
    assert.ok(Number.isInteger(benchVerifiedBefore), `the tally must start with a count, got: ${countBeforeBench}`);

    await setEditorCode(formattingPage, shortRepair);
    await formattingPage.getByTestId('btn-run-verify').click();
    await formattingPage.getByTestId('status-harness-failed').waitFor({ timeout: 45000 });

    assert.equal(
      (await formattingPage.getByTestId('fault-metric-zero-offset').textContent())?.trim(),
      '1.20 mm',
      'a 10%-short offset repair must keep its real 1.20 mm tip error on the card'
    );
    assert(
      (await formattingPage.getByTestId('fault-card-zero-offset').innerText()).includes('STILL BROKEN'),
      'a repair above the 1 mm target must read STILL BROKEN, not REPAIRED'
    );
    assert.equal(
      (await formattingPage.getByTestId('fault-bench-count').textContent())?.trim(),
      '3 / 4 repaired',
      'the bench header must count three at-target repairs'
    );
    const benchError = await formattingPage.getByTestId('pre-harness-error').innerText();
    assert(
      benchError.includes('encoder zero offset') && benchError.includes('1.20 mm'),
      `the bench failure must name the unit and its metric; got: ${benchError}`
    );
    assert.equal(
      (await formattingPage.getByTestId('status-assert-passed').count()),
      0,
      'a run whose bench misses a target must not report a pass'
    );
    assert.equal(
      (await formattingPage.getByTestId('runner-verified-count').textContent())?.trim(),
      countBeforeBench,
      'a repair that fails its graded metric must not verify Lesson 08.1'
    );
    const benchLog = await formattingPage.evaluate(() =>
      JSON.parse(localStorage.getItem('mechalab.learningLog.v1') || '[]')
    );
    const benchRun = benchLog.filter((e) => e.kind === 'run' && e.lesson === '08.1').pop();
    assert.equal(benchRun?.outcome, 'harness_failed', 'the learning log must record the harness failure');
    assert(
      benchRun?.fail?.includes('1.20 mm'),
      `the logged failure must carry the real metric; got: ${benchRun?.fail}`
    );
    console.log('  ok a 10%-short 08.1 repair keeps 1.20 mm and leaves the lesson unverified');

    await formattingPage.getByTestId('btn-load-solution').click();
    await formattingPage.getByTestId('btn-run-verify').click();
    await formattingPage.getByTestId('status-assert-passed').waitFor({ timeout: 45000 });
    assert.equal(
      (await formattingPage.getByTestId('fault-bench-count').textContent())?.trim(),
      '4 / 4 repaired',
      'the intended repairs must put all four cards at target'
    );
    assert.equal(
      (await formattingPage.getByTestId('runner-verified-count').textContent())?.trim(),
      `${benchVerifiedBefore + 1} / ${(countBeforeBench || '').match(/\/\s*(\d+)/)?.[1]} Verified`,
      'the same solution with all four repairs at target must verify the capstone'
    );
    console.log('  ok the intended 08.1 repairs put all four cards at target and verify the lesson');

    // 14. The Tier 3 capstone's pass condition is its budget bench. A zero-order hold charged a full
    //     tick instead of half keeps its real 42.7 deg margin on the row and leaves the lesson
    //     unverified; the intended functions put all four budgets at target and verify it. The bench
    //     calls the learner's own functions on inputs the module never prints.
    await formattingPage.getByTestId('lesson-item-EX.08-capstones.T3.07a').scrollIntoViewIfNeeded();
    await formattingPage.getByTestId('lesson-item-EX.08-capstones.T3.07a').click();
    await formattingPage.getByTestId('lesson-harness').waitFor({ timeout: 10000 });
    await formattingPage.getByTestId('btn-load-solution').click();
    const budgetSolution = await getEditorCode(formattingPage);
    const doubleZoh = budgetSolution.replace(
      'return 0.5 * ts_us',
      'return ts_us  # deliberately double the hold'
    );
    assert.notEqual(
      doubleZoh,
      budgetSolution,
      'the Tier 3 solution must contain the half-tick zero-order hold this scenario doubles'
    );
    const countBeforeBudget = (await formattingPage.getByTestId('runner-verified-count').textContent())?.trim();
    const budgetVerifiedBefore = Number((countBeforeBudget || '').match(/^(\d+)/)?.[1]);
    assert.ok(Number.isInteger(budgetVerifiedBefore), `the tally must start with a count, got: ${countBeforeBudget}`);

    await setEditorCode(formattingPage, doubleZoh);
    await formattingPage.getByTestId('btn-run-verify').click();
    await formattingPage.getByTestId('status-harness-failed').waitFor({ timeout: 45000 });
    assert.equal(
      (await formattingPage.getByTestId('harness-metric-margin').textContent())?.trim(),
      '42.7 deg',
      'a full-tick hold must keep the 42.7 deg margin it really leaves, not the 47.8 deg one'
    );
    assert.equal(
      (await formattingPage.getByTestId('harness-count').textContent())?.trim(),
      '3 / 4 at target',
      'the bench must count the three budgets that still pass'
    );
    assert(
      (await formattingPage.getByTestId('harness-row-margin').innerText()).includes('OFF TARGET'),
      'the eroded margin row must read OFF TARGET'
    );
    assert.equal(
      (await formattingPage.getByTestId('status-assert-passed').count()),
      0,
      'a capstone run with an off-target metric must not report a pass'
    );
    assert.equal(
      (await formattingPage.getByTestId('runner-verified-count').textContent())?.trim(),
      countBeforeBudget,
      'a zero-order hold charged double a tick must not verify the Tier 3 capstone'
    );
    const budgetLog = await formattingPage.evaluate(() =>
      JSON.parse(localStorage.getItem('mechalab.learningLog.v1') || '[]')
    );
    const budgetRun = budgetLog
      .filter((e) => e.kind === 'run' && e.lesson === 'EX.08-capstones.T3.07a')
      .pop();
    assert.equal(budgetRun?.outcome, 'harness_failed', 'the log must record the budget failure');
    assert(
      budgetRun?.fail?.includes('net phase margin: 42.7 deg'),
      `the logged failure must name the real margin; got: ${budgetRun?.fail}`
    );
    console.log('  ok a doubled zero-order hold keeps 42.7 deg and leaves the Tier 3 capstone unverified');

    await formattingPage.getByTestId('btn-load-solution').click();
    await formattingPage.getByTestId('btn-run-verify').click();
    await formattingPage.getByTestId('status-assert-passed').waitFor({ timeout: 45000 });
    assert.equal(
      (await formattingPage.getByTestId('harness-count').textContent())?.trim(),
      '4 / 4 at target',
      'the intended budget functions must put all four rows at target'
    );
    assert.equal(
      (await formattingPage.getByTestId('runner-verified-count').textContent())?.trim(),
      `${budgetVerifiedBefore + 1} / ${(countBeforeBudget || '').match(/\/\s*(\d+)/)?.[1]} Verified`,
      'the same functions with every budget at target must verify the Tier 3 capstone'
    );
    console.log('  ok the intended budget functions put all four rows at target and verify the capstone');

    // 12. The editor is CodeMirror, and a lesson is a small project: Python is highlighted, a
    //     lesson that imports the shared plant gets a locked tab holding that same source, and a
    //     `# @slider` comment becomes a control that rewrites the literal and re-runs.
    await formattingPage.getByTestId('lesson-item-EX.05-control.T2.05a').scrollIntoViewIfNeeded();
    await formattingPage.getByTestId('lesson-item-EX.05-control.T2.05a').click();
    await waitForEditor(formattingPage);
    await formattingPage.getByTestId('editor-tab-mechalab_plant.py').waitFor({ timeout: 10000 });
    await formattingPage.getByTestId('editor-tab-mechalab_plant.py').click();
    await formattingPage.waitForSelector('[data-editor="editor-helper"] .cm-content', { timeout: 10000 });
    assert.equal(
      await formattingPage.locator('[data-editor="editor-helper"] .cm-content').getAttribute('contenteditable'),
      'false',
      'the shared plant must be read-only in the editor: it is the module the checks import'
    );
    assert(
      (await getEditorCode(formattingPage, 'editor-helper')).includes('def simulate_arm'),
      'the locked tab must show the plant the worker imports, not a stub'
    );
    await formattingPage.getByTestId('editor-tab-main').click();
    await waitForEditor(formattingPage);

    // The control lesson opens with its three gains already tunable, not as a plain starter.
    await formattingPage.getByTestId('lesson-item-05.1').scrollIntoViewIfNeeded();
    await formattingPage.getByTestId('lesson-item-05.1').click();
    await formattingPage.getByTestId('slider-KP').waitFor({ timeout: 10000 });
    assert.equal(
      await formattingPage.locator('[data-editor="editor-main"] input[type="range"]').count(),
      3,
      '05.1 must open with Kp, Ki and Kd wired as sliders'
    );

    await formattingPage.getByTestId('lesson-item-P.1').scrollIntoViewIfNeeded();
    await formattingPage.getByTestId('lesson-item-P.1').click();
    await setEditorCode(
      formattingPage,
      'Kp = 4.0  # @slider 0 20 0.1\nprint(f"Kp={Kp:.1f}")\n'
    );
    await formattingPage.getByTestId('slider-Kp').waitFor({ timeout: 10000 });
    const tokenSpans = await formattingPage.locator('[data-editor="editor-main"] .cm-content span').count();
    assert(tokenSpans >= 3, `Python must be highlighted, not plain text; found ${tokenSpans} token spans`);
    await formattingPage.evaluate(() => {
      const slider = document.querySelector('[data-testid="slider-Kp"]');
      slider.value = '8';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await formattingPage.waitForFunction(
      () => (window.__mechalabEditors?.['editor-main']?.get() ?? '').includes('Kp = 8.0'),
      undefined,
      { timeout: 5000 }
    );
    await formattingPage.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="pre-actual-stdout"]')
          ?.textContent?.includes('Kp=8.0'),
      undefined,
      { timeout: 30000 }
    );
    console.log('  ok the editor highlights Python, locks a read-only helper, and a slider drag rewrites and re-runs');
    console.log('  ok 05.1 opens with Kp, Ki and Kd already tunable');

    // ⌘K: one dialog over the whole course, driven the way a keyboard user drives it.
    await formattingPage.keyboard.press('Control+k');
    await formattingPage.getByTestId('command-palette').waitFor({ timeout: 10000 });
    assert.equal(
      await formattingPage.getByTestId('command-palette').getAttribute('role'),
      'dialog',
      'the palette must be a real dialog so a screen reader announces it as one'
    );
    assert.equal(
      await formattingPage.getByTestId('input-palette-search').evaluate((el) => el === document.activeElement),
      true,
      'opening the palette must put the caret in its search field: a palette you have to click into is a menu'
    );
    const listed = (await formattingPage.getByTestId('palette-match-count').innerText()).match(/(\d+) of (\d+)/);
    assert(listed && Number(listed[2]) > 90, `the empty palette must list the whole catalogue, not a subset; read: ${listed?.[0]}`);

    await formattingPage.getByTestId('input-palette-search').fill('P.1');
    await formattingPage.getByTestId('palette-item-lesson-P.1').waitFor({ timeout: 5000 });
    assert.equal(
      await formattingPage.getByTestId('palette-item-lesson-P.1').getAttribute('aria-selected'),
      'true',
      'the exact lesson id must be the highlighted row, so Enter opens the lesson that was typed'
    );
    await formattingPage.keyboard.press('Enter');
    await formattingPage.getByTestId('command-palette').waitFor({ state: 'detached', timeout: 5000 });
    await formattingPage.getByTestId('lesson-item-P.1').waitFor({ timeout: 5000 });
    assert(
      formattingPage.url().includes('lesson=P.1'),
      `choosing a lesson from the palette must put it in the address bar; url was ${formattingPage.url()}`
    );

    await formattingPage.getByTestId('btn-open-palette').click();
    await formattingPage.getByTestId('command-palette').waitFor({ timeout: 5000 });
    await formattingPage.getByTestId('input-palette-search').fill('zzzzqqq');
    await formattingPage.getByTestId('palette-empty').waitFor({ timeout: 5000 });
    assert.equal(
      await formattingPage.getByRole('option').count(),
      0,
      'an unmatched query must offer nothing to open, not the whole catalogue'
    );
    await formattingPage.getByTestId('input-palette-search').fill('theme');
    await formattingPage.getByTestId('palette-item-action-toggle-theme').waitFor({ timeout: 5000 });
    await formattingPage.keyboard.press('ArrowDown');
    const highlighted = await formattingPage.getByRole('option').evaluateAll((rows) =>
      rows.filter((row) => row.getAttribute('aria-selected') === 'true').map((row) => row.dataset.paletteId)
    );
    assert.equal(highlighted.length, 1, 'exactly one row may be highlighted at a time');
    await formattingPage.keyboard.press('Escape');
    await formattingPage.getByTestId('command-palette').waitFor({ state: 'detached', timeout: 5000 });
    console.log('  ok ⌘K opens a searchable dialog, ranks the typed lesson first, and closes on Escape');

    console.log(
      '[PASS] Real-browser Chromium E2E tests passed (Starter fail, Print-spoof rejection, SyntaxError, Infinite-loop Stop/Timeout recovery, Solution pass, CDN failure protection, Reload persistence, Last-lesson resume, roadmap resume & next card, draft restore & step count, run history restore, Scope trace as plot & table, Portfolio export categories, Diagnostic/Exit Review tabs, whitespace-vs-formatting grading, shared-plant import, Start here collapse & dismiss/restore, per-pass first-step collapse, 08.1 bench-gated pass, Tier 3 budget-gated pass, CodeMirror highlighting/read-only helper/slider re-run, ⌘K palette open/find/open/close).'
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
