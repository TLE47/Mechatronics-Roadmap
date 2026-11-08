#!/usr/bin/env node
/**
 * The study clock's rendered session log (`scripts/e2e_study_clock.mjs`).
 *
 * `test:studyclock` pins the arithmetic in `studyTimer.ts`; this suite pins what the learner sees.
 * It seeds two paused/resumed stretches and reads the rendered row, so the assertion is about the
 * component's output: a time of day and the study-clock reading on every press, the stretch each
 * pause ended, and a separate session total. Seeding a paused timer is a supported stored state, and
 * it makes every printed number exact instead of racing a real clock.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { startDevServer, resolveChromiumExecutable } from './e2e_browser_workbench.mjs';
import { seedTourSeen } from './tour_seed.mjs';

const MINUTE = 60_000;
const now = Date.now();
const start = now - 12 * MINUTE;
const firstPause = start + 4 * MINUTE;
const firstResume = firstPause + 2 * MINUTE;
const secondPause = firstResume + 2 * MINUTE;
const secondResume = secondPause + 1 * MINUTE;
const lastPause = secondResume + 3 * MINUTE;
const timer = {
  bankedMs: 9 * MINUTE,
  runningSince: null,
  lastTick: lastPause,
  lesson: 'P.1',
  log: [
    { action: 'start', at: start, clockMs: 0, stretchMs: null },
    { action: 'pause', at: firstPause, clockMs: 4 * MINUTE, stretchMs: 4 * MINUTE },
    { action: 'resume', at: firstResume, clockMs: 4 * MINUTE, stretchMs: null },
    { action: 'pause', at: secondPause, clockMs: 6 * MINUTE, stretchMs: 2 * MINUTE },
    { action: 'resume', at: secondResume, clockMs: 6 * MINUTE, stretchMs: null },
    { action: 'pause', at: lastPause, clockMs: 9 * MINUTE, stretchMs: 3 * MINUTE },
  ],
};

/** The same wall-clock format the component prints, in the machine's own time zone. */
function timeOfDay(at) {
  const date = new Date(at);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// The combined gate hands over its warm server; a standalone run owns one.
const own = process.env.E2E_BASE_URL ? null : await startDevServer(process.cwd());
const baseUrl = own ? own.baseUrl : `${process.env.E2E_BASE_URL.replace(/\/+$/, '')}/`;
const executablePath = resolveChromiumExecutable();
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), headless: true });
try {
  const context = await browser.newContext();
  await seedTourSeen(context);
  await context.addInitScript((seed) => {
    localStorage.setItem('mechalab_study_timer_v1', JSON.stringify(seed));
    window.__mechalabPredictFirst = false;
  }, timer);
  const page = await context.newPage();
  await page.goto(new URL('?lesson=P.1', baseUrl).href, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('study-clock-log').waitFor({ timeout: 30_000 });

  const session = (await page.getByTestId('study-clock-session').innerText()).trim();
  const lines = (await page.getByTestId('study-clock-entry').allInnerTexts()).map((line) => line.trim());
  console.log('  rendered study clock log:');
  console.log(`    Session ${session}`);
  for (const line of lines) console.log(`    ${line}`);

  assert.equal(session, '0:09:00', 'the session total is printed separately from the presses');

  assert.deepEqual(
    lines,
    [
      `${timeOfDay(start)} Started · study clock 0:00:00`,
      `${timeOfDay(firstPause)} Paused · study clock 0:04:00 · stretch 0:04:00`,
      `${timeOfDay(firstResume)} Resumed · study clock 0:04:00`,
      `${timeOfDay(secondPause)} Paused · study clock 0:06:00 · stretch 0:02:00`,
      `${timeOfDay(secondResume)} Resumed · study clock 0:06:00`,
      `${timeOfDay(lastPause)} Paused · study clock 0:09:00 · stretch 0:03:00`,
    ],
    'every press must print its own time of day and study-clock reading, in order'
  );

  const text = await page.getByTestId('study-clock-log').innerText();
  assert.doesNotMatch(text, /Session[^\n]*Started/, 'the session total is its own line, not folded into a press');
  console.log(
    '  ok   every Start, Pause and Resume prints its time + study clock; the session 0:09:00 is separate'
  );
  console.log('\nstudy clock rendered-log checks passed\n');
} finally {
  await browser.close();
  if (own) await own.viteServer.close();
}
