#!/usr/bin/env node
/**
 * The editor's two pure parts, checked without a browser (`npm run test:editor`).
 *
 *   1. **Sliders are comments on numbers.** `Kp = 4.0  # @slider 0 20 0.1` must produce exactly one
 *      slider whose offsets select the literal `4.0` - not the number inside the directive, not the
 *      name. A wrong offset rewrites the wrong text, which is worse than no slider at all.
 *   2. **A bad directive is ignored, not guessed at.** Missing range, inverted range, or a range that
 *      is really a string must not invent bounds; the file stays plain Python.
 *   3. **A drag snaps and clamps, and never loops.** Rewriting to the value already in the file
 *      returns null, so a drag inside one step cannot dispatch a no-op change on every pixel.
 *   4. **Only lessons that mention the plant get the locked tab.** Claiming a helper a lesson does
 *      not import is noise; missing one it does import breaks the import.
 *   5. **The control and mechanics starters keep their sliders.** Each annotated constant must still
 *      parse, sit inside its own range, and be read by the demo - a slider wired to nothing is a
 *      control that does nothing.
 *
 * Run: `node --experimental-strip-types scripts/test_editor.mjs` (also a suite in test_workbench)
 */

import assert from 'node:assert/strict';
import {
  defaultStep,
  formatSliderValue,
  parseSliders,
  sliderEdit,
} from '../app/src/editor/sliderModel.ts';
import { helperFilesForLesson, lessonUsesPlant, MAIN_FILE_NAME } from '../app/src/lessonFiles.ts';
import { PYTHON_LESSONS } from '../app/src/data/pythonLessonsData.ts';

const one = parseSliders('Kp = 4.0  # @slider 0 20 0.1');
assert.equal(one.length, 1, 'a marked assignment must produce one slider');
assert.equal(one[0].name, 'Kp', 'the slider is named after the assignment');
assert.equal(one[0].value, 4, 'the literal is the slider start');
assert.equal(one[0].min, 0);
assert.equal(one[0].max, 20);
assert.equal(one[0].step, 0.1);
assert.equal(one[0].decimals, 1, 'the literal was written with one decimal, so rewrites should keep it');
assert.equal(one[0].line, 0);
const code = 'Kp = 4.0  # @slider 0 20 0.1';
assert.equal(code.slice(one[0].from, one[0].to), '4.0', 'the offsets must select the assignment literal');
console.log('  ok a marked assignment yields one slider with offsets on the literal');

const indented = parseSliders('def control():\n    k = 0.25  # @slider 0 1\n    return k\n');
assert.equal(indented.length, 1, 'an indented assignment still counts');
assert.equal(indented[0].line, 1, 'the line is the document line, not the first matching one');
assert.equal(indented[0].step, 0.01, 'a two-decimal default with no step suggests two decimal places');
console.log('  ok indented assignments keep their document line and infer a step');

const negatives = parseSliders('offset = -2  # @slider -5 5 0.5');
assert.equal(negatives[0].value, -2, 'a negative literal must parse as a number, not a minus on a name');
assert.equal(negatives[0].min, -5, 'a negative minimum must parse');
assert.equal(negatives[0].from, 'offset = '.length, 'the offsets must land on "-2", not on "2"');
console.log('  ok negative defaults and ranges are read as numbers');

const ignored = [
  'Kp = 4.0',
  'if Kp == 4.0:  # @slider 0 20 0.1',
  'label = "Kp = 4.0  # @slider 0 20 0.1"',
  'Kp = 4.0  # @slider 20',
  'Kp = 4.0  # @slider 20 0 1',
  'Kp = 4.0  # @slider 0 20 -1',
  'Kp = 4.0  # @sliders 0 20 1',
];
assert.deepEqual(
  ignored.flatMap((source) => parseSliders(source)),
  [],
  `only a complete, sane directive is a slider; these should be ignored: ${ignored.join(' | ')}`
);
assert.equal(defaultStep(0, 10, 3), 1, 'an integer range defaults to a step of one');
assert.equal(defaultStep(0, 1, 0.5), 0.1, 'a one-decimal range defaults to 0.1');
console.log('  ok malformed or ambiguous directives are ignored rather than guessed at');

const spec = parseSliders('Kp = 4.0  # @slider 0 20 0.1')[0];
assert.equal(sliderEdit(spec, 4.0), null, 'writing the value that is already there must not dispatch a change');
assert.equal(sliderEdit(spec, 4.06)?.insert, '4.1', 'a value between steps snaps to the nearest one');
assert.equal(sliderEdit(spec, 4.03), null, 'a value that snaps back onto the current one is not a change');
assert.equal(sliderEdit(spec, 20.4)?.insert, '20.0', 'a drag past the maximum clamps to it');
assert.equal(sliderEdit(spec, -3)?.insert, '0.0', 'a drag below the minimum clamps to it');
assert.equal(sliderEdit(spec, 12.5)?.insert, '12.5', 'an in-range value is written with the literal\'s decimals');
assert.equal(formatSliderValue(7, 0), '7', 'an integer slider writes an integer');
assert.equal(formatSliderValue(7, 1), '7.0', 'a one-decimal slider keeps its decimal');
console.log('  ok a drag clamps, snaps, formats, and never rewrites to the same text');

const many = parseSliders('a = 1  # @slider 0 5 1\nb = 2.5  # @slider 0 10 0.5');
assert.deepEqual(many.map((entry) => entry.name), ['a', 'b'], 'several sliders keep document order');
assert.deepEqual(
  many.map((entry) => 'a = 1  # @slider 0 5 1\nb = 2.5  # @slider 0 10 0.5'.slice(entry.from, entry.to)),
  ['1', '2.5'],
  'each slider\'s offsets point into its own line'
);
console.log('  ok multiple sliders keep order and own offsets');

// --- annotated starters ----------------------------------------------------------------------

// The control and mechanics lessons open with their key numbers already tunable. This list is the
// promise: a starter that loses its slider (or gains one it never uses) fails here rather than
// silently opening as a plain editor again.
const ANNOTATED = ['02.1', '02.2', '02.3', '02.4', '02.5', '05.1', '05.2'];
for (const id of ANNOTATED) {
  const lesson = PYTHON_LESSONS.find((entry) => entry.id === id);
  assert(lesson, `${id} must be in the lesson registry`);
  const specs = parseSliders(lesson.starterCode);
  assert(specs.length >= 1, `${id}'s starter must open with at least one tunable parameter`);
  for (const spec of specs) {
    assert(
      spec.value >= spec.min && spec.value <= spec.max,
      `${id}: ${spec.name} starts at ${spec.value}, outside its own ${spec.min}..${spec.max} range`
    );
    const used = lesson.starterCode
      .split('\n')
      .filter((line) => !line.includes('@slider') && new RegExp(`\\b${spec.name}\\b`).test(line));
    assert(
      used.length >= 1,
      `${id}: ${spec.name} has a slider but the program never reads it, so dragging it would do nothing`
    );
  }
}
const totalSliders = ANNOTATED.reduce(
  (sum, id) => sum + parseSliders(PYTHON_LESSONS.find((entry) => entry.id === id).starterCode).length,
  0
);
console.log(`  ok ${ANNOTATED.length} control/mechanics starters carry ${totalSliders} wired sliders`);

// --- lesson helper files ---------------------------------------------------------------------

const lesson = (overrides = {}) => ({
  id: 'T.1',
  title: 'Test lesson',
  track: 'track-t',
  path: 't/T.1.md',
  ideas: ['one'],
  starterCode: 'print(1)',
  hints: [],
  fullSolution: 'print(1)',
  expectedOutput: '1',
  outputMatch: 'normalized',
  instructorTestSummary: [],
  instructorTests: '',
  ...overrides,
});

const plant = { filename: 'mechalab_plant.py', source: '# plant\n' };
assert.equal(MAIN_FILE_NAME, 'main.py', 'the entry file keeps the name the docs and tests use');
assert.equal(lessonUsesPlant(lesson()), false, 'a plain lesson does not claim the plant');
assert.equal(lessonUsesPlant(lesson({ hints: ['import mechalab_plant'] })), true, 'a hint that imports the plant counts');
assert.equal(
  lessonUsesPlant(lesson({ instructorTests: 'import mechalab_plant as plant' })),
  true,
  'a test that imports the plant counts: the run would otherwise fail on the import'
);
assert.deepEqual(helperFilesForLesson(lesson(), plant), [], 'no plant, no locked tab');

const helpers = helperFilesForLesson(lesson({ starterCode: 'from mechalab_plant import simulate_arm' }), plant);
assert.equal(helpers.length, 1, 'a lesson that imports the plant gets exactly one helper');
assert.equal(helpers[0].name, 'mechalab_plant.py');
assert.equal(helpers[0].content, '# plant\n', 'the tab shows the same source the worker writes');
assert.equal(helpers[0].readOnly, true, 'the shared plant is read-only: an edit would disagree with the checks');
console.log('  ok only lessons that import the plant get its read-only tab');

console.log('[PASS] Editor model: sliders parse, clamp and format; helper tabs follow the lesson text.');
