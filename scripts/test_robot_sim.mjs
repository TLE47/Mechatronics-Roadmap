/**
 * The robot view's model, without a browser (`scripts/test_robot_sim.mjs`).
 *
 * This pins the contract the request turns on: every robot lesson is the same `PYTHON_LESSONS`
 * record the editor uses, its goal and starter code are that record's strings, its probe reads the
 * names the lesson binds, and the old invented grid exercise is gone. The browser suite is what
 * proves the actual lesson code produces the reading and that reading it leaves main.py unchanged.
 */
import assert from 'node:assert/strict';
import { PYTHON_LESSONS } from '../app/src/data/pythonLessonsData.ts';
import {
  ROBOT_LESSON_IDS,
  ROBOT_SCENARIOS,
  parseRobotReading,
  robotPythonSource,
  robotScenario,
  scenarioProblems,
} from '../app/src/robotSim/model.ts';
import { armRobotWait, cancelRobotWait, writeRobotReply } from '../app/src/robotSim/protocol.ts';
import {
  NO_ROBOT_PROGRESS,
  formatCurrent,
  formatNumber,
  formatTarget,
  missionFor,
  robotProgress,
  sourceLinesForFrames,
  targetReached,
} from '../app/src/robotSim/robotMission.ts';
import {
  ROBOT_TOUR_STEPS,
  ROBOT_TOUR_STEP_COUNT,
  STORAGE_KEY_ROBOT_TOUR,
  dismissRobotTour,
  initialRobotTourState,
  nextRobotTour,
  previousRobotTour,
  readRobotTour,
  robotTourAnnouncement,
  robotTourStepAt,
  startRobotTour,
  writeRobotTour,
} from '../app/src/robotSim/robotTour.ts';

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
};

check('the seven robot lessons are the lesson records themselves', () => {
  assert.deepEqual(
    ROBOT_SCENARIOS.map((entry) => entry.lessonId),
    ['P.1', 'P.2', 'P.3', 'P.4', 'P.5', 'P.6', 'P.7']
  );
  for (const entry of ROBOT_SCENARIOS) {
    const lesson = PYTHON_LESSONS.find((candidate) => candidate.id === entry.lessonId);
    assert.ok(lesson, `${entry.lessonId} is in PYTHON_LESSONS`);
    assert.equal(entry.lesson, lesson, `${entry.lessonId} uses the lesson record, not a copy`);
    assert.equal(entry.lesson.goal, lesson.goal);
    assert.equal(entry.lesson.starterCode, lesson.starterCode);
    assert.equal(entry.lesson.fullSolution, lesson.fullSolution);
    assert.equal(entry.lesson.expectedOutput, lesson.expectedOutput);
  }
  assert.equal(robotScenario('P.8'), null);
});

check('the old grid exercise and its invented example are gone', () => {
  for (const entry of ROBOT_SCENARIOS) {
    assert.equal('example' in entry, false, `${entry.lessonId} has no separate example`);
    assert.equal('objective' in entry, false, `${entry.lessonId} has no separate objective`);
    assert.equal('challenge' in entry, false, `${entry.lessonId} has no separate challenge`);
    assert.equal('commands' in entry, false, `${entry.lessonId} has no separate command list`);
    assert.doesNotMatch(
      entry.probe,
      /move_forward|turn_right|turn_left|wall_ahead|wall_distance/,
      `${entry.lessonId} does not use the old grid commands`
    );
  }
});

check('every robot lesson is valid and sends the names its lesson binds', () => {
  for (const entry of ROBOT_SCENARIOS) {
    assert.deepEqual(scenarioProblems(entry), [], `${entry.lessonId}: ${scenarioProblems(entry).join('; ')}`);
    assert.match(entry.probe, /_robot_send\(/);
    assert.match(entry.python, /def _robot_send\(/);
    assert.match(entry.python, /def _robot_step\(/);
    assert.match(entry.python, /_robot_send\(__line,/);
  }
  assert.match(robotPythonSource(), /__mechalab_robot__/);
  assert.match(robotPythonSource(), /json\.dumps\(values, default=str\)/);
});

check('every mission target is that lesson expected value, and the titles stay distinct', () => {
  const titles = [];
  for (const entry of ROBOT_SCENARIOS) {
    const mission = missionFor(entry);
    titles.push(mission.title);
    assert.ok(mission.title.trim().length > 3, `${entry.lessonId} names its mission`);
    assert.ok(mission.blurb.trim().length > 10, `${entry.lessonId} explains its mission`);
    assert.ok(mission.targets.length >= 2, `${entry.lessonId} has at least two targets`);
    for (const target of mission.targets) {
      assert.deepEqual(
        target.target,
        entry.expected[target.key],
        `${entry.lessonId} ${String(target.key)} target is read from expected, not copied`
      );
      assert.ok(target.hint.trim().length > 10, `${entry.lessonId} ${String(target.key)} has a hint`);
    }
  }
  assert.equal(new Set(titles).size, titles.length, 'the seven missions have seven different titles');
  assert.deepEqual(
    ROBOT_SCENARIOS.map((entry) => missionFor(entry).title),
    ['Wake the rover', 'Drive one tick', 'Guard the motor', 'Sort the convoy', 'Dock the arm', 'Measure the bench', 'Convert to base units']
  );
});

check('a full solution completes its mission and a partial reading does not', () => {
  for (const entry of ROBOT_SCENARIOS) {
    const complete = robotProgress(entry.expected, entry);
    assert.equal(complete.started, true, `${entry.lessonId}: the expected reading has started`);
    assert.equal(complete.complete, true, `${entry.lessonId}: every target is reached`);
    assert.equal(complete.met, complete.total, `${entry.lessonId}: met counts every target`);
    assert.equal(complete.rows.filter((row) => !row.met).length, 0);

    const firstKey = complete.rows[0].target.key;
    const partial = { ...entry.expected, [firstKey]: null };
    const before = robotProgress(partial, entry);
    assert.equal(before.started, true, `${entry.lessonId}: a partial reading has started`);
    assert.equal(before.complete, false, `${entry.lessonId}: a missing target is not complete`);
    assert.equal(before.met, before.total - 1, `${entry.lessonId}: one target is still missing`);
    assert.equal(before.rows[0].met, false, `${entry.lessonId}: the missing target is the one not met`);
  }
  const empty = robotProgress(null, ROBOT_SCENARIOS[0]);
  assert.equal(empty.started, false);
  assert.equal(empty.met, 0);
  assert.equal(empty.complete, false);
  assert.deepEqual(NO_ROBOT_PROGRESS.rows, []);
});

check('numbers use their own tolerance and lists compare element by element', () => {
  const p1 = ROBOT_SCENARIOS.find((entry) => entry.lessonId === 'P.1');
  const p4 = ROBOT_SCENARIOS.find((entry) => entry.lessonId === 'P.4');
  assert.ok(p1 && p4);
  const battery = robotProgress(p1.expected, p1).rows.find((row) => row.target.key === 'batteryVolts');
  const commands = robotProgress(p4.expected, p4).rows.find((row) => row.target.key === 'clampedCommands');
  assert.ok(battery && commands);
  assert.equal(targetReached(battery.target, 12.15), true);
  assert.equal(targetReached(battery.target, 12.1549), true, '0.005 V of float noise is the same reading');
  assert.equal(targetReached(battery.target, 12.16), false, 'a tenth of a volt out is not the target');
  assert.equal(targetReached(battery.target, null), false);
  assert.equal(targetReached(commands.target, [0, 0, 64, 128, 200, 255]), true);
  assert.equal(targetReached(commands.target, [0, 0, 64, 128, 200, 255.0000001]), true, 'a list entry keeps its tolerance');
  assert.equal(targetReached(commands.target, [0, 0, 64, 128, 200, 254]), false, 'one wrong entry fails the list');
  assert.equal(targetReached(commands.target, [0, 0, 64, 128, 200]), false, 'a shorter list is not the target');
  assert.equal(targetReached(commands.target, null), false);
});

check('a chip reads a target, a current value and a missing value without inventing one', () => {
  const scenario = ROBOT_SCENARIOS.find((entry) => entry.lessonId === 'P.1');
  assert.ok(scenario);
  const mission = missionFor(scenario);
  const encoder = mission.targets.find((target) => target.key === 'encoderTicks');
  const eStop = mission.targets.find((target) => target.key === 'eStop');
  assert.ok(encoder && eStop);
  assert.equal(formatTarget(encoder), '425 ticks');
  assert.equal(formatTarget(eStop), 'off');
  assert.equal(formatCurrent({ target: encoder, current: 400, met: false }), '400 ticks');
  assert.equal(formatCurrent({ target: encoder, current: null, met: false }), '—');
  assert.equal(formatNumber(12.15), '12.15');
  assert.equal(formatNumber(12.1), '12.1');
  assert.equal(formatNumber(12), '12');
  assert.equal(formatNumber(Number.NaN), '—');
});

check('a chip points at the line that actually wrote its value, not the last assignment in the file', () => {
  const p3 = ROBOT_SCENARIOS.find((entry) => entry.lessonId === 'P.3');
  assert.ok(p3);
  const branch = sourceLinesForFrames(
    [
      { line: 1, reading: null },
      { line: 8, reading: { clampedHigh: 310, clampedLow: -45, safeOutput: null } },
      { line: 9, reading: { clampedHigh: 255, clampedLow: -45, safeOutput: null } },
      { line: 18, reading: { clampedHigh: 255, clampedLow: -45, safeOutput: null } },
      { line: 19, reading: { clampedHigh: 255, clampedLow: 0, safeOutput: null } },
      { line: 23, reading: { clampedHigh: 255, clampedLow: 0, safeOutput: null } },
      { line: 24, reading: { clampedHigh: 255, clampedLow: 0, safeOutput: 0 } },
      { line: 0, reading: { clampedHigh: 255, clampedLow: 0, safeOutput: 0 } },
    ],
    missionFor(p3),
    p3.lesson.fullSolution
  );
  assert.equal(branch.clampedHigh, 8, 'the high clamp points at the branch that ran, not line 12');
  assert.equal(branch.clampedLow, 18, 'the low clamp points at its own branch, not line 20');
  assert.equal(branch.safeOutput, 23);

  const p4 = ROBOT_SCENARIOS.find((entry) => entry.lessonId === 'P.4');
  assert.ok(p4);
  const five = [0, 0, 64, 128, 200];
  const six = [0, 0, 64, 128, 200, 255];
  const list = sourceLinesForFrames(
    [
      { line: 12, reading: { clampedCommands: five, totalCommand: 0, meanCommand: null } },
      { line: 13, reading: { clampedCommands: six, totalCommand: 0, meanCommand: null } },
      { line: 5, reading: { clampedCommands: six, totalCommand: 647, meanCommand: null } },
      { line: 15, reading: { clampedCommands: six, totalCommand: 647, meanCommand: null } },
      { line: 16, reading: { clampedCommands: six, totalCommand: 647, meanCommand: 107.83 } },
      { line: 0, reading: { clampedCommands: six, totalCommand: 647, meanCommand: 107.83 } },
    ],
    missionFor(p4),
    p4.lesson.fullSolution
  );
  assert.equal(list.clampedCommands, 12, 'the list points at the append that completed it');
  assert.equal(list.totalCommand, 13);
  assert.equal(list.meanCommand, 15);

  const p5 = ROBOT_SCENARIOS.find((entry) => entry.lessonId === 'P.5');
  assert.ok(p5);
  const finalOnly = sourceLinesForFrames(
    [
      { line: 1, reading: null },
      { line: 6, reading: { positionM: null, step: null } },
      { line: 0, reading: { positionM: 1.2, step: 4 } },
    ],
    missionFor(p5),
    p5.lesson.fullSolution
  );
  assert.equal(finalOnly.positionM, 6, 'a value first reported by the final probe belongs to the last line');
  assert.equal(finalOnly.step, 6);
  assert.deepEqual(
    sourceLinesForFrames([{ line: 1, reading: null }], missionFor(p5), p5.lesson.fullSolution),
    {},
    'a run that bound nothing points at nothing'
  );
});

check('each expected reading is visible in that lesson expected output', () => {
  const output = (id) => PYTHON_LESSONS.find((lesson) => lesson.id === id).expectedOutput;
  assert.match(output('P.1'), /Mode: ACTIVE \| E-Stop: False/);
  assert.match(output('P.1'), /Encoder Ticks: 425 \| Battery: 12\.15 V/);
  assert.match(output('P.3'), /310 clamped -> 255 \| -45 clamped -> 0/);
  assert.match(output('P.3'), /E-Stop=True -> Safe Output: 0/);
  assert.match(output('P.4'), /Clamped list: \[0, 0, 64, 128, 200, 255\]/);
  assert.match(output('P.4'), /Mean Clamped Cmd=107\.83/);
  assert.match(output('P.5'), /After 4 steps: pos_m = 1\.20 m/);
});

check('the line sampler sends the same names before each executed line', () => {
  for (const entry of ROBOT_SCENARIOS) {
    const step = entry.python.slice(entry.python.indexOf('def _robot_step('));
    assert.match(step, /_robot_send\(__line,/);
    for (const match of entry.probe.matchAll(/^\s+(\w+)=globals\(\)\.get\("([^"]+)"\)/gm)) {
      assert.match(step, new RegExp(`${match[1]}=globals\\(\\).get\\("${match[2]}"\\)`));
    }
  }
});

check('the parser keeps a lesson reading and drops junk fields', () => {
  const parsed = parseRobotReading({
    mode: 'ACTIVE',
    eStop: false,
    encoderTicks: 425,
    batteryVolts: 12.15,
    rawCommands: [-30, 0, 64, 128, 200, 310],
    clampedCommands: [0, 0, 64, 128, 200, 255],
    meanCommand: 107.83,
  });
  assert.ok(parsed);
  assert.equal(parsed.mode, 'ACTIVE');
  assert.equal(parsed.eStop, false);
  assert.equal(parsed.encoderTicks, 425);
  assert.equal(parsed.batteryVolts, 12.15);
  assert.deepEqual(parsed.rawCommands, [-30, 0, 64, 128, 200, 310]);
  assert.deepEqual(parsed.clampedCommands, [0, 0, 64, 128, 200, 255]);
  assert.equal(parsed.meanCommand, 107.83);

  const partial = parseRobotReading({
    mode: 'ACTIVE',
    eStop: 'yes',
    encoderTicks: Number.NaN,
    batteryVolts: 12.15,
    rawCommands: [-30, 'x', 64],
  });
  assert.ok(partial);
  assert.equal(partial.mode, 'ACTIVE');
  assert.equal(partial.eStop, null);
  assert.equal(partial.encoderTicks, null);
  assert.equal(partial.batteryVolts, 12.15);
  assert.deepEqual(partial.rawCommands, [-30, 64]);
  assert.equal(parseRobotReading(null), null);
  assert.equal(parseRobotReading([]), null);
  assert.equal(parseRobotReading('telemetry'), null);
});

check('a malformed robot lesson is refused with reasons', () => {
  const first = ROBOT_SCENARIOS[0];
  const broken = {
    ...first,
    lesson: { ...first.lesson, goal: '' },
    probe: 'move_forward(1)',
  };
  const problems = scenarioProblems(broken);
  assert(problems.some((line) => line.includes('copy, not the lesson record')));
  assert(problems.some((line) => line.includes("old 'move_forward' command")));
  assert(problems.some((line) => line.includes('does not call _robot_send')));

  const impossibleMission = { ...first, expected: { ...first.expected, mode: 42 } };
  assert(
    scenarioProblems(impossibleMission).some((line) => line.includes('the mission is invalid')),
    'an expected value that cannot back a mission target is refused before it is drawn as a dash'
  );
});

check('the Robot guide walks Run, the goal chips and Replay in three steps', () => {
  assert.deepEqual(ROBOT_TOUR_STEPS.map((step) => step.id), ['run', 'targets', 'replay']);
  assert.deepEqual(
    ROBOT_TOUR_STEPS.map((step) => step.anchor),
    ['run', 'targets', 'replay']
  );
  assert.equal(ROBOT_TOUR_STEP_COUNT, 3);
  for (const step of ROBOT_TOUR_STEPS) {
    assert.ok(step.title.trim().length > 3, `${step.id}: title`);
    assert.ok(step.body.trim().split(/\s+/).length <= 30, `${step.id}: body is a coach mark, not a paragraph`);
    assert.match(step.body, /main\.py|Replay|target/i, `${step.id}: names what it points at`);
  }
  assert.equal(robotTourStepAt(99).id, 'run', 'an index from a stale record reads as step one');
  assert.equal(robotTourAnnouncement(0), 'Step 1 of 3: Run your code');
});

check('the guide advances, goes back, finishes and dismisses without looping', () => {
  const start = startRobotTour(initialRobotTourState(1), 2);
  assert.equal(start.status, 'active');
  assert.equal(start.stepIndex, 0);
  assert.equal(previousRobotTour(start, 3), start, 'Back on step one is not a move');

  const one = nextRobotTour(start, 3);
  assert.equal(one.status, 'active');
  assert.equal(one.stepIndex, 1);
  const two = nextRobotTour(one, 4);
  assert.equal(two.stepIndex, 2);
  assert.equal(previousRobotTour(two, 5).stepIndex, 1);

  const done = nextRobotTour(two, 6);
  assert.equal(done.status, 'completed');
  assert.equal(done.stepIndex, 2);
  assert.equal(nextRobotTour(done, 7), done, 'a finished guide does not loop');

  const skipped = dismissRobotTour(one, 8);
  assert.equal(skipped.status, 'dismissed');
  assert.equal(skipped.stepIndex, 1, 'Skip remembers where it happened');
  assert.equal(nextRobotTour(skipped, 9), skipped, 'a dismissed guide stays dismissed');
});

check('a finished guide can start again from Run', () => {
  const start = startRobotTour(initialRobotTourState(1), 2);
  const completed = nextRobotTour(nextRobotTour(nextRobotTour(start, 3), 4), 5);
  assert.equal(completed.status, 'completed');
  const again = startRobotTour(completed, 6);
  assert.equal(again.status, 'active', 'Show guide reopens a finished guide');
  assert.equal(again.stepIndex, 0, 'it starts again on Run');
  assert.equal(robotTourStepAt(again.stepIndex).id, 'run');
  assert.equal(again.updatedAt, 6);
});

check('the guide record is tolerant and remembers the step', () => {
  const store = (() => {
    const data = new Map();
    return {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => data.set(key, value),
    };
  })();
  assert.equal(readRobotTour(store).status, 'not-started', 'an empty store is a first visit');

  const saved = writeRobotTour({ ...initialRobotTourState(10), status: 'active', stepIndex: 1 }, store);
  assert.equal(JSON.parse(store.getItem(STORAGE_KEY_ROBOT_TOUR)).stepIndex, 1);
  assert.equal(readRobotTour(store).status, 'active');
  assert.equal(readRobotTour(store).stepIndex, 1);

  store.setItem(STORAGE_KEY_ROBOT_TOUR, JSON.stringify({ version: 99, status: 'active', stepIndex: 2 }));
  assert.equal(readRobotTour(store).status, 'not-started', 'another build\'s record is not this guide');
  store.setItem(STORAGE_KEY_ROBOT_TOUR, 'not json');
  assert.equal(readRobotTour(store).status, 'not-started', 'junk is not a record');
  assert.equal(readRobotTour(null).status, 'not-started', 'blocked storage still offers the guide');
  assert.equal(writeRobotTour(saved, null), saved, 'a blocked write returns what was rendered');
});

check('the protocol still writes one JSON reply, refuses after a stop, and re-arms', () => {
  const buffer = new SharedArrayBuffer(8 + 4096);
  const word = new Int32Array(buffer, 0, 2);
  armRobotWait(buffer);
  assert.equal(writeRobotReply(buffer, { value: 3 }), true);
  assert.equal(Atomics.load(word, 0), 1);
  cancelRobotWait(buffer);
  assert.equal(Atomics.load(word, 0), -1);
  assert.equal(writeRobotReply(buffer, { value: 4 }), false);
  armRobotWait(buffer);
  assert.equal(Atomics.load(word, 0), 0);
});

console.log(`\n${passed} robot model checks passed`);
