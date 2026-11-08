/**
 * The robot simulator's model, without a browser (`scripts/test_robot_sim.mjs`).
 *
 * This pins conventions, validation, movement, sensors and determinism. It is deliberately not proof
 * that a scenario's Python example produces `expected` — that is the browser suite's job, which runs
 * the actual example through Pyodide.
 */
import assert from 'node:assert/strict';
import {
  ROBOT_SCENARIOS,
  HEADINGS,
  applyCommand,
  blocked,
  freshRobot,
  replayWalk,
  robotScenario,
  scenarioProblems,
  wallDistance,
} from '../app/src/robotSim/model.ts';
import { armRobotWait, cancelRobotWait, writeRobotReply } from '../app/src/robotSim/protocol.ts';

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
};

check('the four lessons own a scenario and every scenario is valid', () => {
  assert.deepEqual(ROBOT_SCENARIOS.map((entry) => entry.lessonId), ['P.1', 'P.3', 'P.4', 'P.5']);
  for (const entry of ROBOT_SCENARIOS) {
    assert.deepEqual(scenarioProblems(entry), [], `${entry.lessonId}: ${scenarioProblems(entry).join('; ')}`);
    assert.equal(robotScenario(entry.lessonId), entry);
  }
  assert.equal(robotScenario('P.2'), null);
});

check('a malformed scenario is refused with reasons', () => {
  const broken = { ...ROBOT_SCENARIOS[0], walls: [{ x: 1, y: 4 }], target: { x: 99, y: 99 } };
  const problems = scenarioProblems(broken);
  assert(problems.some((line) => line.includes('outside the grid')));
  assert(problems.some((line) => line.includes('wall sits on the start')));
});

check('the declared walk matches expected, twice, and does not mutate its scenario', () => {
  for (const entry of ROBOT_SCENARIOS) {
    const before = JSON.stringify(entry);
    const first = replayWalk(entry, entry.modelWalk);
    const second = replayWalk(entry, entry.modelWalk);
    assert.deepEqual(first, second);
    assert.equal(JSON.stringify(entry), before);
    assert.equal(first.state.x, entry.expected.x);
    assert.equal(first.state.y, entry.expected.y);
    assert.equal(first.state.heading, entry.expected.heading);
    assert.equal(first.state.trail.length, entry.expected.trail);
    assert.equal(first.said, entry.expected.said);
    assert.equal(first.blockedMoves, entry.expected.blockedMoves);
  }
});

check('one square east is one cell and a turn is 90 degrees', () => {
  const entry = ROBOT_SCENARIOS[1];
  const start = freshRobot(entry);
  const moved = applyCommand(entry, start, 'move_forward', { steps: 1 });
  assert.deepEqual([moved.state.x, moved.state.y], [start.x + 1, start.y]);
  assert.equal(moved.state.heading, start.heading);
  const turned = applyCommand(entry, start, 'turn_right');
  assert.equal(turned.state.heading, (start.heading + 1) % 4);
  assert.equal(applyCommand(entry, start, 'turn_left').state.heading, (start.heading + 3) % 4);
});

check('the edge and a wall stop movement at the same rule the sensors read', () => {
  const entry = ROBOT_SCENARIOS[1];
  const atWall = { ...freshRobot(entry), x: 3, y: 4 };
  assert.equal(blocked(entry, { x: 4, y: 4 }), true);
  assert.equal(blocked(entry, { x: 3, y: -1 }), true);
  assert.equal(wallDistance(entry, atWall), 0);
  assert.equal(applyCommand(entry, atWall, 'wall_ahead').reply.value, true);
  const push = applyCommand(entry, atWall, 'move_forward', { steps: 3 });
  assert.equal(push.state.x, 3);
  assert.equal(push.blocked, true);
});

check('wall_distance counts the legal steps before a block at 0, 1 and 3', () => {
  const entry = ROBOT_SCENARIOS[0];
  const straight = { ...freshRobot(entry), x: 0, y: 4, heading: 1 };
  assert.equal(wallDistance(entry, { ...straight, x: 7 }), 0);
  assert.equal(wallDistance(entry, { ...straight, x: 6 }), 1);
  assert.equal(wallDistance(entry, { ...straight, x: 4 }), 3);
});

check('zero steps is a no-op and a disabled command never acts', () => {
  const entry = ROBOT_SCENARIOS[0];
  const start = freshRobot(entry);
  const zero = applyCommand(entry, start, 'move_forward', { steps: 0 });
  assert.deepEqual(zero.state, start);
  assert.equal(zero.blocked, false);
  const disabled = applyCommand(entry, start, 'turn_right');
  assert(disabled.reply.error);
  assert.deepEqual(disabled.state, start);
});

check('state is applied before the reply, and the trail grows one dot per cell', () => {
  const entry = ROBOT_SCENARIOS[3];
  const start = freshRobot(entry);
  const out = applyCommand(entry, start, 'move_forward', { steps: 2 });
  assert.equal(out.state.trail.length, 3);
  assert.equal(out.reply.value, 2);
  assert.equal(start.trail.length, 1, 'the input state must not be mutated');
});

check('the protocol writes one JSON reply, refuses after a stop, and re-arms', () => {
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
