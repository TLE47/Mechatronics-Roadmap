#!/usr/bin/env node
/**
 * The robot dock's real-Python suite (scripts/test_robot_browser.mjs).
 *
 * For every robot lesson this suite proves the dock is the lesson, not a second exercise: the goal
 * above main.py is the lesson's own goal, running the lesson's full solution makes the arena show
 * the values that code binds, and the run leaves main.py byte-for-byte unchanged. It also proves
 * the dock is ungraded, that Reset clears it, and that a failing program leaves no invented reading.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { startDevServer, resolveChromiumExecutable } from './e2e_browser_workbench.mjs';
import { seedTourSeen } from './tour_seed.mjs';
import { getEditorCode, setEditorCode, waitForEditor } from './editor-code.mjs';
import { ROBOT_SCENARIOS } from '../app/src/robotSim/model.ts';

const RUN_TIMEOUT = 120_000;

async function openRobot(page, baseUrl, lessonId) {
  await page.goto(new URL('?lesson=' + encodeURIComponent(lessonId), baseUrl).href, {
    waitUntil: 'domcontentloaded',
  });
  await page.getByTestId('editor-tab-main').click();
  await page.getByTestId('robot-pane').waitFor({ timeout: 30_000 });
  await page.getByTestId('robot-stage').waitFor({ timeout: 30_000 });
}

async function waitForReading(page) {
  await page.waitForFunction(
    () => Boolean(document.querySelector('[data-testid="robot-stage"]')?.getAttribute('data-reading')),
    null,
    { timeout: RUN_TIMEOUT }
  );
}

async function waitForIdle(page) {
  await page.waitForFunction(
    () => {
      const status = document.querySelector('[data-testid="robot-status"]');
      return status && status.getAttribute('data-state') !== 'running';
    },
    null,
    { timeout: RUN_TIMEOUT }
  );
}

async function readStage(page) {
  return page.getByTestId('robot-stage').evaluate((stage) => {
    const raw = stage.getAttribute('data-reading') || '';
    return {
      lesson: stage.getAttribute('data-lesson'),
      reading: raw ? JSON.parse(raw) : null,
    };
  });
}

async function verifiedTally(page) {
  const text = (await page.getByTestId('runner-verified-count').textContent())?.trim() ?? '';
  const match = text.match(/^(\d+)\s*\/\s*(\d+)\s+Verified$/);
  assert.ok(match, 'verified tally must read "N / M Verified", got: ' + text);
  return text;
}

function normalized(text) {
  return String(text || '')
    .replace(/\u0060/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function assertReading(actual, expected, lessonId) {
  assert.ok(actual, lessonId + ': the stage must carry a reading');
  for (const [key, value] of Object.entries(expected)) {
    if (Array.isArray(value)) {
      assert.deepEqual(actual[key], value, lessonId + ': ' + key);
    } else if (typeof value === 'number') {
      assert.ok(
        typeof actual[key] === 'number' && Math.abs(actual[key] - value) < 1e-2,
        lessonId + ': ' + key + ' should be ' + value + ', got ' + actual[key]
      );
    } else {
      assert.equal(actual[key], value, lessonId + ': ' + key);
    }
  }
}

async function assertScenario(page, scenario) {
  const lesson = scenario.lesson;
  await openRobot(page, BASE, scenario.lessonId);

  const goal = normalized(await page.getByTestId('editor-goal-text').textContent());
  assert.equal(goal, normalized(lesson.goal), scenario.lessonId + ": the goal must be the lesson's goal");
  assert.equal(
    await page.getByTestId('robot-load-starter').count(),
    0,
    scenario.lessonId + ': the robot must not offer to replace main.py'
  );

  await setEditorCode(page, lesson.fullSolution);
  await waitForEditor(page);
  const codeBefore = await getEditorCode(page);
  assert.equal(codeBefore, lesson.fullSolution, scenario.lessonId + ': solution loaded');

  const before = await verifiedTally(page);
  await page.getByTestId('robot-run').click();
  await waitForReading(page);
  await waitForIdle(page);

  const stage = await readStage(page);
  assert.equal(stage.lesson, scenario.lessonId, scenario.lessonId + ': the stage names the lesson');
  assertReading(stage.reading, scenario.expected, scenario.lessonId);
  assert.equal(
    await page.getByTestId('robot-status').getAttribute('data-state'),
    'finished',
    scenario.lessonId + ': the dock reports a finished reading'
  );
  assert.equal(await getEditorCode(page), codeBefore, scenario.lessonId + ': Run robot must not change main.py');
  assert.equal(await verifiedTally(page), before, scenario.lessonId + ': a robot view is ungraded');

  const body = await page.locator('body').innerText();
  assert.doesNotMatch(body, /move_forward|turn_right|wall_ahead|draw a square/, scenario.lessonId + ': no old grid exercise');
  console.log('  ok   ' + scenario.lessonId + ' ' + lesson.title + ' -> ' + JSON.stringify(stage.reading));
}

async function assertResetClears(page) {
  const scenario = ROBOT_SCENARIOS[0];
  await openRobot(page, BASE, scenario.lessonId);
  await setEditorCode(page, scenario.lesson.fullSolution);
  await page.getByTestId('robot-run').click();
  await waitForReading(page);
  await waitForIdle(page);
  await page.getByTestId('robot-reset').click();
  const stage = await readStage(page);
  assert.equal(stage.reading, null, 'Reset clears the reading');
  assert.equal(
    await page.getByTestId('robot-status').getAttribute('data-state'),
    'idle',
    'Reset returns the status to idle'
  );
  console.log('  ok   Reset clears the last reading');
}

async function assertFailureLeavesNoReading(page) {
  const scenario = ROBOT_SCENARIOS[0];
  await openRobot(page, BASE, scenario.lessonId);
  await setEditorCode(page, 'raise RuntimeError("robot check")');
  await page.getByTestId('robot-run').click();
  await waitForIdle(page);
  const stage = await readStage(page);
  assert.equal(stage.reading, null, 'a failing program must not invent a reading');
  const text = await page.locator('body').innerText();
  assert.match(text, /RuntimeError/, 'the lesson code error is reported by the runner');
  console.log('  ok   a failing lesson program leaves the robot view empty');
}

// The combined gate hands over its warm server; a standalone run owns one.
const own = process.env.E2E_BASE_URL ? null : await startDevServer(process.cwd());
const BASE = own ? own.baseUrl : (process.env.E2E_BASE_URL.replace(/\/+$/, '') + '/');
const executablePath = resolveChromiumExecutable();
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), headless: true });
try {
  const context = await browser.newContext();
  await seedTourSeen(context);
  await context.addInitScript(() => {
    window.__mechalabPredictFirst = false;
  });
  const page = await context.newPage();
  console.log('\nthe lesson goals and the game views their own solutions drive:');
  for (const scenario of ROBOT_SCENARIOS) await assertScenario(page, scenario);
  console.log('\nthe dock edges:');
  await assertResetClears(page);
  await assertFailureLeavesNoReading(page);
  console.log('\nrobot browser checks passed\n');
} finally {
  await browser.close();
  if (own) await own.viteServer.close();
}
