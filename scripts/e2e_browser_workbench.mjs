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
import { clearBulk, waitForBulk } from './bulk_store_page.mjs';
import { getEditorCode, setEditorCode, waitForEditor } from './editor-code.mjs';
import { createServer } from 'vite';
import { clickToolbar } from './e2e_toolbar.mjs';
import { seedTourSeen } from './tour_seed.mjs';

/**
 * The three stores this suite reads by hand. They are in IndexedDB now (`app/src/bulkStorage.ts`), so a
 * read is one round trip through `bulk_store_page.mjs` rather than a `localStorage.getItem` - and a
 * run's event lands a tick after the UI says it is done, which is what the waits below are for.
 */
const LOG_KEY = 'mechalab.learningLog.v1';
const DRAFTS_KEY = 'mechalab_drafts_v1';
const STUDY_KEY = 'mechalab_study_notes_v1';

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
  // The release identity is a `define`, and a server rooted at `app/` finds no project config to read
  // it from. The smoke suite renders the footer through this server and asserts the version the build
  // prints, so the define has to be here rather than passed to a server this suite did not create.
  const { version } = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const viteServer = await createServer({
    // `configFile` is not optional here. Vite resolves a config from *its root*, and the root below is
    // `app/` — so without this line the project's `vite.config.ts` (at the repository root) was never
    // read, and every suite that drives this server was loading the app **without Tailwind**: no
    // utilities, so no `fixed`, no `min-h-[44px]`, and a page 8002 px tall instead of 2781. The data
    // attributes and the text still worked, which is why nobody noticed until the tour measured a ring
    // against an element and got a `position: static` card 1048 px from the bottom of the screen.
    configFile: path.join(repoRoot, 'vite.config.ts'),
    root: path.join(repoRoot, 'app'),
    define: { __APP_VERSION__: JSON.stringify(version) },
    // Cross-origin isolation is what gives the page a SharedArrayBuffer, and without it the
    // interrupt-based Stop cannot exist. The production host is GitHub Pages, which cannot send
    // headers; `app/public/sw.js` covers that, and every local server sends them here.
    server: { port: 0, host: '127.0.0.1', headers: ISOLATION_HEADERS },
    logLevel: 'error',
  });
  // Fail here, not at whichever assertion first asks where something is: a server that lost the config
  // still serves every data attribute and every word of text, and the suite then measures an unstyled
  // page that looks, from the outside, exactly like a bug in the app.
  if (!viteServer.config.plugins.some((plugin) => plugin.name.includes('tailwind'))) {
    throw new Error(
      'startDevServer loaded no Tailwind plugin: the app would be served unstyled and every geometry check would lie'
    );
  }
  await viteServer.listen();
  const address = viteServer.httpServer?.address();
  const port = typeof address === 'object' && address ? address.port : 4173;
  // The base comes from the config: `/` for `serve`, `/Mechatronics-Roadmap/` only for `build`. Hard-coding
  // the Pages path here meant the suites asked for a path the dev server only answered through its SPA
  // fallback, which is another way the missing config went unnoticed.
  const base = viteServer.config.base || '/';
  return { viteServer, baseUrl: `http://127.0.0.1:${port}${base}` };
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
    // A developer machine without the downloaded Playwright browsers still has a Chrome.
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
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
    // The predict-first gate has its own suite (`test:e2e:predict`); the runs in this one are about
    // the verdicts that follow a run, so the prompt is switched off here rather than answered 20 times.
    await context.addInitScript(() => {
      window.__mechalabPredictFirst = false;
    });
    // This suite is a returning visitor: it drives the workbench, and a first-run coach mark fixed over
    // the toolbar would swallow the header and toolbar presses it makes throughout.
    await seedTourSeen(context);
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

    // 0b. The header's trays are icons below 1536 px, so a control's name arrives on hover — and on
    //     focus, for a keyboard. One bubble, drawn only where the label is not written on the button,
    //     kept on its control by a scroll, and not drawn at all above 1536 px.
    const themeButton = page.getByTestId('btn-theme-toggle');
    const themeTip = await themeButton.getAttribute('data-tip');
    assert.match(themeTip ?? '', /^Theme\b/, 'the theme control must name itself in its tooltip');
    await themeButton.hover();
    await page.getByTestId('header-tip').waitFor({ state: 'visible', timeout: 3000 });
    assert.equal(
      (await page.getByTestId('header-tip').innerText()).trim(),
      themeTip,
      'hovering an icon-only control must show its name'
    );
    const [tipBox, buttonBox] = await Promise.all([
      page.getByTestId('header-tip').boundingBox(),
      themeButton.boundingBox(),
    ]);
    assert.ok(
      tipBox && buttonBox && tipBox.y >= buttonBox.y + buttonBox.height - 1,
      'the bubble must hang below the control it names, not over it'
    );
    assert.ok(
      tipBox && buttonBox && Math.abs(tipBox.x + tipBox.width / 2 - (buttonBox.x + buttonBox.width / 2)) < 40,
      'the bubble must be centred on its control'
    );
    await page.mouse.move(4, 420);
    await page.getByTestId('header-tip').waitFor({ state: 'detached', timeout: 3000 });
    // A scroll moves the bubble with its control rather than stranding it: the header is sticky, so
    // the name stays under the button it belongs to.
    await themeButton.hover();
    await page.getByTestId('header-tip').waitFor({ state: 'visible', timeout: 3000 });
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(200);
    const afterScroll = await page.getByTestId('header-tip').boundingBox();
    assert.ok(
      afterScroll && buttonBox && afterScroll.y >= buttonBox.y + buttonBox.height - 1,
      'a scroll must leave the bubble on the control it names'
    );
    // A keyboard bubble belongs to the focus until the Escape ends it.
    await themeButton.focus();
    assert.equal(
      (await page.getByTestId('header-tip').innerText()).trim(),
      themeTip,
      'focus must name the control too, not only the pointer'
    );
    await page.keyboard.press('Escape');
    await page.getByTestId('header-tip').waitFor({ state: 'detached', timeout: 3000 });
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.waitForTimeout(250);
    await themeButton.hover();
    await page.waitForTimeout(250);
    assert.equal(
      await page.getByTestId('header-tip').count(),
      0,
      'a control whose label is written on it must not grow a bubble'
    );
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(250);
    // Leave the page where the rest of the suite expects it.
    await page.evaluate(() => window.scrollTo(0, 0));
    console.log('  ok an icon-only header control names itself on hover and on focus');

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
    await clickToolbar(page, 'btn-reset-starter');

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
    const logged = await waitForBulk(page, LOG_KEY, (events) =>
      Array.isArray(events) && events.some((e) => e.kind === 'run' && e.lesson === 'P.6')
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
    // 3a. The failure is read, not only printed: the card names the line and offers to put the cursor
    //     on it. `def broken_syntax(` is line 1 and `    x = ` line 2, so the frame must be one of the
    //     two, and pinning it exactly is what makes the button worth having.
    const syntaxCard = page.getByTestId('traceback-card');
    await syntaxCard.waitFor({ timeout: 15000 });
    const syntaxFrame = (await page.getByTestId('traceback-frame').textContent())?.trim() ?? '';
    const syntaxLine = Number(syntaxFrame.match(/line (\d+)/)?.[1]);
    assert.ok(
      syntaxLine === 1 || syntaxLine === 2,
      `the card must name the line the syntax error is on; it said: ${syntaxFrame}`
    );
    await page.getByTestId('btn-reveal-error-line').click();
    const cursor = await page.evaluate((line) => {
      const bridge = window.__mechalabEditors['editor-main'];
      const text = bridge.get();
      const start = text.split('\n').slice(0, line - 1).join('\n').length + (line > 1 ? 1 : 0);
      return { at: bridge.getCursor(), start };
    }, syntaxLine);
    assert.equal(cursor.at, cursor.start, 'Show line N must put the cursor at the start of that line');
    assert.match(
      (await page.getByTestId('error-index-missing').textContent()) ?? '',
      /docs\/ERROR_EXPLAINER\.md/,
      'a SyntaxError is not one of the index entries, and the card must say so instead of guessing'
    );
    console.log(`  ok a syntax error names line ${syntaxLine}, moves the cursor there, and is honest about the index`);

    // 3b. A runtime error is parsed for frames, and a failure the page does document is matched: the
    //     ZeroDivisionError entry names only the class, so it must be claimed; a NameError is not in the
    //     index at all, and claiming an entry for it would be the wrong diagnosis offered confidently.
    await setEditorCode(page, 'print(1 / 0)\n');
    await page.getByTestId('btn-run-verify').click();
    await page.getByTestId('status-execution-error').waitFor({ timeout: 15000 });
    await page.getByTestId('error-index-entry').waitFor({ timeout: 15000 });
    assert.match(
      (await page.getByTestId('traceback-exception').textContent()) ?? '',
      /ZeroDivisionError: division by zero/,
      'the card must carry the exception line, not the traceback header'
    );
    assert.match(
      (await page.getByTestId('traceback-frame').textContent()) ?? '',
      /line 1/,
      'a top-level division by zero is on line 1 of the learner’s file'
    );
    assert.match(
      (await page.getByTestId('error-index-entry').textContent()) ?? '',
      /#3 ·/,
      'ZeroDivisionError must match the explainer entry that names the class'
    );
    assert.ok(
      (await page.getByTestId('error-index-check').count()) >= 2,
      'the matched entry must bring the page’s own check-first list, not only its title'
    );
    console.log('  ok a ZeroDivisionError names its line and brings the index entry that answers it');

    await setEditorCode(page, 'print(undefined_name)\n');
    await page.getByTestId('btn-run-verify').click();
    await page.getByTestId('error-index-missing').waitFor({ timeout: 15000 });
    assert.match(
      (await page.getByTestId('traceback-exception').textContent()) ?? '',
      /NameError: name 'undefined_name' is not defined/,
      'the card must print Python’s own words for a failure the index does not cover'
    );
    console.log('  ok a NameError is named by the card and left outside the index');

    // 3c. Ask for help: the failed run as one message. The report is offered only after a run that
    //     did not pass, it says what the card says, and the two doors are a clipboard write and
    //     GitHub's own new-issue form — nothing leaves the page until the learner sends it.
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: new URL(baseUrl).origin,
    });
    const askHelp = page.getByTestId('btn-ask-help');
    await askHelp.waitFor({ timeout: 5000 });
    await askHelp.click();
    await page.getByTestId('help-sheet').waitFor({ timeout: 5000 });
    const reportText = (await page.getByTestId('help-preview').innerText()).replace(/\s+/g, ' ');
    assert.match(reportText, /# Stuck on P\.\d+ · /, `the report must name the lesson; read: ${reportText.slice(0, 160)}`);
    assert.ok(
      reportText.includes("NameError: name 'undefined_name' is not defined"),
      'the report must carry Python\u2019s own last line'
    );
    assert.ok(reportText.includes('print(undefined_name)'), 'the report must carry the code that failed');
    assert.match(reportText, /\*\*Verdict:\*\* ERROR · Syntax \/ Runtime Error/, reportText.slice(0, 200));
    assert.match(
      reportText,
      /Hints opened:\*\* \d+ of \d+/,
      'it must say how much of the ladder is open, and only that'
    );

    // The question is the one thing the run cannot say, and it goes into the message as it is typed.
    await page.getByTestId('help-question').fill('I expected it to print 1.');
    await page.waitForFunction(
      () =>
        (document.querySelector('[data-testid="help-preview"]')?.textContent ?? '').includes(
          'I expected it to print 1.'
        ),
      undefined,
      { timeout: 5000 }
    );

    await page.getByTestId('btn-copy-help').click();
    await page.waitForFunction(
      () => /Copied/.test(document.querySelector('[data-testid="help-status"]')?.textContent ?? ''),
      undefined,
      { timeout: 5000 }
    );
    const copiedReport = await page.evaluate(() => navigator.clipboard.readText());
    assert.ok(
      copiedReport.includes('I expected it to print 1.') && copiedReport.includes('print(undefined_name)'),
      'the clipboard must hold the whole report, question and code included'
    );
    assert.ok(
      copiedReport.length <= 4000,
      `a report past 4,000 characters is one a chat client cuts; got ${copiedReport.length}`
    );

    const issueHref = await page.getByTestId('btn-open-help-issue').getAttribute('href');
    const issueUrl = new URL(issueHref ?? '');
    assert.equal(
      `${issueUrl.origin}${issueUrl.pathname}`,
      'https://github.com/TLE47/Mechatronics-Roadmap/issues/new',
      'the issue door must be GitHub\u2019s own new-issue form for this repository'
    );
    assert.match(issueUrl.searchParams.get('title') ?? '', /^Stuck on P\.\d+ · /);
    assert.ok(
      (issueUrl.searchParams.get('body') ?? '').includes('I expected it to print 1.'),
      'the pre-filled body must be the report the learner just read'
    );
    await page.keyboard.press('Escape');
    await page.getByTestId('help-sheet').waitFor({ state: 'detached', timeout: 5000 });
    console.log('  ok a failed run becomes a report: the lesson, the code, the error, and a question');

    await page.getByTestId('lesson-item-P.6').click();

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
    // The verdict is announced for a screen reader as well as drawn: the sentence starts with the
    // outcome, so it is useful the moment a live region interrupts.
    assert.match(
      (await page.getByTestId('run-announcement').textContent()) ?? '',
      /^Lesson .+ passed:/,
      'a passing run must announce its verdict first'
    );

    // 5b. Inline values: the names the run bound, drawn beside the line that bound them. The values
    //     come from the run's own namespace, so they cannot be from an earlier attempt, and they
    //     belong to the *last* top-level assignment (the one still holding a value when it ended).
    await page.waitForFunction(
      () => window.__mechalabEditors['editor-main'].inlineValues().length > 0,
      undefined,
      { timeout: 5000 }
    );
    const inlineValues = await page.evaluate(() =>
      window.__mechalabEditors['editor-main'].inlineValues()
    );
    const byName = Object.fromEntries(inlineValues.map((entry) => [entry.name, entry.value]));
    // P.6's solution computes two distances with a function and imports `math`.
    assert.equal(
      byName.d1,
      '5.0',
      `the value drawn must be the one this run computed (got ${JSON.stringify(byName)})`
    );
    assert.equal(byName.d2, '1.0', 'both computed names must be drawn');
    assert.equal(
      byName.distance_2d,
      undefined,
      'a function is not data: it has no value to draw beside its definition'
    );
    assert.equal(byName.math, undefined, 'an imported module is not a value either');
    assert.equal(
      inlineValues.length,
      Object.keys(byName).length,
      'one chip per name: the last binding, not one per assignment line'
    );
    assert.equal(
      await page.evaluate(() =>
        document.querySelectorAll('.cm-inline-value[data-inline-name="d1"]').length
      ),
      1,
      'the chip must be drawn in the document, with its name on the element'
    );
    // An edit makes the values describe code that is gone, so the editor clears them itself.
    await setEditorCode(page, `${await getEditorCode(page)}\n# edit\n`);
    await page.waitForFunction(
      () => window.__mechalabEditors['editor-main'].inlineValues().length === 0,
      undefined,
      { timeout: 5000 }
    );
    console.log('  ok a run draws its values beside their lines, and an edit clears them');

    // 5c. Symbol linking: F12 on a name puts the cursor on the line that defines it, and the name is
    //     read from the solution rather than hard-coded, so this does not depend on which function
    //     P.6 happens to ship.
    const symbolText = await getEditorCode(page);
    const defMatch = /^def ([A-Za-z_]\w*)\(/m.exec(symbolText);
    assert(defMatch, 'the loaded solution must define a function to jump to');
    const symbolName = defMatch[1];
    const defLineStart = symbolText.lastIndexOf('\n', defMatch.index) + 1;
    const callIndex = symbolText.indexOf(symbolName, defMatch.index + defMatch[0].length);
    assert(callIndex > 0, `the solution must also call ${symbolName}`);
    await page.evaluate((pos) => window.__mechalabEditors['editor-main'].setCursor(pos), callIndex + 1);
    await page.keyboard.press('F12');
    assert.equal(
      await page.evaluate(() => window.__mechalabEditors['editor-main'].getCursor()),
      defLineStart,
      `F12 on a call must put the cursor on the def of ${symbolName}`
    );
    // The mouse gesture is the same jump: Ctrl-click (Meta-click on a Mac) on the call, from
    // somewhere else in the file, lands on the definition too. The call line is scrolled into view
    // first, because a click has to land on a pixel and `coordsOf` answers null off screen.
    const callLine = symbolText.slice(0, callIndex).split('\n').length;
    await page.evaluate((line) => window.__mechalabEditors['editor-main'].revealLine(line), callLine);
    // The editor scrolled its own scroller; the page still has to put the panel under the pointer.
    await page.locator('[data-editor="editor-main"]').scrollIntoViewIfNeeded();
    // Centred, not merely on screen: a line at the bottom edge of a 720 px viewport sits under the
    // pass toast from the run before this one, and `elementFromPoint` then answers the toast — a
    // click that never reaches the editor, which is a property of where the line is, not of the jump.
    await page.evaluate(() => {
      document
        .querySelector('[data-editor="editor-main"] .cm-line.cm-activeLine')
        ?.scrollIntoView({ block: 'center', inline: 'nearest' });
    });
    await page.waitForTimeout(150);
    // The mouse gesture: a Ctrl-mousedown on the name, aimed at the middle of the word's own glyphs
    // (a Range over the line's text node, which is the line `revealLine` just made active). Dispatched
    // in the page rather than replayed through the driver because only the page knows where a
    // character sits after the editor scrolled itself, and `defaultPrevented` is then the app's own
    // answer to "the handler took this gesture".
    const clickResult = await page.evaluate((word) => {
      const line = document.querySelector('[data-editor="editor-main"] .cm-line.cm-activeLine');
      if (!line) return null;
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const at = node.textContent.indexOf(word);
        if (at < 0) continue;
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + word.length);
        const box = range.getBoundingClientRect();
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        const target = document.elementFromPoint(x, y);
        if (!target) return null;
        const event = new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          button: 0,
          clientX: x,
          clientY: y,
        });
        target.dispatchEvent(event);
        return { took: event.defaultPrevented, target: String(target.className ?? '').slice(0, 24) };
      }
      return null;
    }, symbolName);
    assert(clickResult, 'the call must be rendered for a click to land on it');
    assert.equal(clickResult.took, true, `a Ctrl-mousedown on ${symbolName} must be handled by the editor`);
    assert.equal(
      await page.evaluate(() => window.__mechalabEditors['editor-main'].getCursor()),
      defLineStart,
      '⌘-click / Ctrl-click on a call must be the same jump'
    );
    console.log(`  ok F12 and Ctrl-click on ${symbolName} land on its definition`);

    // 5c-i. Across the lesson's files: a name this file imports is defined in the read-only plant,
    //       so the jump opens that tab and puts the cursor on the `def` line there. The exercise is
    //       the one the formatting suite already opens, so a plant-using lesson is known to exist.
    await page.getByTestId('lesson-item-EX.05-control.T2.05a').scrollIntoViewIfNeeded();
    await page.getByTestId('lesson-item-EX.05-control.T2.05a').click();
    await page.getByTestId('editor-tab-mechalab_plant.py').waitFor({ timeout: 10000 });
    const crossCode = 'from mechalab_plant import fk\n\nprint(fk(0.1, 0.2))\n';
    await setEditorCode(page, crossCode);
    await page.evaluate(() =>
      window.__mechalabEditors['editor-main'].setCursor('from mechalab_plant import fk\n\nprint('.length + 1)
    );
    await page.keyboard.press('F12');
    await page.waitForFunction(() => Boolean(window.__mechalabEditors['editor-helper']), undefined, {
      timeout: 15000,
    });
    assert.equal(
      await page.getByTestId('editor-tab-mechalab_plant.py').getAttribute('aria-selected'),
      'true',
      'a definition in the helper file must open the helper tab'
    );
    const plantText = await page.evaluate(() => window.__mechalabEditors['editor-helper'].get());
    const plantDef = /^def fk\(/m.exec(plantText);
    assert(plantDef, 'the plant must define fk');
    assert.equal(
      await page.evaluate(() => window.__mechalabEditors['editor-helper'].getCursor()),
      plantText.lastIndexOf('\n', plantDef.index) + 1,
      'the helper tab must open on the line that defines the name'
    );
    console.log('  ok a name defined in the read-only plant opens its tab on the def');

    // 5c-ii. Nothing to jump to is said, not silent: the import's module name is not a definition
    //        in either file, so the file strip names the miss and the tab does not change.
    await page.getByTestId('editor-tab-main').click();
    await page.evaluate(() => window.__mechalabEditors['editor-main'].setCursor(6));
    await page.keyboard.press('F12');
    await page.getByTestId('symbol-miss').waitFor({ timeout: 5000 });
    assert.match(
      (await page.getByTestId('symbol-miss').textContent()) ?? '',
      /no definition for\s*mechalab_plant/,
      'a name nothing defines must be named, not silently ignored'
    );
    assert.equal(
      await page.getByTestId('editor-tab-main').getAttribute('aria-selected'),
      'true',
      'a miss must not switch files'
    );
    console.log('  ok a name nothing defines is named in the file strip');

    // 5d. Layout presets: ⌥1–⌥4 decide which regions the screen gives its width to, the buttons say
    //     which one is on, and the choice outlives a reload. The shortcut is read from `event.code`,
    //     because ⌥2 types ™ in `event.key` on a Mac.
    const visible = (testid) => page.getByTestId(testid).isVisible();
    assert.equal(await visible('lesson-list-card'), true, 'Study shows the chooser rail');
    assert.equal(await visible('lesson-reader'), true, 'Study shows the lesson text');
    assert.equal(await visible('editor-panel'), true, 'Study shows the editor');
    assert.equal(await visible('results-panel'), true, 'Study shows the results');
    // The pane's own start: the lesson text is fetched, and a heading from the page is in the DOM.
    await page.getByTestId('reader-loading').waitFor({ state: 'detached', timeout: 10000 });
    assert.ok(
      await page.locator('[data-testid="lesson-reader"] h2').first().isVisible(),
      'the reading pane must render the page, not just its card'
    );
    assert.equal(
      await page.getByTestId('link-lesson-source').textContent(),
      'View source on GitHub ↗',
      'the GitHub link is the source link now, not the reading copy'
    );
    assert.equal(
      await page.getByTestId('layout-study').getAttribute('aria-pressed'),
      'true',
      'the preset in force must say so'
    );
    await page.keyboard.press('Alt+2');
    assert.equal(await visible('lesson-list-card'), false, '⌥2 hides the chooser');
    assert.equal(await visible('lesson-reader'), false, '⌥2 hides the lesson text');
    assert.equal(await visible('results-panel'), false, '⌥2 hides the last run’s output');
    assert.equal(await visible('editor-panel'), true, '⌥2 keeps the editor');
    assert.equal(
      await page.getByTestId('layout-write').getAttribute('aria-pressed'),
      'true',
      'the button must follow the shortcut'
    );
    await page.keyboard.press('Alt+3');
    assert.equal(await visible('editor-panel'), false, '⌥3 hides the editor');
    assert.equal(await visible('results-panel'), false, '⌥3 hides the results');
    assert.equal(await visible('lesson-reader'), true, '⌥3 is the reading preset: the text stays');
    assert.equal(await visible('lesson-list-card'), false, '⌥3 keeps the chooser hidden');
    // Read is a click here, so the button path is pinned as well as the shortcut.
    await page.getByTestId('layout-read').click();
    assert.equal(await visible('editor-panel'), false, 'the Read button hides the editor');
    assert.equal(await visible('lesson-reader'), true, 'the Read button keeps the lesson text');
    await page.reload({ waitUntil: 'networkidle' });
    await waitForEditor(page, 'editor-main');
    assert.equal(await visible('editor-panel'), false, 'a remembered preset survives the reload');
    assert.equal(
      await page.getByTestId('layout-read').getAttribute('aria-pressed'),
      'true',
      'the remembered preset is the one the buttons report'
    );
    // ⌥4 is the arrangement a traceback is read in: the editor and the results beside each other,
    // not stacked. Pinned as a real two-column grid, because a preset that only stopped hiding the
    // results would look identical while scrolling between them.
    await page.keyboard.press('Alt+1');
    assert.equal(await visible('editor-panel'), true, '⌥1 brings the editor back');
    assert.equal(await visible('lesson-list-card'), true, '⌥1 brings the chooser back');
    assert.equal(await visible('lesson-reader'), true, '⌥1 brings the lesson text back');
    assert.equal(await visible('results-panel'), true, '⌥1 brings the results back');
    // Utility classes have no rules in this dev server (it resolves the config without the Tailwind
    // plugin), so anything asserted here is either markup or a rule from `index.css`. The split
    // columns are the latter now, which is why they can be measured below; the utilities themselves
    // are still only checked in the built bundle — `scripts/e2e_pages_bundle.mjs`.
    assert.equal(
      await page.getByTestId('layout-study').getAttribute('aria-pressed'),
      'true',
      'Study is the preset in force before Debug'
    );
    await page.keyboard.press('Alt+4');
    assert.equal(
      await page.getByTestId('layout-debug').getAttribute('aria-pressed'),
      'true',
      'the Debug button must follow the shortcut'
    );
    assert.equal(await visible('lesson-list-card'), false, '⌥4 hides the chooser');
    assert.equal(await visible('lesson-reader'), false, '⌥4 hides the lesson text');
    assert.equal(await visible('editor-panel'), true, '⌥4 keeps the editor');
    assert.equal(await visible('results-panel'), true, '⌥4 keeps the results');
    // Debug's two columns are a grid on this container, and the editor comes first in the DOM so the
    // second column is the results. The columns are a media query in `index.css`, not a utility
    // class (the split needs 1760 px, which is not a Tailwind step), so they are measured rather than
    // matched as a string: that also pins the stacked case below the split, which is what a phone
    // gets. The viewport is widened for the wide reading and put back immediately.
    const arrangement = () =>
      page.evaluate(() => {
        const box = document.querySelector('[data-layout]');
        const editor = document.querySelector('[data-testid="editor-panel"]');
        // The column, not the results card: the CSS places the column, and the card inside it can sit
        // below a predict gate or a share banner of its own.
        const column = document.querySelector('[data-testid="results-column"]');
        const e = editor.getBoundingClientRect();
        const r = column.getBoundingClientRect();
        return {
          layout: box.getAttribute('data-layout'),
          columns: getComputedStyle(box).gridTemplateColumns,
          sideBySide: Math.abs(e.top - r.top) < 60 && r.left > e.left + 120,
          stacked: r.top > e.bottom - 60 && Math.abs(r.left - e.left) < 40,
          editorFirst: !!(editor.compareDocumentPosition(column) & Node.DOCUMENT_POSITION_FOLLOWING),
        };
      });

    const narrow = await arrangement();
    assert.equal(narrow.layout, 'debug', 'the work area must report the Debug preset');
    assert.equal(narrow.stacked, true, 'below the split width the editor and the results stack, full width');
    assert.equal(narrow.editorFirst, true, 'the editor comes first, so the results are read after it');

    await page.setViewportSize({ width: 1800, height: 1100 });
    await page.waitForTimeout(250);
    const wide = await arrangement();
    assert.equal(wide.sideBySide, true, 'from the split width up the editor and the results share a row');
    assert.match(wide.columns, /^[\d.]+px [\d.]+px$/, 'the split must be two measured tracks');
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(250);
    await page.getByTestId('layout-study').click();
    assert.equal(await visible('lesson-list-card'), true, 'the Study button comes back');
    console.log('  ok ⌥1–⌥4 choose the regions and their arrangement, and the choice is remembered');

    // 5d-ii. Docking: one button, and it names the panel this preset can move. Debug moves the
    //        results to the other side of the editor; Study moves the lesson text to the other side
    //        of the work area; Write and Read have nothing beside anything, so they show no button.
    //        The side is a preference like the preset, so it has to outlive a reload.
    await page.keyboard.press('Alt+4');
    const dockButton = page.getByTestId('btn-dock-toggle');
    assert.match(
      (await dockButton.textContent()) ?? '',
      /Results\s*→\s*Left/,
      'Debug must offer to move the results left'
    );
    await dockButton.click();
    const dockedDebug = await page.evaluate(() => {
      const box = document.querySelector('[data-layout]');
      const divider = document.querySelector('[data-testid="split-divider"]');
      return {
        dock: box.getAttribute('data-dock'),
        side: divider.getAttribute('data-side'),
        handleOnTheRight: divider.classList.contains('-right-3'),
        label: document.querySelector('[data-testid="btn-dock-toggle"]')?.textContent ?? '',
      };
    });
    assert.equal(dockedDebug.dock, 'left', 'the docked side must be reported by the work area');
    assert.equal(dockedDebug.side, 'left', 'the divider must know which edge it sits on');
    assert.equal(dockedDebug.handleOnTheRight, true, 'a results column on the left puts the handle on its right edge');
    assert.match(dockedDebug.label, /Results\s*→\s*Right/, 'the button must offer the way back');
    await page.reload({ waitUntil: 'networkidle' });
    await waitForEditor(page, 'editor-main');
    assert.equal(
      await page.evaluate(() => document.querySelector('[data-layout]').getAttribute('data-dock')),
      'left',
      'a docked results column must survive the reload'
    );
    await page.getByTestId('btn-dock-toggle').click();
    assert.equal(
      await page.evaluate(() => document.querySelector('[data-layout]').getAttribute('data-dock')),
      'right',
      'the way back must work too'
    );

    await page.getByTestId('layout-study').click();
    assert.match(
      (await page.getByTestId('btn-dock-toggle').textContent()) ?? '',
      /Lesson\s*→\s*Right/,
      'Study must offer to move the lesson text right'
    );
    await page.getByTestId('btn-dock-toggle').click();
    assert.equal(
      await page.evaluate(() => document.querySelector('[data-layout]').getAttribute('data-lesson-dock')),
      'right',
      'the lesson text must report the side it was moved to'
    );
    await page.reload({ waitUntil: 'networkidle' });
    await waitForEditor(page, 'editor-main');
    assert.equal(
      await page.evaluate(() => document.querySelector('[data-layout]').getAttribute('data-lesson-dock')),
      'right',
      'a docked lesson pane must survive the reload'
    );
    await page.getByTestId('btn-dock-toggle').click();
    assert.equal(
      await page.evaluate(() => document.querySelector('[data-layout]').getAttribute('data-lesson-dock')),
      'left',
      'the lesson text comes back to the left'
    );
    await page.keyboard.press('Alt+2');
    assert.equal(
      await page.getByTestId('btn-dock-toggle').count(),
      0,
      'Write has nothing beside anything, so it must not draw a dock button'
    );
    await page.keyboard.press('Alt+3');
    assert.equal(
      await page.getByTestId('btn-dock-toggle').count(),
      0,
      'Read has nothing beside anything either'
    );
    await page.getByTestId('layout-study').click();
    console.log('  ok docking moves the panel this preset can move, and the side is remembered');

    // 5e. `# %%` cells: a marker draws a "Run to here" button, and the button runs the document
    //     *through* that cell and no further — ungraded, so it neither verifies the lesson nor
    //     changes the hint ladder. The preamble above the first marker has no button of its own.
    await setEditorCode(
      page,
      'x = 2\n\n# %% Use it\nprint(x * 3)\n\n# %% After\nprint("never")\n'
    );
    await page.getByTestId('cell-run-1').waitFor({ timeout: 5000 });
    assert.equal(
      await page.getByTestId('cell-run-0').count(),
      0,
      'the preamble above the first marker is not a cell with a button'
    );
    assert.equal(
      await page.getByTestId('cell-run-2').count(),
      1,
      'every marker gets its own button'
    );
    await page.getByTestId('cell-run-1').click();
    await page.waitForFunction(
      () => (document.querySelector('[data-testid="pre-actual-stdout"]')?.textContent ?? '').trim() === '6',
      undefined,
      { timeout: 20000 }
    );
    assert.equal(
      (await page.getByTestId('badge-behavior-check').textContent())?.includes('UNTESTED'),
      true,
      'a cell run grades nothing: the behavior badge must stay untested'
    );
    assert.equal(
      (await page.getByTestId('runner-verified-count').textContent())?.trim(),
      verified(1),
      'a cell run must never verify the lesson'
    );
    // The cell after it did not run: "run to here" means through this cell, not through the file.
    await page.getByTestId('cell-run-2').click();
    await page.waitForFunction(
      () => (document.querySelector('[data-testid="pre-actual-stdout"]')?.textContent ?? '').includes('never'),
      undefined,
      { timeout: 20000 }
    );
    // No markers, no buttons: every other lesson in the registry is untouched.
    await setEditorCode(page, 'print(1)\n');
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid^="cell-run-"]').length === 0,
      undefined,
      { timeout: 5000 }
    );
    console.log('  ok # %% cells run to here, ungraded, and leave files without markers alone');

    // 5f. A try-it block — a lesson page's `<!-- try -->` fence — arrives as `?lesson=…#try=…`. It
    //     opens the snippet in a *scratch* editor: Run prints what the snippet prints, nothing is
    //     graded, and nothing about it becomes the lesson's draft, so a reload without the fragment
    //     opens the work the learner already had (`app/src/tryLink.ts`).
    const tryLesson = 'P.1';
    const tryCode = 'total = 0\nfor n in (2, 3, 5):\n    total += n\nprint(total)\n';
    const tryPayload = Buffer.from(JSON.stringify({ v: 1, lesson: tryLesson, code: tryCode })).toString(
      'base64url'
    );
    await page.goto(`${baseUrl}?lesson=${tryLesson}#try=${tryPayload}`, { waitUntil: 'networkidle' });
    await waitForEditor(page);
    assert.equal(await page.getByTestId('scratch-banner').isVisible(), true, 'a try link must open scratch');
    assert.equal(
      (await getEditorCode(page)).trim(),
      tryCode.trim(),
      'the page’s own snippet must be the text in the editor'
    );
    await page.getByTestId('btn-run-verify').click();
    await page.waitForFunction(
      () => (document.querySelector('[data-testid="pre-actual-stdout"]')?.textContent ?? '').trim() === '10',
      undefined,
      { timeout: 20000 }
    );
    assert.equal(
      (await page.getByTestId('badge-behavior-check').textContent())?.includes('UNTESTED'),
      true,
      'a scratch run grades nothing: the behavior badge must stay untested'
    );
    assert.equal(
      (await page.getByTestId('runner-verified-count').textContent())?.trim(),
      verified(1),
      'a page’s snippet must never verify the lesson'
    );
    await page.getByTestId('btn-end-scratch').click();
    assert.equal(await page.getByTestId('scratch-banner').count(), 0, 'the banner’s button must leave scratch');
    const afterScratch = await getEditorCode(page);
    assert.equal(afterScratch.includes('total = 0'), false, 'leaving scratch must restore the learner’s text');
    await page.goto(`${baseUrl}?lesson=${tryLesson}`, { waitUntil: 'networkidle' });
    await waitForEditor(page);
    assert.equal(
      (await getEditorCode(page)).trim(),
      afterScratch.trim(),
      'a reload must reopen the same draft: scratch wrote nothing to the store'
    );
    console.log('  ok a try-it link opens scratch, runs ungraded, and saves nothing');

    // 5g. Vim keys: off until asked for, remembered when asked, and the badge says which mode is
    //     reading the keystrokes. Both halves matter — with normal mode on and nothing on screen, a
    //     learner who types `i` and sees no text would decide the editor is broken
    //     (`app/src/vimMode.ts`, `pythonEditorImpl.tsx`).
    assert.equal(await page.getByTestId('vim-mode').count(), 0, 'vim keys must be off until asked for');
    await clickToolbar(page, 'btn-vim');
    assert.equal(
      await page.getByTestId('btn-vim').getAttribute('aria-pressed'),
      'true',
      'the control must report that the keys are on'
    );
    // The plugin is a chunk of its own, fetched on this press: the badge appears when it has arrived.
    await page.getByTestId('vim-mode').waitFor({ timeout: 15000 });
    assert.equal((await page.getByTestId('vim-mode').textContent())?.trim(), 'NORMAL');
    const vimText = 'a = 1\nb = 2\nprint(a + b)'; // the newline is the editor's to add
    await setEditorCode(page, `${vimText}\n`);
    // Prove the text is in the editor that is live *now*, and put the caret on line 1: `dd` deletes
    // the line the caret is on, so a caret left at the end of a replaced document would delete the
    // last line and this step would report a timeout instead of the state it found.
    const vimArmed = await page.evaluate(() => {
      const bridge = window.__mechalabEditors['editor-main'];
      if (!bridge) return null;
      bridge.focus();
      bridge.setCursor(0);
      return bridge.get();
    });
    assert.equal(vimArmed?.trim(), vimText, 'the editor must hold the text the keystrokes are about');
    await page.keyboard.press('Escape');
    // `type`, not two `press` round trips: a pending Vim operator waits for its second key, and two
    // separate protocol calls is exactly the gap a loaded runner can widen.
    await page.keyboard.type('dd');
    // 30 s: the plugin chunk and the re-render it triggers are the slow part under the matrix, and the
    // control-pair sweep now runs on two workers in this lane, so two more pages are loading while
    // this one waits. The wait is a readiness gate, not the claim - the claim is the text below, and
    // it is asserted unchanged. (It was 15 s when this lane carried one page per suite.)
    await page.waitForFunction(
      () => (window.__mechalabEditors['editor-main'].get() ?? '').startsWith('b = 2'),
      undefined,
      { timeout: 30000 }
    );
    assert.equal(
      (await getEditorCode(page)).trim(),
      'b = 2\nprint(a + b)',
      '`dd` in normal mode must delete the line, not insert the letter'
    );
    await page.keyboard.press('i');
    await page.waitForFunction(
      () => (document.querySelector('[data-testid="vim-mode"]')?.textContent ?? '').trim() === 'INSERT',
      undefined,
      { timeout: 5000 }
    );
    await page.keyboard.type('x');
    assert.equal(
      (await getEditorCode(page)).startsWith('xb = 2'),
      true,
      '`i` then a character must insert where the caret is'
    );
    await page.keyboard.press('Escape');
    await page.waitForFunction(
      () => (document.querySelector('[data-testid="vim-mode"]')?.textContent ?? '').trim() === 'NORMAL',
      undefined,
      { timeout: 5000 }
    );
    // Remembered: the reload is the whole point of storing it.
    await page.reload({ waitUntil: 'networkidle' });
    await waitForEditor(page);
    assert.equal(
      await page.getByTestId('btn-vim').getAttribute('aria-pressed'),
      'true',
      'the choice must survive a reload'
    );
    await page.getByTestId('vim-mode').waitFor({ timeout: 15000 });
    // Off again: the badge goes, and a keystroke is a keystroke. The editor is the same editor — the
    // document, the caret and the undo history were never rebuilt for the toggle.
    await clickToolbar(page, 'btn-vim');
    assert.equal(await page.getByTestId('vim-mode').count(), 0, 'turning the keys off must drop the badge');
    await setEditorCode(page, 'print(1)\n');
    await page.evaluate(() => {
      const editor = window.__mechalabEditors['editor-main'];
      editor.setCursor(0);
      editor.focus();
    });
    await page.keyboard.type('Z');
    assert.equal(
      (await getEditorCode(page)).startsWith('Zprint(1)'),
      true,
      'with the keys off, typing must type without a mode to enter'
    );
    // Leave the draft where 5f found it: the rest of the suite reads this lesson.
    await setEditorCode(page, afterScratch);
    console.log('  ok vim keys: dd deletes, the badge names the mode, and the choice survives a reload');

    // 5h. The run trace: every line the last run executed, replayed step by step with the values its
    //     frame held. This is not a live debugger — the panel says so in a sentence — but "why did
    //     this loop do that?" is answered by walking the recording (`app/src/runTrace.ts`). Run as a
    //     cell so nothing is graded, logged or filed: the replay is the subject here.
    const traceCode = '# %% loop\ntotal = 0\nfor n in (2, 3):\n    total = total + n\nprint(total)\n';
    await setEditorCode(page, traceCode);
    await page.getByTestId('cell-run-0').waitFor({ timeout: 5000 });
    await page.getByTestId('cell-run-0').click();
    await page.waitForFunction(
      () => (document.querySelector('[data-testid="pre-actual-stdout"]')?.textContent ?? '').trim() === '5',
      undefined,
      { timeout: 20000 }
    );
    await page.getByTestId('trace-panel').waitFor({ timeout: 10000 });
    // One step per executed line: the assignment, the `for` three times (two passes and the test
    // that ended it), the body twice, the print. The `# %%` marker is a comment and runs nothing.
    const traceSteps = Number(await page.getByTestId('trace-panel').getAttribute('data-trace-steps'));
    assert.equal(traceSteps, 7, `the trace must hold one step per line that ran, got ${traceSteps}`);
    assert.equal((await page.getByTestId('trace-summary').textContent())?.trim(), '7 steps');
    assert.equal(
      (await page.getByTestId('trace-step-label').textContent())?.includes('step 1 of 7 · line 2'),
      true,
      'a trace opens on the first line the program ran, not on line 1 of the file'
    );
    assert.equal(
      (await page.getByTestId('trace-code').textContent())?.trim(),
      'total = 0',
      'the panel quotes the line that ran'
    );
    assert.equal(
      (await page.getByTestId('trace-prev').isDisabled()),
      true,
      'the first step has nowhere to go back to'
    );
    // Two steps on is the loop's body: `n` is 2 and `total` is still 0 at the moment it runs.
    await page.getByTestId('trace-next').click();
    await page.getByTestId('trace-next').click();
    assert.equal(
      (await page.getByTestId('trace-step-label').textContent())?.includes('line 4'),
      true,
      'stepping forward moves one executed line at a time'
    );
    const stepValues = (await page.getByTestId('trace-values').textContent()) ?? '';
    assert.equal(stepValues.includes('n'), true, 'the step carries the frame\u2019s own names');
    assert.equal(stepValues.includes('total'), true, 'and the accumulator it is about to add to');
    assert.equal(
      (await page.getByTestId('trace-code').textContent())?.trim(),
      'total = total + n',
      'the quoted line follows the step'
    );
    // The end of the recording: the range takes End, so a keyboard reader can reach the last step.
    await page.getByTestId('trace-range').focus();
    await page.keyboard.press('End');
    await page.waitForFunction(
      () =>
        (document.querySelector('[data-testid="trace-step-label"]')?.textContent ?? '').includes(
          'step 7 of 7'
        ),
      undefined,
      { timeout: 5000 }
    );
    assert.equal(
      (await page.getByTestId('trace-code').textContent())?.trim(),
      'print(total)',
      'the last step is the last line the program ran'
    );
    assert.equal(
      (await page.getByTestId('trace-next').isDisabled()),
      true,
      'the last step has nowhere to go forward to'
    );
    // Show line puts the caret on the line that step ran, in the learner's own file.
    await page.getByTestId('trace-show-line').click();
    const caret = await page.evaluate(() => window.__mechalabEditors['editor-main'].getCursor());
    assert.equal(
      caret,
      traceCode.indexOf('print(total)'),
      'Show line must put the cursor at the start of the step\u2019s line'
    );
    assert.equal(
      (await page.getByTestId('trace-panel').textContent())?.includes('this run has already finished'),
      true,
      'the panel says it is a recording of a finished run, so nobody waits for it to move'
    );
    // An edit does not take the recording away: the panel quotes the text the run executed, so it
    // still describes the program it saw. The next run replaces it (and a lesson switch clears it).
    await setEditorCode(page, traceCode + 'x = 1\n');
    assert.equal(
      (await page.getByTestId('trace-code').textContent())?.trim(),
      'print(total)',
      'the quoted line is the run\u2019s text, not whatever the editor holds now'
    );
    console.log('  ok the run trace replays the lines it ran, with their values, from the text it ran');

    // 5i. A breakpoint is a park that was placed, not one that was asked for. Clicking the gutter
    //     beside a line arms it (the dot is the click target), the run stops there without anyone
    //     reaching for Pause, and the choice is per lesson and survives a reload
    //     (`app/src/editor/breakpoints.ts`). F9 is the keyboard route: a gutter alone would be a
    //     mouse-only feature.
    const bpCode = '# %% bp\na = 1\nb = 2\nprint(a + b)\n';
    await setEditorCode(page, bpCode);
    await page.getByTestId('cell-run-0').waitFor({ timeout: 5000 });
    await page.getByTestId('breakpoint-slot-3').click();
    // The dot is drawn from React state one effect after the click, so the check waits for the
    // gutter to agree rather than for the click to return.
    const armed = (line) =>
      page.waitForFunction(
        (number) =>
          document.querySelector(`[data-testid="breakpoint-slot-${number}"]`)?.getAttribute('data-breakpoint') ===
          'on',
        line,
        { timeout: 5000 }
      );
    await armed(3);
    assert.equal(
      await page.getByTestId('breakpoint-slot-2').getAttribute('data-breakpoint'),
      'off',
      'a click must arm the line it landed on, not the whole gutter'
    );
    // Ungraded, so the park is the only side effect this run has.
    await page.getByTestId('cell-run-0').click();
    await page.getByTestId('paused-bar').waitFor({ timeout: 30000 });
    assert.equal(
      await page.getByTestId('paused-bar').getAttribute('data-paused-reason'),
      'breakpoint',
      'the bar must say the run stopped at a breakpoint, not that somebody pressed Pause'
    );
    assert.equal(
      (await page.getByTestId('paused-line').textContent())?.trim(),
      'b = 2',
      'the parked line must be the one the dot was put on'
    );
    await page.getByTestId('btn-continue').click();
    await page.waitForFunction(
      () => (document.querySelector('[data-testid="pre-actual-stdout"]')?.textContent ?? '').trim() === '3',
      undefined,
      { timeout: 20000 }
    );
    console.log('  ok a breakpoint parks the run on its line, and Continue finishes it');

    // F9 arms the caret's line. The caret is put on the `print` line, which the run has not reached
    // yet, so this dot is the keyboard's own doing rather than a leftover.
    await page.evaluate((source) => {
      const editor = window.__mechalabEditors['editor-main'];
      editor.setCursor(source.indexOf('print(a + b)'));
      editor.focus();
    }, bpCode);
    await page.keyboard.press('F9');
    await armed(4);
    assert.equal(
      (await page.getByTestId('breakpoint-slot-1').getAttribute('data-breakpoint')),
      'off',
      'F9 must arm the caret\u2019s line, not the first one'
    );

    // Per lesson, and remembered: the reload reads the list back and draws the dots on the restored
    // draft. Both lines were armed in this lesson's file, so both are still dots afterwards.
    await page.reload({ waitUntil: 'networkidle' });
    await waitForEditor(page);
    await armed(3);
    assert.equal(
      await page.getByTestId('breakpoint-slot-4').getAttribute('data-breakpoint'),
      'on',
      'a breakpoint placed with the keyboard must survive a reload too'
    );
    console.log('  ok breakpoints are remembered, and F9 arms the caret\u2019s line');

    // An edit above a dot carries it down with the statement it was placed on. The editor holds a
    // breakpoint as a document position and lets CodeMirror map it through the change; the runner is
    // told the line numbers it landed on, because those are what the next reload restores. A real
    // keystroke, not a document swap: a replacement re-seeds the dots from the lines instead of
    // mapping them (that is the Load Solution case).
    await page.evaluate(() => {
      const editor = window.__mechalabEditors['editor-main'];
      editor.setCursor(0);
      editor.focus();
    });
    await page.keyboard.type('z = 0');
    await page.keyboard.press('Enter');
    await armed(4);
    await armed(5);
    assert.equal(
      await page.getByTestId('breakpoint-slot-3').getAttribute('data-breakpoint'),
      'off',
      'a dot must move with its statement, not stay on the line number'
    );
    assert.equal(
      await page.evaluate(() => window.__mechalabEditors['editor-main'].get().split('\n')[3]),
      'b = 2',
      'line 4 still holds the statement the dot was placed on'
    );
    assert.deepEqual(
      // A stored entry is `{ line, condition }` now: the condition belongs to the dot, so it moves
      // with it. These two were armed without one, and this is where the shape is pinned.
      await page.evaluate(() =>
        Object.values(JSON.parse(localStorage.getItem('mechalab_breakpoints_v1') ?? '{}'))
          .flat()
          .map((entry) => (typeof entry === 'number' ? entry : entry.line))
      ),
      [4, 5],
      'the stored list must follow the edit too, because that is what the next reload restores'
    );
    console.log('  ok an edit above a breakpoint carries the dot with its statement');

    // Leave both the gutter and the draft as the rest of the suite expects them. The dots are on
    // lines 4 and 5 after the edit.
    await page.getByTestId('breakpoint-slot-4').click();
    await page.getByTestId('breakpoint-slot-5').click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="breakpoint-slot-4"]')?.getAttribute('data-breakpoint') ===
        'off',
      undefined,
      { timeout: 5000 }
    );
    await setEditorCode(page, afterScratch);

    // 6. CDN failure never awards verification (even with full solution loaded)
    await page.getByTestId('lesson-item-P.7').click();
    await clickToolbar(page, 'btn-load-solution');
    await page.evaluate(() => {
      // A refused connection, not an unresolvable host: the loader used to sit on DNS for ~10 s
      // before reporting the same 'could not be loaded' failure this asserts.
      window.__mechalabPyodideCdnUrl = 'http://127.0.0.1:1/pyodide/';
    });
    await clickToolbar(page, 'btn-reset-runtime');
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
    await clickToolbar(page, 'btn-reset-runtime');
    await clickToolbar(page, 'btn-toggle-lesson-complete');
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

    // 7c. Home is where the offer lives now. The roadmap's resume card was folded into Home's
    //     Continue card (the page that answers "what is next"), so the return visit's promise is
    //     judged there: the lesson last chosen is named, the reason is a resume, and one press
    //     reopens it. P.4 has been opened but not verified, which is the case worth resuming.
    await page.goto(`${baseUrl}?view=home`, { waitUntil: 'networkidle' });
    await page.getByTestId('home-dashboard').waitFor({ timeout: 15000 });
    const continueCard = page.getByTestId('home-continue');
    const continueText = (await continueCard.textContent()) ?? '';
    assert(
      continueText.includes(resumedTitle),
      `Home's Continue must name the lesson last chosen ("${resumedTitle}"); got: ${continueText}`
    );
    assert(
      continueText.includes('The lesson you stopped on.'),
      `an unfinished lesson is a resume, and Home must say so; got: ${continueText}`
    );
    await page.getByTestId('btn-home-continue').click();
    await waitForEditor(page, undefined, 15000);
    assert(
      ((await page.getByTestId('lesson-meta').textContent()) ?? '').includes('Lesson P.4'),
      'Home must reopen the lesson it just named'
    );
    assert.equal(
      (await page.getByTestId('lesson-title').textContent())?.trim(),
      resumedTitle,
      'Home must open the very lesson whose title it printed'
    );
    console.log('  ok Home names the lesson last chosen and reopens it in one press');

    // 7d. And passing it hands the offer forward. Home's Continue must stop naming a lesson that is
    //     already verified - that would ask for it twice, on the page whose job is what is next - and
    //     name the first one still open instead, saying which of the two it is.
    const verifiedBefore = await page.evaluate(() =>
      localStorage.getItem('mechalab_pyodide_verified_v1')
    );
    await page.evaluate(() => {
      const key = 'mechalab_pyodide_verified_v1';
      const flags = JSON.parse(localStorage.getItem(key) ?? '{}');
      flags['P.4'] = true;
      localStorage.setItem(key, JSON.stringify(flags));
    });
    await page.goto(`${baseUrl}?view=home`, { waitUntil: 'networkidle' });
    await page.getByTestId('home-dashboard').waitFor({ timeout: 15000 });
    const nextText = (await page.getByTestId('home-continue').textContent()) ?? '';
    assert(
      nextText.includes('The first lesson still open on your route.'),
      `a passed lesson must hand the offer forward, and the card must say which kind it is; got: ${nextText}`
    );
    assert(
      !nextText.includes(resumedTitle),
      `the card must not keep offering the lesson just verified; got: ${nextText}`
    );
    await page.getByTestId('btn-home-continue').click();
    await waitForEditor(page, undefined, 15000);
    const nextMeta = (await page.getByTestId('lesson-meta').textContent()) ?? '';
    assert(
      nextMeta.includes('Lesson P.5'),
      `with P.4 passed, Home must open the next unverified lesson (P.5); the runner opened: ${nextMeta}`
    );
    // Put the progress back exactly as the scenarios before this one left it: the portfolio counts
    // in section 8 read one verified and one self-marked lesson.
    await page.evaluate((previous) => {
      const key = 'mechalab_pyodide_verified_v1';
      if (previous === null) localStorage.removeItem(key);
      else localStorage.setItem(key, previous);
    }, verifiedBefore);
    console.log('  ok a passed lesson hands Home’s offer forward to the next one');

    // 7e. And the card knows what is half-written, not just which lesson. The editor keeps the
    //     unfinished program, Home says a draft is there and how large it is, and reopening it from
    //     Home hands the work back - a card naming an exercise whose typing it then replaced with the
    //     starter would be the same loss in a new place.
    await page.goto(`${baseUrl}?lesson=P.4`, { waitUntil: 'networkidle' });
    await waitForEditor(page, undefined, 15000);
    const p4Starter = await getEditorCode(page);
    // A real half-finished attempt: P.4's one measurable step (`# TODO 1` over `safe_cmd = cmd`) is
    // written, and nothing else is.
    const halfWritten = p4Starter.replace('safe_cmd = cmd', 'safe_cmd = min(max(cmd, 0), 255)');
    assert.notEqual(halfWritten, p4Starter, 'P.4 starter must still carry the TODO 1 placeholder');
    await setEditorCode(page, halfWritten);
    // The draft is written on a pause, not on every keystroke, so wait for the store to have it
    // rather than for a fixed number of milliseconds - a slower CI runner would otherwise reach Home
    // before the debounce fired and read an untouched starter.
    await waitForBulk(page, DRAFTS_KEY, (drafts) => (drafts['P.4'] ?? '').includes('min(max(cmd'));
    await page.goto(`${baseUrl}?view=home`, { waitUntil: 'networkidle' });
    await page.getByTestId('home-dashboard').waitFor({ timeout: 15000 });
    const draftText = (await page.getByTestId('home-continue').textContent()) ?? '';
    assert(
      draftText.includes('Your draft is here'),
      `Home must say the draft exists rather than only naming the lesson; got: ${draftText}`
    );
    assert(
      /\d[\d,]* characters/.test(draftText),
      `the draft line must say how large the work is; got: ${draftText}`
    );
    await page.getByTestId('btn-home-continue').click();
    await waitForEditor(page, undefined, 15000);
    assert.equal(
      await getEditorCode(page),
      halfWritten,
      'a plain visit must reopen the unfinished edit, not the starter it was written over'
    );
    // 7f. Running it, even to a failure, is the next rung of that ladder: the roadmap chips start
    //     counting attempts, which is the difference the log exists for.
    await page.getByTestId('btn-run-verify').click();
    // Parsed, not substring-matched: `"kind":"run"` and `"lesson":"P.4"` can each come from a
    // different event, so a raw search for both resolves on the previous lesson's run and the chip is
    // then read before this run has finished - which is exactly how this assertion failed on CI once.
    await waitForBulk(
      page,
      LOG_KEY,
      (events) => Array.isArray(events) && events.some((e) => e.kind === 'run' && e.lesson === 'P.4'),
      60000
    );
    await page.getByTestId('tab-btn-tab-arch').click();
    // The roadmap's step cards carry the same distinction, so the whole map can be read as
    // "never opened / opened and left / tried and failed / passed" at a glance.
    await page
      .waitForFunction(
        () =>
          document
            .querySelector('[data-testid="practice-entry-P.4"]')
            ?.getAttribute('data-state') === 'tried',
        undefined,
        { timeout: 15000 }
      )
      .catch(() => {});
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
    await clickToolbar(page, 'btn-draft-history');
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
    // Reset Starter is the one edit that means "forget this one", so Home stops advertising it.
    await clickToolbar(page, 'btn-reset-starter');
    await page.waitForTimeout(200);
    await page.goto(`${baseUrl}?view=home`, { waitUntil: 'networkidle' });
    await page.getByTestId('home-dashboard').waitFor({ timeout: 15000 });
    assert.equal(
      ((await page.getByTestId('home-continue').textContent()) ?? '').includes('Your draft is here'),
      false,
      'resetting to the starter must clear the draft, or Home would keep advertising it'
    );
    console.log('  ok Home shows the unfinished edit and reopening hands it back');
    // Home has no tab rail; the blocks below address the workbench's, so walk back through its door.
    await page.getByTestId('btn-home-workbench').click();
    await waitForEditor(page, undefined, 15000);

    // 7g-i. The Diff panel says which lines moved, not only how many. It reads the editor against the
    //       starter by default, and against the solution only once that is earned: the view must not
    //       become the answer key for a lesson nobody has opened the answer to yet.
    await page.getByTestId('tab-btn-tab-pyodide').click();
    await waitForEditor(page);
    await clickToolbar(page, 'btn-diff');
    await page.getByTestId('code-diff').waitFor({ timeout: 5000 });
    assert.equal(
      await page.getByTestId('code-diff').getAttribute('data-diff-target'),
      'starter',
      'the Diff panel must open against the starter'
    );
    // The editor is back on the starter at this point (Reset Starter, above), so there is nothing to
    // report, and the panel says that in words rather than drawing an empty body.
    assert.match(
      (await page.getByTestId('diff-same').textContent()) ?? '',
      /nothing written yet/,
      'an untouched starter must read as unchanged'
    );
    assert.equal(
      await page.getByTestId('diff-target-solution').isDisabled(),
      true,
      'comparing against the solution must stay locked until the solution is opened or the lesson passes'
    );
    const diffLine = '# the diff should find this line';
    const starterText = await getEditorCode(page);
    await setEditorCode(page, `${starterText.trimEnd()}\n${diffLine}\n`);
    await page.waitForFunction(
      () => document.querySelector('[data-testid="diff-summary"]')?.textContent?.trim() === '+1',
      undefined,
      { timeout: 5000 }
    );
    assert.equal(
      await page.getByTestId('code-diff').getAttribute('data-diff-added'),
      '1',
      'one appended line must read as one addition, not as the whole file'
    );
    const diffRows = page.getByTestId('diff-row');
    const addedRow = page.locator('[data-testid="diff-row"][data-kind="added"]');
    assert.equal(await addedRow.count(), 1, 'exactly one row must be the added line');
    assert.equal(
      (await addedRow.first().textContent())?.includes(diffLine),
      true,
      'the added row must carry the line the learner typed'
    );
    // Context is drawn around the change and the run before it is counted, not printed: a diff of a
    // forty-line starter with one line added is three rows of context and one gap.
    assert.ok((await diffRows.count()) > 1, 'the panel must draw context around the change');
    assert.ok(
      (await page.getByTestId('diff-gap').count()) > 0,
      'the unchanged head must be counted as a gap'
    );
    // The third reference: the attempt behind the draft. `run 1` is the version filed by the run
    // above, so this answers "what changed since a real run" — something neither the starter (a
    // fixed origin nobody edits) nor the solution (an answer) can.
    const runButton = page.getByTestId('diff-target-run-0');
    assert.equal(await runButton.isVisible(), true, 'a filed run must be offered as a reference');
    assert.match(
      (await runButton.textContent()) ?? '',
      /vs run 1 · checks failed/,
      "the version button must name the run it compares against, with that run's verdict"
    );
    await runButton.click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="code-diff"]')?.getAttribute('data-diff-target') ===
        'run:0',
      undefined,
      { timeout: 5000 }
    );
    // The filed text back in the editor: the honest answer against the run that produced it is
    // "no changes", and the sentence names that run, not the starter.
    await setEditorCode(page, halfWritten);
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="diff-same"]')
          ?.textContent?.includes('checks failed') === true,
      undefined,
      { timeout: 5000 }
    );
    assert.match(
      (await page.getByTestId('diff-same').textContent()) ?? '',
      /^The run .* checks failed, unchanged\.$/,
      'comparing against a filed run must name that run when there is nothing to report'
    );
    await page.getByTestId('diff-target-starter').click();
    // Opening the solution is what earns the second reference; then the editor *is* the solution, so
    // the honest answer is "no changes" rather than a wall of identical rows.
    await clickToolbar(page, 'btn-load-solution');
    assert.equal(
      await page.getByTestId('diff-target-solution').isDisabled(),
      false,
      'opening the solution must unlock comparing against it'
    );
    await page.getByTestId('diff-target-solution').click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="code-diff"]')?.getAttribute('data-diff-target') ===
          'solution' &&
        document.querySelector('[data-testid="diff-same"]') !== null,
      undefined,
      { timeout: 5000 }
    );
    assert.match(
      (await page.getByTestId('diff-same').textContent()) ?? '',
      /solution, unchanged/,
      'the solution text loaded into the editor must compare as no changes'
    );
    console.log('  ok the Diff panel names the lines changed, and unlocks the solution only once earned');
    // Leave the editor and the panel as the next step expects them.
    await clickToolbar(page, 'btn-reset-starter');
    await clickToolbar(page, 'btn-diff');

    // 7g-i-b. Share: the one thing a stuck learner can send a person — this lesson and this code.
    //        The link is read out of the real clipboard, opened in a browser with no storage of its
    //        own, and it must *offer* the code rather than replace the draft that is there. Applying
    //        it takes the card's own button, and then the code is the draft that a reload restores.
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: new URL(baseUrl).origin,
    });
    const shareCode = '# the attempt that got stuck\nprint("shared attempt 🙂")\n';
    await setEditorCode(page, shareCode);
    const sharedLessonTitle = await page.getByTestId('lesson-title').innerText();
    await clickToolbar(page, 'btn-share-attempt');
    await page.waitForFunction(
      () => /Link copied/.test(document.querySelector('[data-testid="share-status"]')?.textContent ?? ''),
      undefined,
      { timeout: 5000 }
    );
    const sharedUrl = await page.evaluate(() => navigator.clipboard.readText());
    assert.ok(
      sharedUrl.includes('#share=') && sharedUrl.includes('?lesson='),
      `the copied link must be this lesson plus the code fragment, got ${sharedUrl.slice(0, 120)}`
    );
    assert.ok(
      sharedUrl.length <= 2000,
      `a link past 2,000 characters is one chat clients truncate; got ${sharedUrl.length}`
    );
    assert.match(
      (await page.getByTestId('share-status').textContent()) ?? '',
      /not encrypted/,
      'the status must say the code is encoded rather than encrypted, since it is the learner’s own work going into a link'
    );

    const receiverContext = await browser.newContext();
    await receiverContext.addInitScript(() => {
      window.__mechalabPredictFirst = false;
    });
    await seedTourSeen(receiverContext);
    const receiver = await receiverContext.newPage();
    await receiver.goto(sharedUrl, { waitUntil: 'networkidle' });
    await receiver.getByTestId('shared-attempt-card').waitFor({ timeout: 15000 });
    assert.equal(
      await receiver.getByTestId('lesson-title').innerText(),
      sharedLessonTitle,
      'opening a share link must land on the lesson the code was written for'
    );
    // Offered, not applied: the editor is still the starter, because the receiver's draft is theirs.
    await waitForEditor(receiver);
    assert.notEqual(
      await getEditorCode(receiver),
      shareCode,
      'a share link must not put someone else’s code into the editor without a press'
    );
    await receiver.getByTestId('btn-load-shared-attempt').click();
    await receiver.waitForFunction(
      (expected) => window.__mechalabEditors['editor-main'].get() === expected,
      shareCode,
      { timeout: 5000 }
    );
    assert.equal(
      await receiver.getByTestId('shared-attempt-card').count(),
      0,
      'loading the attempt must clear the offer, so it cannot be applied twice'
    );
    // Loading is a draft like any other: a reload on the receiver's own browser has to keep it.
    await receiver.reload({ waitUntil: 'networkidle' });
    await waitForEditor(receiver);
    assert.equal(
      await getEditorCode(receiver),
      shareCode,
      'the loaded attempt must survive a reload as the lesson’s draft'
    );
    await receiverContext.close();
    console.log('  ok Share copies a link, the receiver is offered the code, and loading it becomes their draft');
    // Back to the starter: the watch-mode step below starts from a failed check of its own.
    await clickToolbar(page, 'btn-reset-starter');

    // 7g-i-c. Pair study: two workbenches and no server. The invitation and the reply are carried by
    //         hand — that is the whole signalling story — and from there the channel is real: an
    //         attempt crosses it, arrives as a card, and lands in the other editor only on a press.
    //         The two pages start on different lessons, which is the guard the card has to explain.
    const pairCode = '# the attempt I wanted a second pair of eyes on\nprint("pair 🙂")\n';
    await page.getByTestId('lesson-item-P.2').click();
    await setEditorCode(page, pairCode);
    await clickToolbar(page, 'btn-pair-open');
    await page.getByTestId('btn-pair-start').click();
    await page.waitForFunction(
      () =>
        (document.querySelector('[data-testid="pair-invitation-text"]')?.value ?? '').startsWith(
          'mechalab-pair-1:'
        ),
      undefined,
      { timeout: 15000 }
    );
    const invitation = await page.getByTestId('pair-invitation-text').inputValue();
    assert.ok(
      invitation.length < 16000,
      `an invitation must stay pasteable; got ${invitation.length} characters`
    );

    const guestContext = await browser.newContext();
    await guestContext.addInitScript(() => {
      window.__mechalabPredictFirst = false;
    });
    await seedTourSeen(guestContext);
    const guest = await guestContext.newPage();
    await guest.goto(baseUrl, { waitUntil: 'networkidle' });
    await waitForEditor(guest);
    await clickToolbar(guest, 'btn-pair-open');
    await guest.getByTestId('btn-pair-join').click();
    await guest.getByTestId('input-pair-invitation').fill(invitation);
    await guest.getByTestId('btn-pair-make-reply').click();
    await guest.waitForFunction(
      () =>
        (document.querySelector('[data-testid="pair-reply-text"]')?.value ?? '').startsWith(
          'mechalab-pair-1:'
        ),
      undefined,
      { timeout: 15000 }
    );
    const reply = await guest.getByTestId('pair-reply-text').inputValue();

    await page.getByTestId('input-pair-reply').fill(reply);
    await page.getByTestId('btn-pair-accept').click();
    await page.getByTestId('pair-connected').waitFor({ timeout: 20000 });
    await guest.getByTestId('pair-connected').waitFor({ timeout: 20000 });

    await page.getByTestId('btn-pair-send-attempt').click();
    await guest.getByTestId('pair-attempt-card').waitFor({ timeout: 15000 });
    assert.equal(
      await guest.getByTestId('pair-sheet').count(),
      0,
      'an arriving attempt closes the sheet, so the card is what the learner decides about'
    );
    assert.notEqual(
      await getEditorCode(guest),
      pairCode,
      'an attempt from a session must never land in the editor without a press'
    );
    assert.match(
      (await guest.getByTestId('pair-attempt-card').innerText()) ?? '',
      /for P\.2/,
      'the card must name the lesson the attempt is for when this editor is on another one'
    );
    await guest.getByTestId('btn-open-pair-lesson').click();
    await guest.getByTestId('btn-load-pair-attempt').click();
    await guest.waitForFunction(
      (expected) => window.__mechalabEditors['editor-main'].get() === expected,
      pairCode,
      { timeout: 5000 }
    );
    assert.equal(
      await guest.getByTestId('pair-attempt-card').count(),
      0,
      'loading the attempt must clear the offer, so it cannot be applied twice'
    );

    // 7g-i-d. Co-editing: the same channel, with the editors joined up. The host's text is the document
    //         both start from, the guest accepts before their editor moves, and a keystroke on either
    //         screen arrives on the other — while undo stays each person's own, which is the one thing
    //         two people in one document cannot share.
    await page.getByTestId('btn-coedit-start').click();
    await guest.getByTestId('coedit-invite').waitFor({ timeout: 15000 });
    assert.match(
      (await guest.getByTestId('coedit-invite').innerText()) ?? '',
      /P\.2/,
      'the offer must name the lesson it would replace the editor with'
    );
    await guest.getByTestId('btn-coedit-accept').click();
    await page.getByTestId('coedit-status').waitFor({ timeout: 15000 });
    await guest.getByTestId('coedit-status').waitFor({ timeout: 15000 });
    assert.equal(
      await getEditorCode(guest),
      await getEditorCode(page),
      'accepting must leave both editors holding the same text'
    );

    await guest.evaluate(() => {
      const editor = window.__mechalabEditors['editor-main'];
      editor.setCursor(editor.get().length);
      editor.focus();
    });
    await guest.keyboard.type('# guest line');
    await page.waitForFunction(
      () => window.__mechalabEditors['editor-main'].get().includes('# guest line'),
      undefined,
      { timeout: 15000 }
    );

    await page.evaluate(() => {
      const editor = window.__mechalabEditors['editor-main'];
      editor.setCursor(editor.get().length);
      editor.focus();
    });
    await page.keyboard.type('# host line');
    await guest.waitForFunction(
      () => window.__mechalabEditors['editor-main'].get().includes('# host line'),
      undefined,
      { timeout: 15000 }
    );

    // Undo is the host's own: it takes back what the host typed and leaves the guest's line alone,
    // because a peer's edit never entered this history. A grouped type may undo in one press; the
    // loop is what makes the assertion about the rule rather than about CodeMirror's grouping.
    const undoKey = process.platform === 'darwin' ? 'Meta+z' : 'Control+z';
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const stillThere = await page.evaluate(() =>
        window.__mechalabEditors['editor-main'].get().includes('# host line')
      );
      if (!stillThere) break;
      await page.keyboard.press(undoKey);
      await page.waitForTimeout(150);
    }
    assert.ok(
      !(await getEditorCode(page)).includes('# host line'),
      'undo must take back what this workbench typed'
    );
    await guest.waitForFunction(
      () => !window.__mechalabEditors['editor-main'].get().includes('# host line'),
      undefined,
      { timeout: 15000 }
    );
    assert.match(
      await getEditorCode(page),
      /# guest line/,
      'the host’s undo must not reach across to the guest’s line'
    );
    assert.match(await getEditorCode(guest), /# guest line/, 'and the guest keeps their own line');

    await page.getByTestId('btn-coedit-stop').click();
    await page.getByTestId('coedit-notice').waitFor({ timeout: 10000 });
    await guest.waitForFunction(
      () => /stopped co-editing/i.test(document.querySelector('[data-testid="coedit-notice"]')?.textContent ?? ''),
      undefined,
      { timeout: 10000 }
    );
    const hostBefore = await getEditorCode(page);
    await guest.keyboard.type('!');
    await guest.waitForTimeout(900);
    assert.equal(
      await getEditorCode(page),
      hostBefore,
      'once co-editing has stopped, a keystroke stays on the screen it was typed on'
    );
    console.log('  ok two workbenches co-edit one document, and undo stays each person’s own');

    await page.getByTestId('btn-pair-leave').click();
    await page.waitForFunction(
      () =>
        /ended/i.test(document.querySelector('[data-testid="pair-status"]')?.textContent ?? ''),
      undefined,
      { timeout: 10000 }
    );
    await guestContext.close();
    await page.getByTestId('btn-close-pair').click();
    console.log('  ok a pair session connects through hand-carried codes and an attempt is offered, not applied');
    // Back to the lesson the steps below expect, on its starter.
    await page.getByTestId('lesson-item-P.6').click();
    await clickToolbar(page, 'btn-reset-starter');

    // 7g-ii. Watch mode: after a failed check, the *typing* is what runs the code. One run per pause,
    //        not per keystroke, and the loop ends when the learner turns it off or passes.
    await clickToolbar(page, 'btn-watch');
    assert.equal(
      await page.getByTestId('btn-watch').getAttribute('aria-pressed'),
      'true',
      'Watch must be a pressed toggle, not a one-shot button'
    );
    assert.match(
      (await page.getByTestId('btn-watch').textContent()) ?? '',
      /Watching/,
      'an on toggle must say so'
    );
    await setEditorCode(page, 'print("first watch")\n');
    await page.getByTestId('btn-run-verify').click();
    await page.waitForFunction(
      () =>
        (document.querySelector('[data-testid="pre-actual-stdout"]')?.textContent ?? '').includes(
          'first watch'
        ),
      null,
      { timeout: 60000 }
    );
    // That run cannot match this lesson's expected output, so it is a graded failure: exactly the
    // state watch mode arms on. Now edit, click nothing, and wait for the verdict to catch up.
    const watchStarted = Date.now();
    await setEditorCode(page, 'print("second watch")\n');
    await page.waitForFunction(
      () =>
        (document.querySelector('[data-testid="pre-actual-stdout"]')?.textContent ?? '').includes(
          'second watch'
        ),
      null,
      { timeout: 30000 }
    );
    const watchElapsed = Date.now() - watchStarted;
    assert.ok(
      watchElapsed >= 1000,
      `the re-run must wait for a pause in typing, not fire per keystroke; it took ${watchElapsed} ms`
    );
    console.log(`  ok watch mode re-ran the checks after a ${watchElapsed} ms pause in typing`);
    // 7g-iii. A failed run announces a reason, not an instruction to go and find a coloured line.
    //         This program prints, so the red check here is a behaviour one and the announcement
    //         says so; the wording of every branch (including the quoted output line) is pinned in
    //         `npm run test:announce`.
    const announcement = (await page.getByTestId('run-announcement').textContent()) ?? '';
    assert.match(announcement, /has not passed:/, 'a failed run must announce its verdict');
    assert.match(
      announcement,
      /a behaviour check failed|expected ".+", got "|off target/,
      `the announcement must carry the reason; got: ${announcement}`
    );
    assert.equal(
      /read the failing line above/i.test(announcement),
      false,
      'the announcement must not send a screen reader hunting for a colour'
    );
    // Off again: the rest of this suite clicks Run itself, and a watching editor would race it.
    await clickToolbar(page, 'btn-watch');
    assert.equal(
      await page.getByTestId('btn-watch').getAttribute('aria-pressed'),
      'false',
      'Watch must turn off again'
    );

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

    // 7h-i. The Scope is readable, not only painted: a pointer over it names every trace at one t,
    //       the arrow keys move that cursor, and the zoom buttons narrow the time axis - about the
    //       middle of the view, and never past the data.
    // A pointer event only lands on a canvas that is actually on screen: `mouse.move` does not scroll
    // the way a locator action does, so bring the plot into view first.
    await page.getByTestId('scope-canvas').scrollIntoViewIfNeeded();
    const scopeBox = await page.getByTestId('scope-canvas').boundingBox();
    assert(scopeBox, 'the Scope canvas must have a box to point at');
    await page.mouse.move(
      scopeBox.x + scopeBox.width * 0.55,
      scopeBox.y + scopeBox.height * 0.5
    );
    const firstCursor = (await page.getByTestId('scope-cursor-t').innerText()).trim();
    assert(
      /^t = -?[\d.]/.test(firstCursor),
      `pointing at the plot must read a time, got: ${firstCursor}`
    );
    const firstReading = (await page.getByTestId('scope-cursor-value-0').innerText()).trim();
    assert(
      firstReading.includes('step response') && !firstReading.includes('—'),
      `the cursor must read this trace's value at that t, got: ${firstReading}`
    );
    await page.getByTestId('scope-canvas').focus();
    await page.keyboard.press('ArrowRight');
    const movedCursor = (await page.getByTestId('scope-cursor-t').innerText()).trim();
    assert.notEqual(
      movedCursor,
      firstCursor,
      'the arrow key must move the cursor, so the readout is not mouse-only'
    );
    const fullWindow = (await page.getByTestId('scope-window').innerText()).trim();
    await page.getByTestId('btn-scope-zoom-in').click();
    const zoomedWindow = (await page.getByTestId('scope-window').innerText()).trim();
    assert.notEqual(zoomedWindow, fullWindow, 'Zoom + must narrow the time axis');
    await page.getByTestId('btn-scope-zoom-reset').click();
    assert.equal(
      (await page.getByTestId('scope-window').innerText()).trim(),
      fullWindow,
      'Fit must return to the whole trace'
    );

    // 7h-ii. Pin this run, change one parameter, run again: both traces share the axes, and one
    //        cursor reads both values at the same t. That is the comparison the panel is for.
    await page.getByTestId('btn-scope-pin').click();
    assert(
      (await page.getByTestId('scope-pin-label').innerText()).includes('A pinned'),
      'pinning must say which run is on the axes'
    );
    await setEditorCode(
      page,
      [
        'import math',
        'from mechalab import scope',
        '',
        'ts = [i / 100 for i in range(400)]',
        'ys = [2 * (1 - math.exp(-t)) for t in ts]',
        'scope.stream("step response", ts, ys)',
        'print("traced", len(ts), "points")',
        '',
      ].join('\n')
    );
    await page.getByTestId('btn-run-verify').click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="scope-legend"]')?.textContent?.includes('(B)'),
      null,
      { timeout: 90000 }
    );
    const overlayLegend = (await page.getByTestId('scope-legend').innerText()).trim();
    assert(
      overlayLegend.includes('(A)') && overlayLegend.includes('(B)'),
      `the legend must name both runs once one is pinned; got: ${overlayLegend}`
    );
    await page.getByTestId('scope-canvas').scrollIntoViewIfNeeded();
    const overlayBox = await page.getByTestId('scope-canvas').boundingBox();
    // A pointer that is already where it was does not emit another move, and the second run cleared
    // the cursor - so this one lands somewhere else and reads the pair there.
    await page.mouse.move(
      overlayBox.x + overlayBox.width * 0.35,
      overlayBox.y + overlayBox.height * 0.5
    );
    const pairA = (await page.getByTestId('scope-cursor-value-0').innerText()).trim();
    const pairB = (await page.getByTestId('scope-cursor-value-1').innerText()).trim();
    assert(
      pairA.includes('(A)') && pairB.includes('(B)'),
      `the cursor must read both runs at one t; got A: ${pairA} / B: ${pairB}`
    );
    const numberIn = (text) => Number((text.match(/(-?[\d.]+(?:e[-+]?\d+)?)\s*$/) || [])[1]);
    const [valueA, valueB] = [numberIn(pairA), numberIn(pairB)];
    assert(
      Number.isFinite(valueA) && Number.isFinite(valueB) && valueB > valueA * 1.5,
      `the doubled run must read about twice the pinned one at the same t; got ${valueA} and ${valueB}`
    );
    await page.getByTestId('btn-scope-unpin').click();
    assert.equal(
      await page.getByTestId('scope-pin-label').count(),
      0,
      'clearing A must take the overlay label with it'
    );
    console.log(
      '  ok the Scope reads a cursor, zooms, and overlays a pinned run with the next one at one t'
    );
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

    await page.getByLabel('Close export modal').click();

    // 8b. The paint reading. The byte budgets can say what a visit downloads; only the browser can say
    // what it waited for, so the log export carries this visit's four moments — first contentful paint,
    // largest contentful paint, the editor mounting where the placeholder stood, and the runner
    // committing (the Run button on screen). They are read from the download's own bytes rather than
    // from a hook in the app, so what is checked is what a learner would hand to a pilot.
    await page.evaluate(() => {
      window.__exportedBlobs = [];
      const original = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        blob
          .text()
          .then((text) => window.__exportedBlobs.push(text))
          .catch(() => {});
        return original(blob);
      };
    });
    await page.getByTestId('btn-export-learning-log').click();
    const paint = await page
      .waitForFunction(
        () => {
          const raw = (window.__exportedBlobs ?? [])[0];
          if (!raw) return false;
          try {
            return JSON.parse(raw).paint ?? false;
          } catch {
            return false;
          }
        },
        undefined,
        { timeout: 10000 }
      )
      .then((handle) => handle.jsonValue());
    const latest = paint.samples[0];
    assert(latest, `the export must carry the visit's paint sample; got ${JSON.stringify(paint)}`);
    for (const metric of ['fcp', 'editor', 'run']) {
      assert(
        Number.isFinite(latest[metric]) && latest[metric] > 0,
        `the ${metric} moment must be measured in milliseconds; got ${latest[metric]}`
      );
    }
    assert(
      latest.fcp <= latest.editor,
      `the first paint cannot come after the editor mounted (${latest.fcp} vs ${latest.editor})`
    );
    assert(
      latest.run <= latest.editor,
      `the runner commits before its editor chunk lands (${latest.run} vs ${latest.editor})`
    );
    assert(
      paint.summary.count >= 1 && paint.summary.median.fcp > 0,
      `the export must summarise the samples it carries; got ${JSON.stringify(paint.summary)}`
    );
    console.log(
      `  ok the export carries the paint reading (first paint ${latest.fcp} ms, editor ${latest.editor} ms, Run ${latest.run} ms)`
    );

    // 9. Verify School-Math Diagnostic & Tier 1 -> Tier 2 Exit Readiness Review interactive sub-tabs
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
    // ...and the six stores that live in IndexedDB, or the reload would come back with this suite's
    // own log, drafts and notes still in place.
    await clearBulk(page);
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
    await clickToolbar(formattingPage, 'btn-load-solution');
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
    await clickToolbar(formattingPage, 'btn-load-solution');
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
    await clickToolbar(formattingPage, 'btn-load-solution');
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
    await clickToolbar(formattingPage, 'btn-load-solution');
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
    await clickToolbar(formattingPage, 'btn-load-solution');
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
    const benchLog = await waitForBulk(
      formattingPage,
      LOG_KEY,
      (events) =>
        Array.isArray(events) && events.some((e) => e.kind === 'run' && e.lesson === '08.1')
    );
    const benchRun = benchLog.filter((e) => e.kind === 'run' && e.lesson === '08.1').pop();
    assert.equal(benchRun?.outcome, 'harness_failed', 'the learning log must record the harness failure');
    assert(
      benchRun?.fail?.includes('1.20 mm'),
      `the logged failure must carry the real metric; got: ${benchRun?.fail}`
    );
    console.log('  ok a 10%-short 08.1 repair keeps 1.20 mm and leaves the lesson unverified');

    await clickToolbar(formattingPage, 'btn-load-solution');
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
    await clickToolbar(formattingPage, 'btn-load-solution');
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
    const budgetLog = await waitForBulk(
      formattingPage,
      LOG_KEY,
      (events) =>
        Array.isArray(events) &&
        events.some((e) => e.kind === 'run' && e.lesson === 'EX.08-capstones.T3.07a')
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

    await clickToolbar(formattingPage, 'btn-load-solution');
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

    // 15. The Board card is the course's C bridge. Five Stage-0 lessons are Arduino sketches, and a
    //     tab that runs CPython cannot compile them, so the card does what is provable: it shows the
    //     lesson's own Full Solution (generated from the page, so it cannot be an older copy), hands
    //     the learner to a simulator in another tab, and grades the half the page owns - the serial,
    //     against the exact text CI proves by compiling that same sketch. A wrong prediction must be
    //     refused with the line named, the verified serial must pass, and Copy must put the sketch on
    //     the clipboard, because that copy *is* the bridge to the other tab.
    await page.getByTestId('tab-btn-tab-arch').click();
    const board = page.getByTestId('board-bridge');
    await board.waitFor({ timeout: 15000 });
    const boardLessons = await page.getByTestId('board-select').locator('option').count();
    assert.equal(
      boardLessons,
      5,
      `every Stage-0 Arduino lesson must be reachable from the card, got ${boardLessons} option(s)`
    );
    const shownSketch = await board.locator('pre').first().innerText();
    assert(
      shownSketch.includes('void setup()'),
      `the card must show a real sketch, not a summary; got: ${shownSketch.slice(0, 80)}`
    );
    // A frame would be the seamless-looking choice and the wrong one: this document is served with
    // COEP require-corp, so a cross-origin iframe of a site that sends no CORP header renders as an
    // empty box. The hand-off is a link that opens another tab.
    assert.equal(
      await page.getByTestId('board-wokwi').getAttribute('target'),
      '_blank',
      'the simulator link must open in its own tab, so the workbench keeps the learner’s place'
    );
    assert(
      ((await page.getByTestId('board-wokwi').getAttribute('href')) ?? '').startsWith('https://wokwi.com/'),
      'the primary hand-off must be the Wokwi simulator'
    );
    await page.getByTestId('board-predict').fill('Released | pin_reading=HIGH(1) -> led_out=HIGH(1)');
    await page.getByTestId('board-check').click();
    const wrongVerdict = (await page.getByTestId('board-verdict').innerText()).trim();
    assert(
      /line \d+ differs/.test(wrongVerdict),
      `a wrong prediction must name the line that differs, got: ${wrongVerdict}`
    );
    await page.getByTestId('board-expected').waitFor({ timeout: 5000 });
    const verifiedSerial = (await page.getByTestId('board-expected').innerText()).trim();
    await page.getByTestId('board-predict').fill(verifiedSerial);
    await page.getByTestId('board-check').click();
    const rightVerdict = (await page.getByTestId('board-verdict').innerText()).trim();
    assert(
      rightVerdict.startsWith('Matches the verified serial'),
      `typing the verified serial back must pass, got: ${rightVerdict}`
    );
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: new URL(baseUrl).origin,
    });
    await page.getByTestId('board-copy').click();
    const copiedSketch = await page.evaluate(() => navigator.clipboard.readText());
    assert(
      copiedSketch.includes('void setup()') && copiedSketch.length > 100,
      `Copy must put the whole sketch on the clipboard; got ${copiedSketch.length} char(s)`
    );
    console.log('  ok the Board card shows the lesson sketch, grades a prediction and copies it');

    // 15b. And the card folds. It is the tallest thing above the ten steps - a sketch and a
    //      prediction box side by side - and a learner who has already used it wants the map back.
    //      Folded it keeps its heading and names the lesson it holds, so the card is still findable;
    //      the sketch and the picker are behind one press. Same store as the trail and the offer.
    assert.equal(await board.getAttribute('data-collapsed'), 'false', 'the Board card must open expanded');
    await page.getByTestId('btn-board-toggle').click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="board-bridge"]')?.getAttribute('data-collapsed') ===
        'true',
      undefined,
      { timeout: 5000 }
    );
    assert.equal(
      await page.getByTestId('board-select').count(),
      0,
      'a folded Board card still showed the lesson picker'
    );
    assert.equal(
      await board.locator('pre').count(),
      0,
      'a folded Board card still showed a sketch'
    );
    const boardSummary = ((await page.getByTestId('board-summary').textContent()) ?? '').trim();
    assert.ok(
      boardSummary.length > 0,
      'a folded Board card must still say which lesson it holds; the summary was empty'
    );
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.getByTestId('tab-btn-tab-arch').click();
    await page.getByTestId('board-bridge').waitFor({ timeout: 15000 });
    assert.equal(
      await page.getByTestId('board-bridge').getAttribute('data-collapsed'),
      'true',
      'the Board card’s fold must be remembered across a reload'
    );
    await page.getByTestId('btn-board-toggle').click();
    await page.getByTestId('board-select').waitFor({ timeout: 5000 });
    console.log(`  ok the Board card folds to "${boardSummary}" and stays folded`);
    // Back to the lessons, where the next step left this page: a suite that ends on another tab
    // would make every later step fail on a locator that is simply not on screen.
    await page.getByTestId('tab-btn-tab-pyodide').click();
    await page.getByTestId('lesson-item-EX.05-control.T2.05a').waitFor({ timeout: 15000 });

    // 16. The Board tab runs the compiled sketch. This is the only surface in the app that executes
    //     machine code: the lesson's `.hex` is fetched, run in `avr8js`, and its USART becomes the
    //     monitor. The serial it prints must be the lesson's, the clock must count real cycles, and a
    //     guess typed into the box must be graded against what the emulator *printed* — the page's
    //     text is the stop condition, not the answer key.
    // Beginner View shows the six tabs a newcomer needs; Board is a lab, so open Advanced first.
    const boardAdvance = page.getByTestId('btn-mode-advanced');
    if (await boardAdvance.count()) await boardAdvance.click();
    await page.getByTestId('tab-btn-tab-board').click();
    await page.getByTestId('tab-board').waitFor({ timeout: 15000 });
    const serialMonitor = page.getByTestId('board-tab-serial');
    await page.getByTestId('board-tab-run').click();
    // Wait for the run's own verdict, not for a substring: the monitor fills line by line, so a
    // reader that stops at the first `pin_reading` reads half a serial and calls it the answer.
    await page.waitForFunction(
      () =>
        (document.querySelector('[data-testid="board-tab-status"]')?.textContent ?? '').trim() ===
        'printed the whole serial',
      undefined,
      { timeout: 60000 }
    );
    const printedSerial = (await serialMonitor.innerText()).trim();
    assert(
      /Released \| pin_reading=HIGH\(1\) -> led_out=LOW\(0\)/.test(printedSerial) &&
        /Pressed\s+\| pin_reading=LOW\(0\) -> led_out=HIGH\(1\)/.test(printedSerial),
      `the emulator must print the lesson's serial, got: ${printedSerial}`
    );
    const boardStatus = (await page.getByTestId('board-tab-status').innerText()).trim();
    assert.equal(
      boardStatus,
      'printed the whole serial',
      `a completed run must say so in words a learner can read, got: ${boardStatus}`
    );
    const boardClock = (await page.getByTestId('board-tab-clock').innerText()).trim();
    assert(
      /^[\d,]+ cycles/.test(boardClock) && !boardClock.startsWith('0 '),
      `the clock must count the cycles the emulator ran, got: ${boardClock}`
    );
    // The guess is graded against the printed serial: type what it printed, reset, run again.
    await page.getByTestId('board-tab-guess').fill(printedSerial);
    await page.getByTestId('board-tab-reset').click();
    assert.equal(
      (await serialMonitor.innerText()).trim(),
      '',
      'Reset must clear the monitor, so a second run cannot read the first run’s output as its own'
    );
    await page.getByTestId('board-tab-run').click();
    await page.waitForFunction(
      () =>
        (document.querySelector('[data-testid="board-tab-status"]')?.textContent ?? '').trim() ===
        'printed the whole serial',
      undefined,
      { timeout: 60000 }
    );
    await page.getByTestId('board-tab-verdict').waitFor({ timeout: 60000 });
    const boardVerdict = (await page.getByTestId('board-tab-verdict').innerText()).trim();
    assert(
      /Matches the verified serial/.test(boardVerdict),
      `a guess equal to the printed serial must pass, got: ${boardVerdict}`
    );
    console.log('  ok the Board tab runs the compiled sketch, prints its serial and grades a guess');
    await page.getByTestId('tab-btn-tab-pyodide').click();
    await page.getByTestId('lesson-item-EX.05-control.T2.05a').waitFor({ timeout: 15000 });

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

    // 12b. The other two doors into the same dialog, and the sheet that says so. `⌘P` lists the
    // lessons only; `⌘⇧F` searches inside their text. The search jump is measured on a fresh context,
    // where no draft has moved the lines: the caret promise is "the line that matched", not "line 7".
    await formattingPage.keyboard.press('Control+p');
    await formattingPage.getByTestId('command-palette').waitFor({ timeout: 10000 });
    // A different door is a fresh question: the query the last visit typed is cleared in an effect, so
    // wait for the field rather than reading the footer of the frame that still holds it.
    await formattingPage.waitForFunction(
      () => document.querySelector('[data-testid="input-palette-search"]')?.value === '',
      undefined,
      { timeout: 5000 }
    );
    assert.equal(
      await formattingPage.getByTestId('command-palette').getAttribute('data-palette-mode'),
      'lessons',
      '⌘P must open the palette on the lesson list'
    );
    const lessonsCount = (await formattingPage.getByTestId('palette-match-count').innerText()).match(/(\d+) of (\d+)/);
    assert.equal(
      lessonsCount?.[1],
      lessonsCount?.[2],
      `⌘P's empty list must be every lesson, not a subset; read: ${lessonsCount?.[0]}`
    );
    assert.equal(
      await formattingPage.locator('[data-testid^="palette-item-tab-"]').count(),
      0,
      '⌘P must not offer tabs'
    );
    assert.equal(
      await formattingPage.locator('[data-testid^="palette-item-action-"]').count(),
      0,
      '⌘P must not offer commands'
    );
    await formattingPage.getByTestId('input-palette-search').fill('P.9');
    await formattingPage.getByTestId('palette-item-lesson-P.9').waitFor({ timeout: 5000 });
    await formattingPage.keyboard.press('Enter');
    await formattingPage.getByTestId('command-palette').waitFor({ state: 'detached', timeout: 5000 });
    await formattingPage.getByTestId('lesson-item-P.9').waitFor({ timeout: 5000 });
    assert(
      formattingPage.url().includes('lesson=P.9'),
      `a quick-open must open its lesson; url was ${formattingPage.url()}`
    );
    console.log('  ok ⌘P lists lessons only and opens the one typed');

    // A fresh context: `⌘⇧F` opens the lesson's own text, and the hit's line is where the caret lands.
    // Measured here rather than on the suite's page because every draft edited above has moved lines.
    const searchContext = await browser.newContext();
    await searchContext.addInitScript(() => {
      window.__mechalabPredictFirst = false;
    });
    await seedTourSeen(searchContext);
    const searchPage = await searchContext.newPage();
    try {
      await searchPage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await searchPage.waitForSelector('[data-editor="editor-main"] .cm-content', { timeout: 60000 });
      await searchPage.keyboard.press('Control+Shift+F');
      await searchPage.getByTestId('command-palette').waitFor({ timeout: 10000 });
      assert.equal(
        await searchPage.getByTestId('command-palette').getAttribute('data-palette-mode'),
        'search',
        '⌘⇧F must open the palette on the lesson text'
      );
      // The dialog clears its field in an effect on open: filling before that lands would be wiped
      // by the reset, which reads as "the search found nothing" rather than as a race.
      await searchPage.waitForFunction(
        () => document.querySelector('[data-testid="input-palette-search"]')?.value === '',
        undefined,
        { timeout: 5000 }
      );
      // The plant is imported by the Tier 2 and 3 starters, so the query finds code as well as prose.
      await searchPage.getByTestId('input-palette-search').fill('mechalab_plant');
      // The course pages are a fetch of their own. Wait for the footer to stop saying they are on
      // their way (or missing) before counting rows, so the list and the footer are read from one
      // settled state rather than across the moment the file lands. A failed fetch is not fatal
      // here — the prose step below is where it is reported, with the reason.
      await searchPage
        .waitForFunction(
          () => !document.querySelector('[data-testid="palette-note"]'),
          undefined,
          { timeout: 15000 }
        )
        .catch(() => undefined);
      await searchPage.locator('[data-testid^="palette-item-search-"]').first().waitFor({ timeout: 10000 });
      // Every row, not only the runner's: `⌘⇧F` also answers from the course pages, and the footer
      // counts the list the learner is looking at.
      const hitRows = await searchPage
        .locator('[data-testid^="palette-item-"]')
        .evaluateAll((rows) =>
          rows.map((row) => ({
            id: row.dataset.paletteId ?? '',
            text: (row.innerText ?? '').replace(/\s+/g, ' '),
          }))
        );
      assert.equal(
        await searchPage.getByTestId('palette-match-count').innerText(),
        `${hitRows.length} hit${hitRows.length === 1 ? '' : 's'}`,
        'the footer must count hits, not the catalogue'
      );
      const starterRow = hitRows.findIndex((row) => /starter · line \d+/.test(row.text));
      assert.ok(
        starterRow >= 0,
        `expected a starter line among the hits for the plant; read: ${JSON.stringify(hitRows.slice(0, 3))}`
      );
      // Keyboard only: walk the highlight down to the row that is a line of the file, then open it.
      for (let step = 0; step < starterRow; step += 1) await searchPage.keyboard.press('ArrowDown');
      const expectedLine = Number(hitRows[starterRow].text.match(/starter · line (\d+)/)[1]);
      await searchPage.keyboard.press('Enter');
      await searchPage.getByTestId('command-palette').waitFor({ state: 'detached', timeout: 5000 });
      // The pick switches the lesson, and an editor is keyed by the lesson it holds: wait for the
      // *caret*, not for the bridge, because the old editor's bridge is still registered for a frame.
      const caret = () =>
        searchPage.evaluate(() => {
          const bridge = window.__mechalabEditors?.['editor-main'];
          if (!bridge) return null;
          const text = bridge.get();
          const line = text.slice(0, bridge.getCursor()).split('\n').length;
          return { line, lineText: (text.split('\n')[line - 1] ?? '').trim() };
        });
      await searchPage
        .waitForFunction(
          (wanted) => {
            const bridge = window.__mechalabEditors?.['editor-main'];
            if (!bridge) return false;
            return bridge.get().slice(0, bridge.getCursor()).split('\n').length === wanted;
          },
          expectedLine,
          { timeout: 15000 }
        )
        .catch(() => undefined);
      const landed = await caret();
      assert.equal(
        landed?.line,
        expectedLine,
        `the caret must land on the hit's line (${expectedLine}), not ${landed?.line}; hit ${hitRows[starterRow].id}`
      );
      assert.match(
        landed?.lineText ?? '',
        /mechalab_plant/,
        `the line under the caret must be the line that matched; it reads: ${landed?.lineText}`
      );
      console.log(
        `  ok ⌘⇧F finds the lesson by its text and puts the caret on line ${expectedLine} (${(landed?.lineText ?? '').slice(0, 40)}…)`
      );

      // The other half of the same door: the 65 reading pages, which are fetched the first time
      // `⌘⇧F` opens and are not part of the bundle. `decoupling` is a word the runner's lessons do
      // not carry, so a row for it can only have come from the prose index, and the row must name
      // the section and the GitHub anchor rather than some page called S0.6.
      await searchPage.keyboard.press('Control+Shift+F');
      await searchPage.getByTestId('command-palette').waitFor({ timeout: 10000 });
      await searchPage.waitForFunction(
        () => document.querySelector('[data-testid="input-palette-search"]')?.value === '',
        undefined,
        { timeout: 5000 }
      );
      await searchPage.getByTestId('input-palette-search').fill('decoupling');
      const proseRow = searchPage.locator('[data-testid^="palette-item-prose-"]').first();
      await proseRow.waitFor({ timeout: 15000 });
      assert.equal(
        await searchPage.locator('[role="group"][aria-label="Course pages"]').count(),
        1,
        'the prose hits must sit under their own heading, not among the lessons'
      );
      const proseText = (await proseRow.innerText()).replace(/\s+/g, ' ');
      // Case-insensitive on purpose: `innerText` returns what is *rendered*, and this label is styled
      // `uppercase`. It used to read "Course page" only because the suite's dev server was loading the app
      // without its stylesheet (see the note on `startDevServer`), so matching the case would tie this
      // check to a bug that has since been fixed.
      assert.match(proseText, /Course page/i, 'the row must say what it is');
      assert.match(proseText, /S0\.6/, 'the row must name the page');
      assert.match(proseText, /§ Idea 2: Power-rail decoupling/, 'the row must name the section it opens');
      const proseHref = await proseRow.getAttribute('data-href');
      assert.equal(
        proseHref,
        'https://github.com/TLE47/Mechatronics-Roadmap/blob/main/stage-0/S0.6-capacitors-and-decoupling.md#idea-2-power-rail-decoupling-bypass-capacitors',
        `the row must open the page at its section; got ${proseHref}`
      );
      // Once the file is in, the footer says nothing about it: a permanent "65 pages" is furniture.
      assert.equal(
        await searchPage.getByTestId('palette-note').count(),
        0,
        'a loaded prose index must leave the footer quiet'
      );

      // Enter on the row leaves the workbench where it is and opens the page beside it. The tab is
      // stubbed: the promise is the destination, not that github.com answers from CI.
      await searchContext.route('https://github.com/**', (route) =>
        route.fulfill({ status: 200, contentType: 'text/html', body: '<title>stub</title>' })
      );
      const proseRowIndex = await searchPage
        .locator('[data-testid^="palette-item-"]')
        .evaluateAll((rows, id) => rows.findIndex((row) => (row.getAttribute('data-testid') ?? '') === id),
          (await proseRow.getAttribute('data-testid')) ?? '');
      assert.ok(proseRowIndex >= 0, 'the prose row must be somewhere in the list');
      const openedTab = searchContext.waitForEvent('page', { timeout: 10000 });
      for (let step = 0; step < proseRowIndex; step += 1) await searchPage.keyboard.press('ArrowDown');
      await searchPage.keyboard.press('Enter');
      await searchPage.getByTestId('command-palette').waitFor({ state: 'detached', timeout: 5000 });
      const opened = await openedTab;
      // The tab exists before its navigation commits: wait for the URL rather than read about:blank.
      await opened.waitForURL(proseHref, { timeout: 10000 });
      assert.equal(
        opened.url(),
        proseHref,
        `opening a course page must go to its GitHub anchor; got ${opened.url()}`
      );
      assert(
        searchPage.url().includes('?lesson='),
        'opening a course page must leave the workbench on the lesson it was showing'
      );
      await opened.close();
      console.log('  ok ⌘⇧F finds the course pages and opens the section on GitHub beside the workbench');

      // `?` opens the sheet — and is a character inside the editor, where it has to stay text. Blur
      // first: the jump above left the caret in the editor, where `?` is Python.
      await searchPage.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      });
      await searchPage.keyboard.press('?');
      await searchPage.getByTestId('shortcuts-modal').waitFor({ timeout: 5000 });
      const sheet = (await searchPage.getByTestId('shortcuts-list').innerText()).replace(/\s+/g, ' ');
      for (const key of ['⌘K', '⌘P', '⌘⇧F', 'F9', 'F12', '⌥1 – ⌥4', '⌘.']) {
        assert.ok(sheet.includes(key), `the key sheet must name ${key}; read: ${sheet.slice(0, 200)}`);
      }
      assert(
        (await searchPage.getByTestId('shortcut-row').count()) >= 8,
        'the sheet must list the keys, not one line'
      );

      // A row's key is a button. It waits for a chord, prints it, refuses a clash by naming the
      // action that has the key, and the new chord is the one the page answers after a reload.
      await searchPage.getByTestId('btn-rebind-focus').click();
      assert.equal(
        (await searchPage.getByTestId('btn-rebind-focus').textContent())?.trim(),
        'Press keys…',
        'the row must say it is waiting for a key'
      );
      await searchPage.keyboard.press('Control+Shift+J');
      assert.equal(
        (await searchPage.getByTestId('btn-rebind-focus').textContent())?.trim(),
        '⌘⇧J',
        'the row must print the key it just learned'
      );
      await searchPage.keyboard.press('Escape');
      await searchPage.getByTestId('shortcuts-modal').waitFor({ state: 'detached', timeout: 5000 });
      await searchPage.keyboard.press('Control+Shift+J');
      // A mount, not a network round trip: the wait is generous because this suite runs in the
      // matrix's four-wide wave, where a sibling Chromium can hold the renderer for seconds.
      await searchPage.getByTestId('btn-focus-pill').waitFor({ timeout: 15000 });
      await searchPage.keyboard.press('Escape');
      await searchPage.getByTestId('btn-focus-pill').waitFor({ state: 'detached', timeout: 15000 });
      await searchPage.reload({ waitUntil: 'networkidle' });
      await searchPage.waitForFunction(() => (document.getElementById('root')?.children.length ?? 0) > 0, {
        timeout: 20000,
      });
      await searchPage.keyboard.press('Control+Shift+J');
      await searchPage.getByTestId('btn-focus-pill').waitFor({ timeout: 15000 });
      await searchPage.keyboard.press('Escape');
      await searchPage.getByTestId('btn-focus-pill').waitFor({ state: 'detached', timeout: 15000 });

      // ⌘K is the palette's: the clash is refused with its name, the row keeps waiting, and Escape
      // during capture cancels the key rather than closing the sheet.
      await searchPage.keyboard.press('?');
      await searchPage.getByTestId('shortcuts-modal').waitFor({ timeout: 5000 });
      await searchPage.getByTestId('btn-rebind-focus').click();
      await searchPage.keyboard.press('Control+k');
      await searchPage.waitForFunction(
        () => (document.querySelector('[data-testid="keymap-status"]')?.textContent ?? '').includes('already the palette'),
        undefined,
        { timeout: 5000 }
      );
      assert.equal(
        (await searchPage.getByTestId('btn-rebind-focus').textContent())?.trim(),
        'Press keys…',
        'a refused key must leave the row waiting for a different one'
      );
      await searchPage.keyboard.press('Escape');
      assert.equal(
        await searchPage.getByTestId('shortcuts-modal').count(),
        1,
        'Escape during capture cancels the key, not the sheet'
      );
      await searchPage.getByTestId('btn-reset-keymap').click();
      await searchPage.waitForFunction(
        () => (document.querySelector('[data-testid="keymap-status"]')?.textContent ?? '').includes('back to its shipped'),
        undefined,
        { timeout: 5000 }
      );
      assert.equal(
        await searchPage.getByTestId('btn-reset-keymap').count(),
        0,
        'with every key shipped again there is nothing to reset'
      );
      await searchPage.keyboard.press('Escape');
      await searchPage.getByTestId('shortcuts-modal').waitFor({ state: 'detached', timeout: 5000 });
      await searchPage.keyboard.press('Control+Period');
      await searchPage.getByTestId('btn-focus-pill').waitFor({ timeout: 5000 });
      await searchPage.keyboard.press('Escape');
      await searchPage.getByTestId('btn-focus-pill').waitFor({ state: 'detached', timeout: 5000 });
      console.log('  ok a sheet row learns a new key, refuses a clash by name, survives a reload and resets');

      await searchPage.keyboard.press('Escape');
      await searchPage.getByTestId('shortcuts-modal').waitFor({ state: 'detached', timeout: 5000 });
      await searchPage.locator('[data-editor="editor-main"] .cm-content').click();
      await searchPage.keyboard.press('?');
      await searchPage.waitForFunction(
        () => (window.__mechalabEditors?.['editor-main']?.get() ?? '').includes('?'),
        undefined,
        { timeout: 5000 }
      );
      assert.equal(
        await searchPage.getByTestId('shortcuts-modal').count(),
        0,
        '? typed into the editor is a character, not a shortcut'
      );
      // And the sheet has a door in the palette, so a learner who never guessed `?` can find it.
      await searchPage.keyboard.press('Control+k');
      await searchPage.getByTestId('command-palette').waitFor({ timeout: 5000 });
      await searchPage.getByTestId('input-palette-search').fill('shortcuts');
      await searchPage.getByTestId('palette-item-action-open-shortcuts').waitFor({ timeout: 5000 });
      await searchPage.keyboard.press('Enter');
      await searchPage.getByTestId('shortcuts-modal').waitFor({ timeout: 5000 });
      await searchPage.keyboard.press('Escape');
      await searchPage.getByTestId('shortcuts-modal').waitFor({ state: 'detached', timeout: 5000 });
      console.log('  ok ? opens the key sheet, stays a character in the editor, and ⌘K can find it');
    } finally {
      await searchContext.close();
    }

    // Study notes: what the learner writes down is stored as they type, and a pinned passage keeps
    // its place with it. A reload is the assertion that matters - anything the panel held in React
    // state alone would be gone, and the note is the part of a lesson that cannot be regenerated.
    const studyNote = 'Tolerance is on the angle, not the position.';
    await formattingPage.getByTestId('study-note').fill(studyNote);
    const storedStudy = await waitForBulk(formattingPage, STUDY_KEY, (study) =>
      Object.values(study).some((entry) => (entry.note ?? '').includes('Tolerance is on the angle'))
    );
    assert.ok(
      JSON.stringify(storedStudy).includes('Tolerance is on the angle'),
      'the note must reach the store once the learner pauses'
    );

    await formattingPage.getByTestId('panel-study').waitFor({ timeout: 30000 });
    const selectedLine = await formattingPage.evaluate(() => {
      const line = document.querySelector('[data-editor="editor-main"] .cm-line');
      if (!line) return '';
      const range = document.createRange();
      range.selectNodeContents(line);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      return selection.toString().replace(/\s+/g, ' ').trim();
    });
    assert.ok(selectedLine, 'expected a line of code to select in the editor');
    // The panel learns about a selection from `selectionchange`, which arrives a task later, so the
    // wait is for the button it enables. Then `click()` on the element rather than a mouse press: a
    // mousedown collapses the selection before the panel's handler can read it.
    await formattingPage.waitForFunction(
      () => {
        const button = document.querySelector('[data-testid="btn-pin-selection"]');
        return Boolean(button) && !button.disabled;
      },
      null,
      { timeout: 10000 }
    );
    await formattingPage.getByTestId('btn-pin-selection').evaluate((button) => button.click());
    await formattingPage.getByTestId('study-highlight-0').waitFor({ timeout: 5000 });
    assert.match(
      await formattingPage.getByTestId('study-highlight-0').innerText(),
      new RegExp(selectedLine.slice(0, 24).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      'the pinned highlight must be the passage that was selected'
    );

    await formattingPage.reload({ waitUntil: 'domcontentloaded' });
    await formattingPage.getByTestId('study-note').waitFor({ timeout: 60000 });
    assert.equal(
      await formattingPage.getByTestId('study-note').inputValue(),
      studyNote,
      'the note must still be in the box after a reload'
    );
    await formattingPage.getByTestId('study-highlight-0').waitFor({ timeout: 5000 });
    console.log('  ok a study note and a pinned highlight survive a reload');

    console.log(
      '[PASS] Real-browser Chromium E2E tests passed (Starter fail, Print-spoof rejection, SyntaxError, Infinite-loop Stop/Timeout recovery, Solution pass, CDN failure protection, Reload persistence, Last-lesson resume, Home’s Continue & hand-off, draft restore & step count, run history restore, Diff panel lines & earned solution reference, share link copied, opened and loaded, a pair session over hand-carried codes, two editors co-editing one document with undo staying each person’s own, inline values drawn then cleared by an edit, F12/Ctrl-click go-to-definition across the lesson’s files, watch mode re-running on a pause, run verdicts announced with their failing line, Scope trace as plot & table, cursor/zoom/A-B overlay, Portfolio export categories, Diagnostic/Exit Review tabs, whitespace-vs-formatting grading, shared-plant import, Start here collapse & dismiss/restore, per-pass first-step collapse, 08.1 bench-gated pass, Tier 3 budget-gated pass, CodeMirror highlighting/read-only helper/slider re-run, ⌘K palette open/find/open/close, ⌘P quick-open over lessons only, ⌘⇧F inside-the-lesson search landing on the hit’s line and finding a course page at its section, the ? key sheet open and inert in the editor, a sheet row rebound to a new key, a clash refused and a reset, study note & pinned highlight across a reload, gutter breakpoints clicked, keyed and remembered, a dot following an edit, the Board card showing its own sketch, a prediction graded against the verified serial, and the sketch copied for the simulator).'
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
