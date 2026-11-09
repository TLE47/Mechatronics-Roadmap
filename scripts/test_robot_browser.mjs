#!/usr/bin/env node
/**
 * The Robot tab's real-Python suite (scripts/test_robot_browser.mjs).
 *
 * For every robot lesson this suite proves the tab is the lesson, not a second exercise: the goal
 * above main.py is the lesson's own goal, running the lesson's full solution makes the arena show
 * the values that code binds, and the run leaves main.py byte-for-byte unchanged. It also proves
 * the tab is ungraded, that Reset clears it, that Stop and Reset clear the line box mid-run, that a
 * failing program leaves no invented reading, that the step-speed switch selects without editing or
 * grading, and that the same run fits and works at 360x740, 390x844 and 412x915.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { startDevServer, resolveChromiumExecutable } from './e2e_browser_workbench.mjs';
import { seedTourSeen } from './tour_seed.mjs';
import { getEditorCode, setEditorCode, waitForEditor } from './editor-code.mjs';
import { ROBOT_SCENARIOS } from '../app/src/robotSim/model.ts';

const RUN_TIMEOUT = 120_000;
// A line that sleeps keeps the interpreter running long enough for the box and the toolbar's Stop
// control to exist together; the lesson program itself is never edited by the test's fixture.
const MID_RUN_CODE = 'import time\n\nrobot_mode = "ACTIVE"\ntime.sleep(4)\n';

async function openRobot(page, baseUrl, lessonId) {
  await page.goto(new URL('?lesson=' + encodeURIComponent(lessonId), baseUrl).href, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(
    () =>
      Boolean(
        document.querySelector('[data-testid="editor-tab-robot"]') ||
          document.querySelector('[data-testid="phone-surface-code"]')
      ),
    null,
    { timeout: 30_000 }
  );
  if (!(await page.getByTestId('editor-tab-robot').isVisible())) {
    await page.getByTestId('phone-surface-code').click();
  }
  await page.getByTestId('editor-tab-robot').click();
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
    await page.getByTestId('editor-tab-robot').getAttribute('aria-selected'),
    'true',
    scenario.lessonId + ': the Robot result tab must be selected'
  );
  assert.equal(await page.getByTestId('robot-dock').count(), 0, scenario.lessonId + ': the robot is a tab, not a dock');
  assert.equal(
    await page.getByTestId('robot-pane').getAttribute('data-tab'),
    '1',
    scenario.lessonId + ': the pane must identify itself as the Robot tab'
  );
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
    scenario.lessonId + ': the tab reports a finished reading'
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

async function boxState(page) {
  return page.evaluate(() => {
    const pane = document.querySelector('[data-testid="robot-pane"]');
    return {
      line: pane?.getAttribute('data-running-line') ?? '',
      boxed: Boolean(document.querySelector('[data-editor="editor-main"] .cm-robot-trace-line')),
      state: document.querySelector('[data-testid="robot-status"]')?.getAttribute('data-state') ?? '',
    };
  });
}

async function startMidRunRobot(page) {
  const scenario = ROBOT_SCENARIOS.find((entry) => entry.lessonId === 'P.5');
  assert.ok(scenario, 'the mid-run checks need the P.5 robot lesson');
  await openRobot(page, BASE, scenario.lessonId);
  await setEditorCode(page, MID_RUN_CODE);
  await waitForEditor(page);
  await page.getByTestId('robot-speed-slow').click();
  await page.getByTestId('robot-run').click();
  await page.waitForFunction(
    () => {
      const pane = document.querySelector('[data-testid="robot-pane"]');
      const stop = document.querySelector('[data-testid="btn-stop-execution"]');
      const box = document.querySelector('[data-editor="editor-main"] .cm-robot-trace-line');
      return Boolean(box && stop && Number(pane?.getAttribute('data-running-line') || 0) > 0);
    },
    null,
    { timeout: 30_000 }
  );
  return boxState(page);
}

async function assertBoxCleared(page, action) {
  try {
    await page.waitForFunction(
      () => {
        const pane = document.querySelector('[data-testid="robot-pane"]');
        return (
          !document.querySelector('[data-editor="editor-main"] .cm-robot-trace-line') &&
          !pane?.getAttribute('data-running-line') &&
          document.querySelector('[data-testid="robot-status"]')?.getAttribute('data-state') !== 'running'
        );
      },
      null,
      { timeout: 10_000 }
    );
  } catch (error) {
    console.log('  diag ' + action + ' ' + JSON.stringify(await boxState(page)));
    throw error;
  }
  // A queued frame must not put the box back after the action cleared it.
  await page.waitForTimeout(600);
  const state = await boxState(page);
  assert.equal(state.boxed, false, action + ' clears the line box');
  assert.equal(state.line, '', action + ' clears data-running-line');
  assert.notEqual(state.state, 'running', action + ' returns the robot to an idle status');
}

async function assertStopClearsMidRun(page) {
  const before = await startMidRunRobot(page);
  assert.ok(before.boxed, 'Stop check: a line box must exist before clicking Stop');
  await page.getByTestId('btn-stop-execution').click();
  await assertBoxCleared(page, 'Stop');
  console.log('  ok   Stop clears the line box while the robot is mid-run');
}

async function assertResetClearsMidRun(page) {
  const before = await startMidRunRobot(page);
  assert.ok(before.boxed, 'Reset check: a line box must exist before clicking Reset');
  await page.getByTestId('robot-reset').click();
  await assertBoxCleared(page, 'Reset');
  console.log('  ok   Reset clears the line box while the robot is mid-run');
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

async function assertPartialFailureLeavesNoReading(page) {
  const scenario = ROBOT_SCENARIOS[0];
  await openRobot(page, BASE, scenario.lessonId);
  await setEditorCode(page, 'robot_mode = "ACTIVE"\nraise RuntimeError("after a value")');
  await page.getByTestId('robot-run').click();
  await waitForIdle(page);
  const stage = await readStage(page);
  assert.equal(stage.reading, null, 'a program that binds a value then fails must not keep that partial reading');
  console.log('  ok   a partial reading is cleared when its run fails');
}

async function assertSpeedControl(page) {
  const scenario = ROBOT_SCENARIOS[0];
  await openRobot(page, BASE, scenario.lessonId);
  await setEditorCode(page, scenario.lesson.fullSolution);
  await waitForEditor(page);
  const codeBefore = await getEditorCode(page);

  assert.equal(
    await page.getByTestId('robot-pane').getAttribute('data-speed'),
    'normal',
    'the robot starts at normal speed'
  );
  assert.equal(
    await page.getByTestId('robot-speed-normal').getAttribute('aria-pressed'),
    'true',
    'normal speed starts selected'
  );

  await page.getByTestId('robot-speed-fast').click();
  assert.equal(await page.getByTestId('robot-pane').getAttribute('data-speed'), 'fast');
  assert.equal(await page.getByTestId('robot-speed-fast').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByTestId('robot-speed-normal').getAttribute('aria-pressed'), 'false');

  await page.getByTestId('robot-speed-slow').click();
  assert.equal(await page.getByTestId('robot-pane').getAttribute('data-speed'), 'slow');
  assert.equal(await page.getByTestId('robot-speed-slow').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByTestId('robot-speed-fast').getAttribute('aria-pressed'), 'false');
  assert.equal(await getEditorCode(page), codeBefore, 'changing speed must not edit main.py');

  // The switch changes only the hold between sampled lines: the lesson still runs, reads and stays
  // ungraded exactly as it does at 1x.
  await page.getByTestId('robot-speed-fast').click();
  const before = await verifiedTally(page);
  await page.getByTestId('robot-run').click();
  await waitForReading(page);
  await waitForIdle(page);
  const stage = await readStage(page);
  assertReading(stage.reading, scenario.expected, 'fast robot speed');
  assert.equal(await getEditorCode(page), codeBefore, 'a robot run at 2x must not edit main.py');
  assert.equal(await verifiedTally(page), before, 'a robot run at 2x must stay ungraded');
  console.log('  ok   speeds 0.5x, 1x and 2x select without editing or grading main.py');
}

async function assertStepByStep(page) {
  const scenario = ROBOT_SCENARIOS.find((entry) => entry.lessonId === 'P.5');
  assert.ok(scenario, 'the step check needs the P.5 robot lesson');
  await openRobot(page, BASE, scenario.lessonId);
  await setEditorCode(page, scenario.lesson.fullSolution);
  await page.getByTestId('robot-run').click();
  const lines = new Set();
  let sawBox = false;
  for (let index = 0; index < 240; index += 1) {
    const state = await page.evaluate(() => {
      const pane = document.querySelector('[data-testid="robot-pane"]');
      const box = document.querySelector('[data-editor="editor-main"] .cm-robot-trace-line');
      const status = document.querySelector('[data-testid="robot-status"]');
      return {
        line: Number(pane?.getAttribute('data-running-line') || 0),
        boxed: Boolean(box),
        running: status?.getAttribute('data-state') === 'running',
      };
    });
    if (state.line > 0) lines.add(state.line);
    if (state.boxed) sawBox = true;
    if (!state.running) break;
    await page.waitForTimeout(20);
  }
  await waitForIdle(page);
  assert.ok(sawBox, 'P.5: the editor must draw a box around the running line');
  assert.ok(lines.size >= 3, 'P.5: the run must visit several main.py lines, saw ' + [...lines].join(','));
  assert.equal(
    await page.evaluate(() => document.querySelector('[data-editor="editor-main"] .cm-robot-trace-line')),
    null,
    'P.5: the line box must clear when the run ends'
  );
  const stage = await readStage(page);
  assertReading(stage.reading, scenario.expected, 'P.5 step stream');
  console.log('  ok   P.5 steps through lines ' + [...lines].sort((a, b) => a - b).join(', '));
}

async function assertMobileViewport(browser, baseUrl, viewport, scenario) {
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
  await seedTourSeen(context);
  await context.addInitScript(() => {
    window.__mechalabPredictFirst = false;
  });
  const page = await context.newPage();
  try {
    await openRobot(page, baseUrl, scenario.lessonId);
    await setEditorCode(page, scenario.lesson.fullSolution);
    await waitForEditor(page);
    const codeBefore = await getEditorCode(page);

    await page.getByTestId('robot-run').click();
    await waitForReading(page);
    await waitForIdle(page);
    const stage = await readStage(page);
    assertReading(stage.reading, scenario.expected, scenario.lessonId + ' at ' + viewport.width + 'px');
    assert.equal(
      await getEditorCode(page),
      codeBefore,
      scenario.lessonId + ' at ' + viewport.width + 'px: Run robot must not change main.py'
    );

    const layout = await page.evaluate(() => {
      const box = (selector) => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height,
        };
      };
      const pane = document.querySelector('[data-testid="robot-pane"]');
      const tab = document.querySelector('[data-testid="editor-tab-robot"]');
      return {
        viewport: window.innerWidth,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        pane: box('[data-testid="robot-pane"]'),
        stage: box('[data-testid="robot-stage"]'),
        run: box('[data-testid="robot-run"]'),
        speed: box('[data-testid="robot-speed-control"]'),
        tab: box('[data-testid="editor-tab-robot"]'),
        paneOverflow: pane ? pane.scrollWidth - pane.clientWidth : null,
        tabSelected: tab?.getAttribute('aria-selected'),
        tabVisible: Boolean(tab && tab.getClientRects().length),
      };
    });

    const at = scenario.lessonId + ' at ' + viewport.width + 'x' + viewport.height;
    assert.equal(layout.overflow, 0, at + ': the page must not scroll sideways');
    assert.ok(
      layout.pane && layout.stage && layout.run && layout.speed,
      at + ': the pane, stage, Run control and speed switch must be present'
    );
    assert.ok(layout.pane.left >= -1 && layout.pane.right <= layout.viewport + 1, at + ': the pane must fit the viewport');
    assert.ok(layout.stage.left >= -1 && layout.stage.right <= layout.viewport + 1, at + ': the stage must fit the viewport');
    assert.equal(layout.paneOverflow, 0, at + ': the robot pane must not scroll sideways');
    assert.ok(layout.run.height >= 36, at + ': the Run control must keep a touch-sized target');
    assert.ok(
      layout.speed.left >= -1 && layout.speed.right <= layout.viewport + 1,
      at + ': the speed switch must fit the viewport'
    );
    assert.ok(layout.speed.height >= 24, at + ': the speed switch must keep a compact target');
    assert.equal(layout.tabSelected, 'true', at + ': the Robot tab must be selected');
    assert.equal(layout.tabVisible, true, at + ': the Robot tab must be visible');
    console.log(
      '  ok   ' + at + ' -> pane ' + Math.round(layout.pane.width) + 'px, stage ' + Math.round(layout.stage.width) + 'px'
    );
  } finally {
    await context.close();
  }
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
  console.log('\nthe tab edges:');
  await assertResetClears(page);
  await assertStopClearsMidRun(page);
  await assertResetClearsMidRun(page);
  await assertFailureLeavesNoReading(page);
  await assertPartialFailureLeavesNoReading(page);
  await assertSpeedControl(page);
  await assertStepByStep(page);

  console.log('\nthe Robot tab at phone widths:');
  const phoneScenario = ROBOT_SCENARIOS.find((entry) => entry.lessonId === 'P.4');
  assert.ok(phoneScenario, 'the mobile check needs the P.4 robot lesson');
  for (const viewport of [
    { width: 360, height: 740 },
    { width: 390, height: 844 },
    { width: 412, height: 915 },
  ]) {
    await assertMobileViewport(browser, BASE, viewport, phoneScenario);
  }
  console.log('\nrobot browser checks passed\n');
} finally {
  await browser.close();
  if (own) await own.viteServer.close();
}
