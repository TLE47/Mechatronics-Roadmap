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

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
};

check('the four robot lessons are the lesson records themselves', () => {
  assert.deepEqual(
    ROBOT_SCENARIOS.map((entry) => entry.lessonId),
    ['P.1', 'P.3', 'P.4', 'P.5']
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
  assert.equal(robotScenario('P.2'), null);
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
