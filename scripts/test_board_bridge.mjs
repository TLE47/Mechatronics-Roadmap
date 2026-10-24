#!/usr/bin/env node
/**
 * The Board card's data and grading (`scripts/test_board_bridge.mjs`).
 *
 * The card can be wrong in two ways that no type checks: it can show a sketch or a serial that the
 * lesson page no longer says (the generator's `--check` gate is the other half of that, and this file
 * proves the shipped file still validates), and it can pass a prediction that is not the serial, or
 * fail one that is. Both are graded here, on the real data, without a browser.
 *
 * Run: node --experimental-strip-types scripts/test_board_bridge.mjs (`npm run test:board`)
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  BOARD_SCHEMA,
  BOARD_SIMULATORS,
  bridgeById,
  displayTitle,
  gradeBoardPrint,
  validateBridges,
  verdictLine,
} from '../app/src/boardBridge.ts';

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL ${name}\n       ${error.message}`);
  }
}

const root = process.cwd();
const filePath = path.join(root, 'app/src/data/boardBridges.json');
const file = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const bridges = validateBridges(file);
const first = bridges[0];

console.log('board bridge');

check('the shipped data validates and names every Arduino lesson', () => {
  assert.equal(file.schema, BOARD_SCHEMA);
  assert.equal(bridges.length, 5, 'five lesson pages carry a Starter Code and a Full Solution');
  assert.equal(new Set(bridges.map((bridge) => bridge.id)).size, 5, 'ids are unique');
});

check('every bridge names a page that exists on disk', () => {
  for (const bridge of bridges) {
    assert.ok(
      fs.existsSync(path.join(root, bridge.page)),
      `${bridge.id} names ${bridge.page}, which is not in the repository`
    );
  }
});

check('every bridge is a sketch and a non-empty serial', () => {
  for (const bridge of bridges) {
    assert.match(bridge.solution, /void setup\(\)/, `${bridge.id} has a solution`);
    assert.match(bridge.starter, /void setup\(\)/, `${bridge.id} has a starter`);
    assert.ok(bridge.expectedOutput.trim().length > 0, `${bridge.id} has a serial`);
    assert.ok(!bridge.expectedOutput.startsWith('\n'), `${bridge.id}'s serial starts on its first line`);
  }
});

check('the expected serial of a bridge is the solution, not the starter', () => {
  // The starter is the exercise: if its print did match, the card would be grading the answer sheet.
  const differs = bridges.filter((bridge) => bridge.starter !== bridge.solution);
  assert.equal(differs.length, 5, 'every lesson asks the learner to change something');
});

check('a title is rendered without Markdown backticks or doubled spaces', () => {
  const cleaned = displayTitle('Lesson S0.7: Meet the Microcontroller (Arduino Uno `5 V`) — Digital I/O');
  assert.equal(cleaned, 'Lesson S0.7: Meet the Microcontroller (Arduino Uno 5 V) — Digital I/O');
  assert.equal(displayTitle('  spaced   out  '), 'spaced out');
});

check('the exact serial passes, and says so without a caveat', () => {
  const comparison = gradeBoardPrint(first, first.expectedOutput);
  assert.equal(comparison.matched, true);
  assert.equal(comparison.formattingDiffers, false);
  assert.equal(verdictLine(comparison), 'Matches the verified serial.');
});

check('the same values with different spacing still pass, and say why', () => {
  // The Stage-0 serials are column-aligned, so this is the case a learner actually hits.
  const reflowed = first.expectedOutput
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n');
  const comparison = gradeBoardPrint(first, reflowed);
  assert.equal(comparison.matched, true);
  assert.match(verdictLine(comparison), /spacing differs/);
});

check('a wrong value fails and names the line', () => {
  const wrong = first.expectedOutput
    .split('\n')
    .map((line, index) => (index === 1 ? line.replace(/HIGH|LOW/, 'XX') : line))
    .join('\n');
  const comparison = gradeBoardPrint(first, wrong);
  assert.equal(comparison.matched, false);
  assert.equal(comparison.firstDiffLine, 2, 'the second line is the one that differs');
  assert.match(verdictLine(comparison), /line 2 differs/);
});

check('a missing line fails, and an empty prediction is not a pass', () => {
  const truncated = first.expectedOutput.split('\n').slice(0, -1).join('\n');
  assert.equal(gradeBoardPrint(first, truncated).matched, false);
  assert.equal(gradeBoardPrint(first, '').matched, false);
  assert.equal(gradeBoardPrint(first, '   \n  ').matched, false);
});

check('a bridge is found by id, and an unknown id is undefined rather than a throw', () => {
  assert.equal(bridgeById(bridges, first.id)?.id, first.id);
  assert.equal(bridgeById(bridges, 'no-such-lesson'), undefined);
});

check('the simulators are links that open another tab, with steps in order', () => {
  assert.equal(BOARD_SIMULATORS.length, 2);
  for (const simulator of BOARD_SIMULATORS) {
    assert.match(simulator.url, /^https:\/\//, `${simulator.name} is https`);
    assert.ok(simulator.steps.length >= 3, `${simulator.name} tells the reader what to do`);
  }
  assert.match(BOARD_SIMULATORS[0].url, /wokwi\.com/, 'Wokwi is the primary hand-off');
});

check('a document with no schema, a duplicate id or a blank serial is refused', () => {
  const good = {
    schema: BOARD_SCHEMA,
    generatedBy: 'test',
    bridges: [JSON.parse(JSON.stringify(first))],
  };
  assert.equal(validateBridges(good).length, 1);
  assert.throws(() => validateBridges({ ...good, schema: 'other/1' }), /schema/);
  assert.throws(
    () => validateBridges({ ...good, bridges: [first, first] }),
    /duplicate id/,
    'one card per lesson'
  );
  const blank = { ...JSON.parse(JSON.stringify(first)), expectedOutput: '   ' };
  assert.throws(() => validateBridges({ ...good, bridges: [blank] }), /no expectedOutput/);
  const noPage = { ...JSON.parse(JSON.stringify(first)), page: 'not-a-page.txt' };
  assert.throws(() => validateBridges({ ...good, bridges: [noPage] }), /not a page/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
