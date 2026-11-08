#!/usr/bin/env node
/**
 * The robot simulator's real-Python suite (`scripts/test_robot_browser.mjs`).
 *
 * `test:robot` proves the model; this suite proves the *examples*. For every scenario it opens the
 * lesson, loads the scenario's own example into the live editor, reads that source back, runs it
 * through the shared Pyodide worker and the real robot bridge, then compares the stage the learner
 * sees against `scenario.expected`. It never calls `modelWalk`: that walk is a fast model fixture,
 * not evidence that the Python example does what the lesson says.
 *
 * It also drives the bridge's failure and control edges: an unknown command is a genuine Python
 * NameError, Reset cancels a run and no late reply revives it, and Pause/Step/Resume move exactly
 * one command at a time. A robot run is ungraded, so the verified tally must not move.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { startDevServer, resolveChromiumExecutable } from './e2e_browser_workbench.mjs';
import { seedTourSeen } from './tour_seed.mjs';
import { getEditorCode, setEditorCode, waitForEditor } from './editor-code.mjs';
import { ROBOT_SCENARIOS } from '../app/src/robotSim/model.ts';

const RUN_TIMEOUT = 120_000;
const STEP_TIMEOUT = 10_000;

async function openRobot(page, baseUrl, lessonId) {
  await page.goto(new URL(`?lesson=${encodeURIComponent(lessonId)}`, baseUrl).href, {
    waitUntil: 'domcontentloaded',
  });
  await page.getByTestId('editor-tab-robot').waitFor({ timeout: 30_000 });
  await page.getByTestId('editor-tab-robot').click();
  await page.getByTestId('robot-pane').waitFor({ timeout: 30_000 });
}

async function waitForRunButton(page) {
  await page.waitForFunction(
    () => {
      const button = document.querySelector('[data-testid="robot-run"]');
      return Boolean(button && !button.disabled);
    },
    null,
    { timeout: 30_000 }
  );
}

async function waitForFinished(page) {
  await page.waitForFunction(
    () => document.querySelector('[data-testid="robot-status"]')?.getAttribute('data-state') === 'finished',
    null,
    { timeout: RUN_TIMEOUT }
  );
}

async function readStage(page) {
  return page.getByTestId('robot-stage').evaluate((stage) => {
    const sensors = document.querySelector('[data-testid="robot-sensors"]');
    const observed = {};
    if (sensors.dataset.wallAhead === 'true' || sensors.dataset.wallAhead === 'false') {
      observed.wall_ahead = sensors.dataset.wallAhead === 'true';
    }
    if (sensors.dataset.wallDistance !== undefined && sensors.dataset.wallDistance !== '') {
      observed.wall_distance = Number(sensors.dataset.wallDistance);
    }
    return {
      x: Number(stage.dataset.x),
      y: Number(stage.dataset.y),
      heading: Number(stage.dataset.heading),
      trail: Number(stage.dataset.trail),
      said: stage.dataset.said || undefined,
      completed: stage.dataset.complete === 'true',
      sensors: observed,
    };
  });
}

async function verifiedTally(page) {
  const text = (await page.getByTestId('runner-verified-count').textContent())?.trim() ?? '';
  const match = text.match(/^(\d+)\s*\/\s*(\d+)\s+Verified$/);
  assert.ok(match, `verified tally must read "N / M Verified", got: ${text}`);
  return text;
}

async function runExample(page) {
  await page.getByTestId('robot-load-example').click();
  // The editor is a lazy chunk. Wait for its bridge instead of racing it: the click only updates
  // React state, and the bridge appears once the editor has mounted.
  return getEditorCode(page);
}

async function assertScenario(page, scenario) {
  const { expected } = scenario;
  await openRobot(page, BASE, scenario.lessonId);
  const before = await verifiedTally(page);
  const source = await runExample(page);
  assert.equal(source, scenario.example, `${scenario.lessonId}: the editor must hold the scenario's real example`);
  await waitForRunButton(page);
  await page.getByTestId('robot-run').click();
  await waitForFinished(page);

  const observed = await readStage(page);
  assert.equal(observed.x, expected.x, `${scenario.lessonId}: final x`);
  assert.equal(observed.y, expected.y, `${scenario.lessonId}: final y`);
  assert.equal(observed.heading, expected.heading, `${scenario.lessonId}: final heading`);
  assert.equal(observed.trail, expected.trail, `${scenario.lessonId}: trail length`);
  assert.equal(observed.said, expected.said, `${scenario.lessonId}: said output`);
  assert.deepEqual(observed.sensors, expected.sensors ?? {}, `${scenario.lessonId}: sensor readings`);
  assert.equal(observed.completed, expected.completed, `${scenario.lessonId}: completed flag`);
  assert.equal(
    await page.getByTestId('robot-success').count(),
    expected.completed ? 1 : 0,
    `${scenario.lessonId}: success badge follows completion`
  );
  assert.equal(await verifiedTally(page), before, `${scenario.lessonId}: a robot run must stay ungraded`);
  console.log(`  ok   ${scenario.lessonId} example -> x=${observed.x}, y=${observed.y}, trail=${observed.trail}`);
}

async function assertPythonErrors(page) {
  await openRobot(page, BASE, 'P.1');
  const before = await verifiedTally(page);
  await page.getByTestId('editor-tab-main').click();
  await waitForEditor(page);
  await setEditorCode(page, 'turn_right()');
  await page.getByTestId('editor-tab-robot').click();
  await waitForRunButton(page);
  await page.getByTestId('robot-run').click();
  await waitForFinished(page);
  const text = await page.locator('body').innerText();
  assert.match(text, /NameError/, 'turn_right is not in P.1, so Python itself must raise NameError');
  const afterName = await readStage(page);
  assert.equal(afterName.x, 1);
  assert.equal(afterName.y, 4);
  assert.equal(afterName.trail, 1, 'an error keeps the state the code reached, not a half-moved robot');
  assert.equal(await verifiedTally(page), before, 'a failed robot run must stay ungraded');
  console.log('  ok   P.1 unknown command -> NameError, state kept, tally unchanged');
}

async function assertResetCancels(page) {
  const scenario = ROBOT_SCENARIOS.find((entry) => entry.lessonId === 'P.4');
  await openRobot(page, BASE, scenario.lessonId);
  const source = await runExample(page);
  assert.equal(source, scenario.example);
  await page.getByTestId('robot-run').click();
  await page.waitForFunction(
    () => Number(document.querySelector('[data-testid="robot-stage"]')?.dataset.trail) >= 3,
    null,
    { timeout: STEP_TIMEOUT }
  );
  await page.getByTestId('robot-reset').click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="robot-status"]')?.getAttribute('data-state') === 'idle',
    null,
    { timeout: STEP_TIMEOUT }
  );
  const reset = await readStage(page);
  assert.deepEqual(
    { x: reset.x, y: reset.y, heading: reset.heading, trail: reset.trail },
    { x: scenario.start.x, y: scenario.start.y, heading: scenario.start.heading, trail: 1 }
  );
  await page.waitForTimeout(700);
  const later = await readStage(page);
  assert.deepEqual(later, reset, 'after Reset, a late animation reply must not move the robot');
  console.log('  ok   Reset cancels the run; a late reply cannot revive it');
}

async function assertPauseStepResume(page) {
  const scenario = ROBOT_SCENARIOS.find((entry) => entry.lessonId === 'P.4');
  await openRobot(page, BASE, scenario.lessonId);
  const source = await runExample(page);
  assert.equal(source, scenario.example);
  await page.getByTestId('robot-run').click();
  await page.waitForFunction(
    () => Number(document.querySelector('[data-testid="robot-stage"]')?.dataset.trail) >= 3,
    null,
    { timeout: STEP_TIMEOUT }
  );
  await page.getByTestId('robot-pause').click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="robot-status"]')?.getAttribute('data-state') === 'paused',
    null,
    { timeout: STEP_TIMEOUT }
  );
  const paused = await readStage(page);
  await page.waitForTimeout(600);
  assert.deepEqual(await readStage(page), paused, 'Pause parks at the next robot command');
  await page.getByTestId('robot-step').click();
  await page.waitForTimeout(600);
  const stepped = await readStage(page);
  assert.ok(
    stepped.trail > paused.trail || stepped.heading !== paused.heading,
    'Step must execute exactly the next robot command'
  );
  await page.getByTestId('robot-resume').click();
  await waitForFinished(page);
  const finished = await readStage(page);
  assert.equal(finished.x, scenario.expected.x);
  assert.equal(finished.y, scenario.expected.y);
  assert.equal(finished.heading, scenario.expected.heading);
  assert.equal(finished.trail, scenario.expected.trail);
  assert.equal(finished.completed, true);
  console.log('  ok   Pause holds, Step advances one command, Resume finishes the example');
}

// The combined gate hands over its warm server; a standalone run owns one.
const own = process.env.E2E_BASE_URL ? null : await startDevServer(process.cwd());
const BASE = own ? own.baseUrl : `${process.env.E2E_BASE_URL.replace(/\/+$/, '')}/`;
const executablePath = resolveChromiumExecutable();
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), headless: true });
try {
  const context = await browser.newContext();
  await seedTourSeen(context);
  await context.addInitScript(() => {
    window.__mechalabPredictFirst = false;
    window.__mechalabRobotStepMs = 180;
  });
  const page = await context.newPage();
  console.log('\nthe real Python examples, through Pyodide:');
  for (const scenario of ROBOT_SCENARIOS) await assertScenario(page, scenario);
  console.log('\nthe bridge edges:');
  await assertPythonErrors(page);
  await assertResetCancels(page);
  await assertPauseStepResume(page);
  console.log('\nrobot browser checks passed\n');
} finally {
  await browser.close();
  if (own) await own.viteServer.close();
}
