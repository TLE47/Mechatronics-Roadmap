#!/usr/bin/env node
/**
 * The study note's suppression contract (`scripts/test_study_tips.mjs`, `npm run test:study-tips`).
 *
 * The study note is a timed surface: one card, 35 s after the app mounts, only while the tab is
 * visible and the learner has been still for 20 s. The feature walkthrough opens over the workbench
 * and suppresses it. That rule was verified by hand in a browser once; this gate makes it a fact a
 * push has to keep.
 *
 * Three windows matter, and each one is observed:
 *
 * - a note that would fire while the tour is open stays hidden;
 * - a note already on screen is cleared the moment the tour opens;
 * - the next note appears once the tour closes.
 *
 * Playwright's fake clock is installed before the app boots, so the 35 s timer is the mocked one and
 * the three windows cost milliseconds rather than the minutes a real wait would. The first window
 * starts with no note shown — the only state in which "would have fired" means anything.
 *
 * It drives the built bundle on the headless shell, like the primitive and animation gates, and
 * prints one line per check. Exit 0 when every line is `ok`.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { ensureBuilt, startStaticServer } from './e2e_pages_bundle.mjs';
import { seedTourSeen } from './tour_seed.mjs';

const CACHE = path.join(process.env.HOME ?? '', '.cache', 'ms-playwright');

/** The renderer the surface baseline was measured with — see `docs/VERIFICATION.md`. */
function browserPath() {
  const override = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (override && fs.existsSync(override)) return override;
  if (fs.existsSync(CACHE)) {
    const builds = fs
      .readdirSync(CACHE)
      .filter((name) => name.startsWith('chromium_headless_shell-'))
      .sort()
      .reverse();
    for (const build of builds) {
      for (const inner of fs.readdirSync(path.join(CACHE, build))) {
        const candidate = path.join(CACHE, build, inner, 'chrome-headless-shell');
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }
  return chromium.executablePath();
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

await ensureBuilt();
const { server, port } = await startStaticServer();
const baseUrl = `http://127.0.0.1:${port}/Mechatronics-Roadmap/`;
const browser = await chromium.launch({
  executablePath: browserPath(),
  args: ['--no-sandbox', '--force-device-scale-factor=1', '--font-render-hinting=none'],
});

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  });
  // The intro tour and the reopening learner guide are for a person, not a harness: both would sit
  // over the header door this gate presses. Seeded before the app boots, the same way the primitive
  // and animation gates do it.
  await seedTourSeen(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Fake time before the app boots, so the study note's 35 s first delay is the clock's timer.
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.goto(`${baseUrl}?lesson=P.1`, { waitUntil: 'load' });
  await page.locator('[data-testid="btn-page-walkthrough"]').waitFor({ state: 'visible', timeout: 30000 });

  const tip = page.locator('[data-testid="study-tip"]');
  const tour = page.locator('[data-testid="walkthrough-card"]');

  const openTour = async () => {
    await page.locator('[data-testid="btn-page-walkthrough"]').click();
    await tour.waitFor({ state: 'visible', timeout: 15000 });
    // The card places itself in an effect and follows its anchor on a 120 ms clock. Advance the fake
    // clock so both have run, then require the spotlight, not merely the card's markup.
    await page.clock.runFor(600);
    await page.waitForTimeout(100);
    await page.locator('[data-testid="walkthrough-spotlight"]').waitFor({ state: 'visible', timeout: 8000 });
  };

  const closeTour = async () => {
    await page.locator('[data-testid="walkthrough-close"]').click();
    await tour.waitFor({ state: 'detached', timeout: 10000 });
    await page.clock.runFor(200);
    await page.waitForTimeout(100);
  };

  // 1. Open the tour before the first 35 s tick, then cross the tick with it open. If suppression
  //    ever stops unmounting the timer, the note lands here.
  await openTour();
  const progress = (await page.locator('[data-testid="walkthrough-progress"]').innerText()).trim();
  await page.clock.runFor(40_000);
  await page.waitForTimeout(120);
  const during = await tip.count();
  check('the tour opens on its first stop', /^01 \/ \d+/.test(progress), progress);
  check('a study note that would fire during the tour stays hidden', during === 0, `${during} note(s)`);

  // 2. Close it: the next 35 s tick must reach the page. This is what proves the hidden note above
  //    was suppressed rather than a timer that never existed.
  await closeTour();
  await page.clock.runFor(40_000);
  await tip.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  const afterClose = await tip.count();
  const tipId = afterClose ? await tip.getAttribute('data-tip-id') : null;
  check('closing the tour lets the next study note through', afterClose === 1 && Boolean(tipId), `${tipId ?? 'none'}`);

  // 3. Open the tour over the visible note: it must be gone at once, not after its 18 s lifetime.
  await openTour();
  const afterOpen = await tip.count();
  check('opening the tour clears a note already on screen', afterOpen === 0, `${afterOpen} note(s)`);

  // 4. Cross another window with the tour still open: still clear.
  await page.clock.runFor(40_000);
  await page.waitForTimeout(120);
  const later = await tip.count();
  check(
    'the window after reopening the tour stays clear',
    later === 0 && (await tour.count()) === 1,
    `${later} note(s), tour ${(await tour.count()) === 1 ? 'open' : 'closed'}`
  );

  check('no page errors', errors.length === 0, errors.slice(0, 2).join(' · '));
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((entry) => !entry.ok);
if (failed.length) {
  console.error(`\n[FAIL] study tips: ${failed.length} of ${results.length} checks failed.`);
  process.exitCode = 1;
} else {
  console.log(`\n[PASS] study tips: ${results.length} checks — suppression, clearing and return all hold.`);
}
