#!/usr/bin/env node
/**
 * The Robot tab's real-Python suite (scripts/test_robot_browser.mjs).
 *
 * For every robot lesson this suite proves the tab is the lesson, not a second exercise: the goal
 * above main.py is the lesson's own goal, running the lesson's full solution makes the arena show
 * the values that code binds, and the run leaves main.py byte-for-byte unchanged. It also proves
 * the tab is ungraded, that Reset clears it, that Stop and Reset clear the line box mid-run, that a
 * failing program leaves no invented reading, that the step-speed switch selects without editing or
 * grading, and that the same run fits and works at 360x740, 390x844 and 412x915. At 1440x900 the
 * arena is a desktop surface with room to spread out, so the same run also has to keep its 16px
 * radius, one Live signals header, the four drawn speed modes, and labels that never share a pixel.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { startDevServer, resolveChromiumExecutable } from './e2e_browser_workbench.mjs';
import { seedTourSeen } from './tour_seed.mjs';
import { seedRobotTourSeen } from './robot_tour_seed.mjs';
import { getEditorCode, setEditorCode, waitForEditor } from './editor-code.mjs';
import { ROBOT_SCENARIOS } from '../app/src/robotSim/model.ts';

const RUN_TIMEOUT = 120_000;
// A line that sleeps keeps the interpreter running long enough for the box and the toolbar's Stop
// control to exist together; the lesson program itself is never edited by the test's fixture.
const MID_RUN_CODE = 'import time\n\nrobot_mode = "ACTIVE"\ntime.sleep(4)\n';

// The line each mission value is written on in the lesson's own full solution. The P.3 entries
// are branch lines: a static "last assignment" lookup would name 12 and 20, which never run.
const SOURCE_LINES = {
  'P.1': { mode: 8, encoderTicks: 6, batteryVolts: 7, eStop: 4 },
  'P.3': { clampedHigh: 8, clampedLow: 18, safeOutput: 23 },
  'P.4': { clampedCommands: 12, totalCommand: 13, meanCommand: 15 },
  'P.5': { step: 12, positionM: 11 },
};

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

async function missionState(page) {
  return page.evaluate(() => {
    const card = document.querySelector('[data-testid="robot-mission"]');
    const stage = document.querySelector('[data-testid="robot-stage"]');
    const buttons = [...document.querySelectorAll('button[data-testid^="robot-goal-"]')];
    return {
      state: card?.getAttribute('data-goal-state') ?? '',
      met: Number(card?.getAttribute('data-goal-met') ?? -1),
      total: Number(card?.getAttribute('data-goal-total') ?? -1),
      chips: buttons.map((button) => ({
        id: button.getAttribute('data-testid'),
        met: button.getAttribute('data-met'),
        pressed: button.getAttribute('aria-pressed'),
        sourceLine: button.getAttribute('data-source-line') ?? '',
      })),
      target: stage?.getAttribute('data-target') ?? '',
      position: Number(stage?.getAttribute('data-robot-position') ?? -1),
      banner: Boolean(document.querySelector('[data-testid="robot-goal-banner"]')),
      hint: document.querySelector('[data-testid="robot-goal-hint"]')?.textContent?.trim() ?? '',
      source: document.querySelector('[data-testid="robot-goal-source"]')?.textContent?.trim() ?? '',
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

  // The lesson goal above main.py is the brief. This tab must not repeat it as a headline, a
  // target list or a spelled-out objective: the destination, the movement and the signal chips
  // carry the goal instead. Keep this assertion copy-level so it does not pin any one drawing.
  const visibleCopy = normalized(await page.getByTestId('robot-pane').innerText());
  assert.doesNotMatch(
    visibleCopy,
    /\b(goal|targets?)\b/i,
    scenario.lessonId + ': the Robot tab must not spell the goal out, got: ' + visibleCopy
  );

  const pristine = await missionState(page);
  assert.equal(pristine.state, 'idle', scenario.lessonId + ': the mission starts idle');
  assert.equal(pristine.met, 0, scenario.lessonId + ': no target is met before a run');
  assert.equal(pristine.banner, false, scenario.lessonId + ': no goal banner before a run');
  assert.ok(pristine.target && pristine.target !== '—', scenario.lessonId + ': the target is known before a run');
  assert.ok(pristine.chips.length >= 2, scenario.lessonId + ': the mission lists its targets');
  for (const chip of pristine.chips) assert.equal(chip.met, 'false', scenario.lessonId + ': ' + chip.id + ' starts unmet');

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

  const mission = await missionState(page);
  assert.equal(mission.state, 'reached', scenario.lessonId + ': the mission reports the goal reached');
  assert.equal(mission.met, mission.total, scenario.lessonId + ': every mission target is met');
  assert.equal(mission.chips.length, mission.total, scenario.lessonId + ': one chip per mission target');
  for (const chip of mission.chips) {
    assert.equal(chip.met, 'true', scenario.lessonId + ': ' + chip.id + ' should be met');
  }
  assert.ok(mission.banner, scenario.lessonId + ': the goal banner is shown');
  assert.ok(Math.abs(mission.position - 1) <= 0.02, scenario.lessonId + ': the arena arrives at its target, got ' + mission.position);

  const expectedSources = SOURCE_LINES[scenario.lessonId];
  assert.ok(expectedSources, scenario.lessonId + ': the source-line map covers this lesson');
  for (const chip of mission.chips) {
    const key = chip.id.replace('robot-goal-', '');
    const line = String(expectedSources[key]);
    assert.equal(
      chip.sourceLine,
      line,
      scenario.lessonId + ': ' + key + ' must point at the line that wrote it'
    );
    assert.ok(
      lesson.fullSolution.split('\n')[Number(line) - 1].trim(),
      scenario.lessonId + ': ' + key + ' must point at a real line of code'
    );
  }

  // Opening the first chip must show the reference and put the editor box on that exact line, then
  // close cleanly. This is the interaction the chips exist for, not only the number in the badge.
  const first = mission.chips[0];
  await page.getByTestId(first.id).click();
  const pointed = await missionState(page);
  assert.ok(
    pointed.source.includes('main.py:' + first.sourceLine),
    scenario.lessonId + ': the open chip must name main.py:' + first.sourceLine + ', got: ' + pointed.source
  );
  const pointedText = lesson.fullSolution.split('\n')[Number(first.sourceLine) - 1].trim();
  await page.waitForFunction(
    (text) =>
      document
        .querySelector('[data-editor="editor-main"] .cm-robot-trace-line')
        ?.textContent?.includes(text),
    pointedText,
    { timeout: 10_000 }
  );
  await page.getByTestId(first.id).click();
  await page.waitForFunction(
    () => !document.querySelector('[data-editor="editor-main"] .cm-robot-trace-line'),
    null,
    { timeout: 10_000 }
  );

  const body = await page.locator('body').innerText();
  assert.doesNotMatch(body, /move_forward|turn_right|wall_ahead|draw a square/, scenario.lessonId + ': no old grid exercise');
  console.log('  ok   ' + scenario.lessonId + ' ' + lesson.title + ' -> ' + JSON.stringify(stage.reading));
}

async function assertMissionChips(page) {
  const scenario = ROBOT_SCENARIOS[0];
  await openRobot(page, BASE, scenario.lessonId);
  const before = await missionState(page);
  assert.ok(before.chips.length >= 2, 'goal chips are buttons');
  const first = before.chips[0];
  assert.equal(first.pressed, 'false', 'a goal chip starts closed');

  await page.getByTestId(first.id).click();
  const opened = await missionState(page);
  assert.equal(opened.chips[0].pressed, 'true', 'a goal chip opens its hint');
  assert.ok(opened.hint.length > 0, 'an open goal chip shows its hint');

  await page.getByTestId(first.id).click();
  const closed = await missionState(page);
  assert.equal(closed.chips[0].pressed, 'false', 'a second tap closes the hint');
  assert.equal(closed.hint, '', 'the hint clears with its chip');

  await setEditorCode(page, scenario.lesson.fullSolution);
  await page.getByTestId('robot-run').click();
  await waitForReading(page);
  await waitForIdle(page);
  const finished = await missionState(page);
  for (const chip of finished.chips) assert.equal(chip.met, 'true', chip.id + ' should be met after the run');
  console.log('  ok   goal chips open their hint and turn met when the run reaches them');
}

async function assertReplay(page) {
  const scenario = ROBOT_SCENARIOS[0];
  await openRobot(page, BASE, scenario.lessonId);
  await setEditorCode(page, scenario.lesson.fullSolution);
  await waitForEditor(page);
  assert.equal(await page.getByTestId('robot-replay').isDisabled(), true, 'Replay is off before a run');
  const codeBefore = await getEditorCode(page);
  const before = await verifiedTally(page);

  await page.getByTestId('robot-run').click();
  await waitForReading(page);
  await waitForIdle(page);
  assert.equal(await page.getByTestId('robot-replay').isDisabled(), false, 'Replay is offered after a run');

  await page.getByTestId('robot-replay').click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="robot-pane"]')?.getAttribute('data-replay') === 'true',
    null,
    { timeout: 10_000 }
  );
  // The first recorded frame is queued in the same React batch as the reset, so the stage may already
  // show it. What matters is that Replay did not start on the finished reading.
  const replayStart = (await readStage(page)).reading;
  assert.ok(
    replayStart === null || replayStart.mode !== scenario.expected.mode,
    'a replay starts from the top, not the finished reading'
  );

  await page.waitForFunction(
    () => {
      const pane = document.querySelector('[data-testid="robot-pane"]');
      const status = document.querySelector('[data-testid="robot-status"]');
      return (
        pane?.getAttribute('data-replay') === 'false' &&
        status?.getAttribute('data-state') !== 'running'
      );
    },
    null,
    { timeout: RUN_TIMEOUT }
  );
  const after = await readStage(page);
  assertReading(after.reading, scenario.expected, 'replayed run');
  assert.equal(await getEditorCode(page), codeBefore, 'Replay must not edit main.py');
  assert.equal(await verifiedTally(page), before, 'Replay must stay ungraded');
  console.log('  ok   Replay re-presents the last run without Python, an edit or a grade');
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

  await page.getByTestId('robot-speed-instant').click();
  assert.equal(await page.getByTestId('robot-pane').getAttribute('data-speed'), 'instant');
  assert.equal(await page.getByTestId('robot-speed-instant').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByTestId('robot-speed-slow').getAttribute('aria-pressed'), 'false');
  assert.equal(await getEditorCode(page), codeBefore, 'choosing Instant must not edit main.py');

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
  // Instant is a speed, not a shortcut: the run still ends on its final reading and stays ungraded.
  await page.getByTestId('robot-speed-instant').click();
  await page.getByTestId('robot-run').click();
  await waitForReading(page);
  await waitForIdle(page);
  assertReading((await readStage(page)).reading, scenario.expected, 'instant robot speed');
  assert.equal(await getEditorCode(page), codeBefore, 'an instant robot run must not edit main.py');
  assert.equal(await verifiedTally(page), before, 'an instant robot run must stay ungraded');
  console.log('  ok   speeds 0.5x, 1x, 2x and Instant select without editing or grading main.py');
}

async function assertLiveSignalsToggle(page) {
  const scenario = ROBOT_SCENARIOS[0];
  await openRobot(page, BASE, scenario.lessonId);
  await setEditorCode(page, scenario.lesson.fullSolution);
  await page.getByTestId('robot-run').click();
  await waitForReading(page);
  await waitForIdle(page);
  const toggle = page.getByTestId('robot-live-toggle');
  const chips = page.locator('button[data-testid^="robot-goal-"]');
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true', 'the readings start open');
  assert.ok((await chips.count()) >= 2, 'an open panel shows the mission chips');
  assert.equal(await page.getByTestId('robot-telemetry').count(), 1, 'an open panel shows the tiles');
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false', 'one press closes the panel');
  assert.equal(await chips.count(), 0, 'closing hides the chips');
  assert.equal(await page.getByTestId('robot-telemetry').count(), 0, 'closing hides the tiles too');
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true', 'a second press reopens it');
  assert.equal(await page.getByTestId('robot-telemetry').count(), 1, 'reopening brings the tiles back');
  console.log('  ok   one Live signals button opens the chips and the tiles together');
}

async function assertStepByStep(page) {
  const scenario = ROBOT_SCENARIOS.find((entry) => entry.lessonId === 'P.5');
  assert.ok(scenario, 'the step check needs the P.5 robot lesson');
  await openRobot(page, BASE, scenario.lessonId);
  await setEditorCode(page, scenario.lesson.fullSolution);
  await page.getByTestId('robot-run').click();
  const lines = new Set();
  const positions = new Set();
  const quotes = new Set();
  let sawBox = false;
  for (let index = 0; index < 240; index += 1) {
    const state = await page.evaluate(() => {
      const pane = document.querySelector('[data-testid="robot-pane"]');
      const box = document.querySelector('[data-editor="editor-main"] .cm-robot-trace-line');
      const status = document.querySelector('[data-testid="robot-status"]');
      const stage = document.querySelector('[data-testid="robot-stage"]');
      const quote = document.querySelector('[data-testid="robot-code-line"]');
      return {
        line: Number(pane?.getAttribute('data-running-line') || 0),
        boxed: Boolean(box),
        running: status?.getAttribute('data-state') === 'running',
        position: stage ? Number(stage.getAttribute('data-robot-position')) : -1,
        quote: quote?.textContent?.trim() ?? '',
      };
    });
    if (state.line > 0) lines.add(state.line);
    if (state.boxed) sawBox = true;
    if (state.running) {
      if (Number.isFinite(state.position)) positions.add(state.position.toFixed(3));
      if (state.quote) quotes.add(state.quote);
    }
    if (!state.running) break;
    await page.waitForTimeout(20);
  }
  await waitForIdle(page);
  assert.ok(sawBox, 'P.5: the editor must draw a box around the running line');
  assert.ok(lines.size >= 3, 'P.5: the run must visit several main.py lines, saw ' + [...lines].join(','));
  assert.ok(
    positions.size >= 2,
    'P.5: the joint must move through several positions, saw ' + [...positions].join(', ')
  );
  assert.ok(quotes.size > 0, 'P.5: the stage must quote the line being executed');
  for (const quote of quotes) {
    assert.ok(
      scenario.lesson.fullSolution.includes(quote),
      'P.5: the quoted line must be main.py text, got: ' + quote
    );
  }
  const arrival = Number(await page.getByTestId('robot-stage').getAttribute('data-robot-position'));
  assert.ok(arrival > 0.98, 'P.5: the joint must finish at its dock, got ' + arrival);
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
  await seedRobotTourSeen(context);
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
        mission: box('[data-testid="robot-mission"]'),
        goals: [...document.querySelectorAll('button[data-testid^="robot-goal-"]')].map((button) => {
          const rect = button.getBoundingClientRect();
          return {
            left: rect.left,
            right: rect.right,
            height: rect.height,
            sourceLine: button.getAttribute('data-source-line') ?? '',
          };
        }),
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
    assert.ok(
      layout.mission && layout.mission.left >= -1 && layout.mission.right <= layout.viewport + 1,
      at + ': the mission card must fit the viewport'
    );
    assert.ok(layout.goals.length >= 2, at + ': the mission must show its target chips');
    for (const goal of layout.goals) {
      assert.ok(goal.left >= -1 && goal.right <= layout.viewport + 1, at + ': a goal chip must fit the viewport');
      assert.ok(goal.height >= 34, at + ': a goal chip must keep a touch-sized target');
      assert.ok(goal.sourceLine, at + ': a goal chip must point at its main.py line after a run');
    }
    const arrival = Number(await page.getByTestId('robot-stage').getAttribute('data-robot-position'));
    assert.ok(arrival > 0.98, at + ': the arena must arrive at its target, got ' + arrival);
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

const ROBOT_TOUR_KEY = 'mechalab_robot_tour_v1';

async function waitForRobotTourStep(page, at, timeout = 10_000) {
  try {
    await page.waitForFunction(
      (wanted) =>
        document.querySelector('[data-testid="robot-tour"]')?.getAttribute('data-robot-tour-step') === wanted,
      at,
      { timeout, polling: 50 }
    );
    return true;
  } catch {
    return false;
  }
}

async function robotTourRing(page, anchor, timeout = 5000) {
  // Wait for the ring to land and the anchor to be the topmost element, rather than reading a
  // geometry React has not painted yet. A card that permanently covers the control still times out.
  try {
    const handle = await page.waitForFunction(
      (name) => {
        const ring = document.querySelector('[data-testid="robot-tour-ring"]');
        const target = document.querySelector(`[data-robot-tour="${name}"]`);
        if (!ring || !target) return null;
        const r = ring.getBoundingClientRect();
        const a = target.getBoundingClientRect();
        if (
          Math.abs(r.left - a.left) >= 12 ||
          Math.abs(r.top - a.top) >= 12 ||
          Math.abs(r.width - a.width) >= 16 ||
          Math.abs(r.height - a.height) >= 16
        ) {
          return null;
        }
        const under = document.elementFromPoint(a.left + a.width / 2, a.top + a.height / 2);
        if (!under?.closest(`[data-robot-tour="${name}"]`)) return null;
        return {
          dx: Math.abs(r.left - a.left),
          dy: Math.abs(r.top - a.top),
          dw: Math.abs(r.width - a.width),
          dh: Math.abs(r.height - a.height),
          pointer: getComputedStyle(ring).pointerEvents,
          under: true,
        };
      },
      anchor,
      { timeout, polling: 50 }
    );
    return await handle.jsonValue();
  } catch {
    return null;
  }
}

async function robotTourRecord(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, ROBOT_TOUR_KEY);
}

async function assertRunWithVerify(browser, baseUrl) {
  // No `__mechalabPredictFirst` here on purpose: this walks the graded path the toolbar really
  // starts, and answers the gate with its own Skip — a recorded decision, not a disabled check.
  const scenario = ROBOT_SCENARIOS[0];
  const context = await browser.newContext();
  await seedTourSeen(context);
  await seedRobotTourSeen(context);
  const page = await context.newPage();
  const toggle = () => page.getByTestId('robot-autorun');
  const readingNow = () =>
    page.evaluate(
      () => document.querySelector('[data-testid="robot-stage"]')?.getAttribute('data-reading') || ''
    );
  const waitForGradedRun = () =>
    page.waitForFunction(
      () => {
        const button = document.querySelector('[data-testid="btn-run-verify"]');
        return Boolean(button && !button.disabled);
      },
      null,
      { timeout: RUN_TIMEOUT }
    );
  try {
    await openRobot(page, baseUrl, scenario.lessonId);
    await setEditorCode(page, scenario.lesson.fullSolution);
    await waitForEditor(page);

    assert.equal(await toggle().getAttribute('aria-checked'), 'false', 'Run with Verify starts off');
    await toggle().click();
    assert.equal(await toggle().getAttribute('aria-checked'), 'true', 'the switch turns on');
    // The switch is storage, not state: a reload shows what was chosen, not a default.
    await openRobot(page, baseUrl, scenario.lessonId);
    assert.equal(
      await toggle().getAttribute('aria-checked'),
      'true',
      'the Run with Verify choice is remembered across a reload'
    );

    // On: one graded Run & Verify also runs the robot, with no press of Run robot.
    await setEditorCode(page, scenario.lesson.fullSolution);
    await waitForEditor(page);
    await page.getByTestId('robot-reset').click();
    assert.equal(await readingNow(), '', 'Reset leaves the arena empty before the run');
    await page.getByTestId('btn-run-verify').click();
    // The gate opens on the first graded run of a fresh browser. Waiting for its own button is the
    // difference between answering the question and pressing Skip on a pane that has not painted.
    const skip = page.getByTestId('btn-predict-skip');
    try {
      await skip.waitFor({ state: 'visible', timeout: 5000 });
      await skip.click();
    } catch {
      // No gate: this lesson already has a prediction record.
    }
    await waitForReading(page);
    await waitForIdle(page);
    assertReading((await readStage(page)).reading, scenario.expected, 'Run with Verify');
    console.log('  ok   Run with Verify runs the robot after the graded run');

    // Off: the same press leaves the robot alone.
    await toggle().click();
    assert.equal(await toggle().getAttribute('aria-checked'), 'false', 'the switch turns off');
    await page.getByTestId('robot-reset').click();
    assert.equal(await readingNow(), '', 'Reset leaves the arena empty again');
    await page.getByTestId('btn-run-verify').click();
    await waitForGradedRun();
    await page.waitForTimeout(1500);
    assert.equal(
      await readingNow(),
      '',
      'with Run with Verify off a graded run must not run the robot'
    );
    console.log('  ok   with Run with Verify off the same press leaves the robot empty');
  } finally {
    await context.close();
  }
}

async function assertRobotTour(browser, baseUrl) {
  const context = await browser.newContext();
  await seedTourSeen(context);
  await context.addInitScript(() => {
    window.__mechalabPredictFirst = false;
  });
  const page = await context.newPage();
  try {
    await openRobot(page, baseUrl, 'P.1');
    const card = page.getByTestId('robot-tour');
    await card.waitFor({ timeout: 15_000 });
    assert.equal(await card.getAttribute('data-robot-tour-step'), 'run', 'the guide opens on Run');
    assert.match(await card.innerText(), /Run your code/, 'the first step names Run');

    const runRing = await robotTourRing(page, 'run');
    assert.ok(runRing, 'the first step must draw a ring');
    assert.equal(runRing.pointer, 'none', 'the ring must not eat the Run press');
    assert.equal(runRing.under, true, 'Run must stay clickable through the spotlight');
    assert.ok(runRing.dx < 9 && runRing.dy < 9, 'the ring must land on Run, got ' + runRing.dx + '/' + runRing.dy);
    assert.ok(runRing.dw < 16 && runRing.dh < 16, 'the ring must cover Run');

    const opening = await robotTourRecord(page);
    assert.equal(opening.status, 'active', 'opening the guide records an active tour');
    assert.equal(opening.stepIndex, 0, 'the record starts at Run');

    await page.getByTestId('robot-tour-next').click();
    assert.ok(await waitForRobotTourStep(page, 'targets'), 'Next did not reach the goal chips');
    assert.equal(await page.getByTestId('robot-tour-back').count(), 1, 'step two offers Back');
    const targetsRing = await robotTourRing(page, 'targets');
    assert.ok(targetsRing, 'the chip step must draw a ring');
    assert.equal(targetsRing.under, true, 'the chips must stay clickable through the spotlight');

    await page.getByTestId('robot-tour-back').click();
    assert.ok(await waitForRobotTourStep(page, 'run'), 'Back did not return to Run');
    await page.getByTestId('robot-tour-next').click();
    assert.ok(await waitForRobotTourStep(page, 'targets'), 'Next did not return to the chips');
    await page.getByTestId('robot-tour-next').click();
    assert.ok(await waitForRobotTourStep(page, 'replay'), 'Next did not reach Replay');
    assert.equal(await page.getByTestId('robot-tour-next').innerText(), 'Got it', 'the last step finishes');
    const replayRing = await robotTourRing(page, 'replay');
    assert.ok(replayRing, 'the Replay step must draw a ring');
    assert.equal(replayRing.under, true, 'Replay must stay clickable through the spotlight');

    await page.getByTestId('robot-tour-next').click();
    await card.waitFor({ state: 'detached', timeout: 10_000 });
    const done = await robotTourRecord(page);
    assert.equal(done.status, 'completed', 'Got it records the finished guide');
    assert.equal(done.stepIndex, 2, 'the finished record keeps the last step');

    await openRobot(page, baseUrl, 'P.1');
    assert.equal(await page.getByTestId('robot-tour').count(), 0, 'a finished guide must not reopen');
    const showGuide = page.getByTestId('robot-tour-show');
    assert.equal(await showGuide.count(), 1, 'a finished guide offers Show guide');
    await showGuide.click();
    await card.waitFor({ timeout: 10_000 });
    assert.equal(await card.getAttribute('data-robot-tour-step'), 'run', 'Show guide starts at Run');
    assert.ok(await robotTourRing(page, 'run'), 'Show guide redraws the ring');
    assert.equal((await robotTourRecord(page)).status, 'active', 'Show guide records an active guide');
    assert.equal(await showGuide.count(), 0, 'the action hides while the guide is open');
    console.log('  ok   the Robot guide walks Run, the goal chips and Replay once, and Show guide brings it back');
  } finally {
    await context.close();
  }
}

async function assertRobotTourDismiss(browser, baseUrl) {
  const context = await browser.newContext();
  await seedTourSeen(context);
  await context.addInitScript(() => {
    window.__mechalabPredictFirst = false;
  });
  const page = await context.newPage();
  try {
    await openRobot(page, baseUrl, 'P.1');
    const card = page.getByTestId('robot-tour');
    await card.waitFor({ timeout: 15_000 });
    await page.keyboard.press('Escape');
    await card.waitFor({ state: 'detached', timeout: 10_000 });
    const record = await robotTourRecord(page);
    assert.equal(record.status, 'dismissed', 'Escape records the skip');

    await openRobot(page, baseUrl, 'P.1');
    assert.equal(await page.getByTestId('robot-tour').count(), 0, 'a skipped guide must stay skipped');
    console.log('  ok   Esc skips the Robot guide and it stays skipped');
  } finally {
    await context.close();
  }
}

async function assertRobotTourPhone(browser, baseUrl) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await seedTourSeen(context);
  await context.addInitScript(() => {
    window.__mechalabPredictFirst = false;
  });
  const page = await context.newPage();
  try {
    await openRobot(page, baseUrl, 'P.1');
    const card = page.getByTestId('robot-tour');
    await card.waitFor({ timeout: 15_000 });
    const sheet = await page.evaluate(() => {
      const box = document.querySelector('[data-testid="robot-tour"]');
      if (!box) return null;
      const rect = box.getBoundingClientRect();
      return {
        bottomGap: Math.round(window.innerHeight - rect.bottom),
        width: Math.round(rect.width),
        ring: Boolean(document.querySelector('[data-testid="robot-tour-ring"]')),
        buttons: [...box.querySelectorAll('button')].map((button) =>
          Math.round(button.getBoundingClientRect().height)
        ),
      };
    });
    assert.ok(sheet, 'the phone guide must be on screen');
    assert.ok(sheet.bottomGap >= 0 && sheet.bottomGap <= 40, 'the guide must sit at the bottom, got ' + sheet.bottomGap);
    assert.ok(sheet.width <= 382, 'the sheet must fit a 390px screen, got ' + sheet.width);
    assert.equal(sheet.ring, false, 'a phone must not get the desktop ring');
    for (const height of sheet.buttons) assert.ok(height >= 44, 'a ' + height + 'px guide button on a phone');

    await page.getByTestId('robot-tour-next').click();
    assert.ok(await waitForRobotTourStep(page, 'targets'), 'the phone guide did not reach the chips');
    await page.getByTestId('robot-tour-next').click();
    assert.ok(await waitForRobotTourStep(page, 'replay'), 'the phone guide did not reach Replay');
    await page.getByTestId('robot-tour-next').click();
    await card.waitFor({ state: 'detached', timeout: 10_000 });
    assert.equal((await robotTourRecord(page)).status, 'completed', 'the phone guide finishes');
    console.log('  ok   the Robot guide is a phone sheet with touch-sized controls');
  } finally {
    await context.close();
  }
}

// The arena is a desktop surface too: at 1440x900 it has room to spread out, so its readability is
// measurable rather than a matter of taste. This walks the two scenes that carry the most text,
// leaves the run on Instant so the labels are final, and requires the merged panel's single header,
// the four drawn speed modes and a 16px radius around labels that neither overlap nor escape.
async function assertDesktopArena(browser, baseUrl) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  });
  await seedTourSeen(context);
  await seedRobotTourSeen(context);
  const page = await context.newPage();
  const expectedSpeeds = [
    { id: 'slow', label: '0.5×' },
    { id: 'normal', label: '1×' },
    { id: 'fast', label: '2×' },
    { id: 'instant', label: 'Instant' },
  ];
  try {
    for (const lessonId of ['P.1', 'P.4']) {
      const scenario = ROBOT_SCENARIOS.find((entry) => entry.lessonId === lessonId);
      assert.ok(scenario, 'the desktop audit needs the ' + lessonId + ' robot lesson');
      await openRobot(page, baseUrl, lessonId);
      await setEditorCode(page, scenario.lesson.fullSolution);
      await waitForEditor(page);
      await page.getByTestId('robot-speed-instant').click();
      await page.getByTestId('robot-run').click();
      await waitForReading(page);
      await waitForIdle(page);

      const audit = await page.evaluate(() => {
        const visible = (selector) =>
          [...document.querySelectorAll(selector)].filter(
            (node) => node.getBoundingClientRect().height > 0
          );
        const arena = visible('.robot-arena')[0];
        const svg = arena ? arena.querySelector('svg') : null;
        const labels = svg
          ? [...svg.querySelectorAll('text')]
              .map((node) => ({
                text: (node.textContent || '').trim(),
                box: node.getBoundingClientRect(),
              }))
              .filter((entry) => entry.text && entry.box.width > 0 && entry.box.height > 0)
          : [];
        const overlaps = [];
        for (let i = 0; i < labels.length; i += 1) {
          for (let j = i + 1; j < labels.length; j += 1) {
            const a = labels[i].box;
            const b = labels[j].box;
            const sharedX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const sharedY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (sharedX > 1 && sharedY > 1) {
              overlaps.push(labels[i].text + ' / ' + labels[j].text);
            }
          }
        }
        const frame = arena ? arena.getBoundingClientRect() : null;
        const outside = frame
          ? labels
              .filter(
                (entry) =>
                  entry.box.left < frame.left - 1 ||
                  entry.box.top < frame.top - 1 ||
                  entry.box.right > frame.right + 1 ||
                  entry.box.bottom > frame.bottom + 1
              )
              .map((entry) => entry.text)
          : [];
        const pane = visible('[data-testid="robot-pane"]')[0];
        return {
          arena: frame ? { width: Math.round(frame.width), height: Math.round(frame.height) } : null,
          radius: arena ? getComputedStyle(arena).borderRadius : null,
          labels: labels.length,
          overlaps,
          outside,
          paneOverflow: pane ? pane.scrollWidth - pane.clientWidth : -1,
          pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          liveToggles: visible('[data-testid="robot-live-toggle"]').length,
          speeds: visible('button[data-testid^="robot-speed-"]').map((button) => {
            const box = button.getBoundingClientRect();
            return {
              id: (button.getAttribute('data-testid') || '').replace('robot-speed-', ''),
              text: (button.textContent || '').replace(/\s+/g, ' ').trim(),
              pressed: button.getAttribute('aria-pressed'),
              drawn: box.width >= 24 && box.height >= 20,
            };
          }),
        };
      });

      const tag = lessonId + ' at 1440x900';
      assert.equal(audit.radius, '16px', tag + ': the arena radius must stay 16px, got ' + audit.radius);
      assert.equal(audit.liveToggles, 1, tag + ': one Live signals header, got ' + audit.liveToggles);
      assert.deepEqual(
        audit.speeds.map((speed) => speed.id),
        expectedSpeeds.map((speed) => speed.id),
        tag + ': the four speed modes must be present, got ' + audit.speeds.map((speed) => speed.id).join(', ')
      );
      for (const [index, speed] of audit.speeds.entries()) {
        const expected = expectedSpeeds[index];
        assert.ok(
          speed.drawn,
          tag + ': the ' + expected.id + ' speed mode must be drawn, got ' + JSON.stringify(speed)
        );
        assert.equal(
          speed.text,
          expected.label,
          tag + ': the ' + expected.id + ' speed mode must read ' + JSON.stringify(expected.label)
        );
      }
      assert.equal(
        audit.speeds.find((speed) => speed.id === 'instant')?.pressed,
        'true',
        tag + ': the run must be paced by Instant'
      );
      assert.ok(audit.labels >= 4, tag + ': the arena must draw its labels, got ' + audit.labels);
      assert.deepEqual(
        audit.overlaps,
        [],
        tag + ': no two arena labels may share pixels, got ' + audit.overlaps.join(', ')
      );
      assert.deepEqual(
        audit.outside,
        [],
        tag + ': every arena label must stay inside the arena, got ' + audit.outside.join(', ')
      );
      assert.equal(audit.paneOverflow, 0, tag + ': the pane must not overflow, got ' + audit.paneOverflow);
      assert.equal(audit.pageOverflow, 0, tag + ': the page must not overflow, got ' + audit.pageOverflow);
      assert.ok(
        audit.arena && audit.arena.width >= 380,
        tag + ': the arena must spread to its column, got ' + JSON.stringify(audit.arena)
      );
      console.log(
        '  ok   ' + tag + ': 16px radius, one Live signals header, four drawn speeds, ' +
          audit.labels + ' labels with no shared pixel'
      );
    }
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
  await seedRobotTourSeen(context);
  await context.addInitScript(() => {
    window.__mechalabPredictFirst = false;
  });
  const page = await context.newPage();
  console.log('\nthe lesson goals and the game views their own solutions drive:');
  for (const scenario of ROBOT_SCENARIOS) await assertScenario(page, scenario);
  console.log('\nthe tab edges:');
  await assertMissionChips(page);
  await assertReplay(page);
  await assertResetClears(page);
  await assertStopClearsMidRun(page);
  await assertResetClearsMidRun(page);
  await assertFailureLeavesNoReading(page);
  await assertPartialFailureLeavesNoReading(page);
  await assertSpeedControl(page);
  await assertLiveSignalsToggle(page);
  await assertRunWithVerify(browser, BASE);
  await assertStepByStep(page);

  console.log('\nthe first-run Robot guide:');
  await assertRobotTour(browser, BASE);
  await assertRobotTourDismiss(browser, BASE);
  await assertRobotTourPhone(browser, BASE);

  console.log('\nthe Robot tab at desktop width:');
  await assertDesktopArena(browser, BASE);

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
