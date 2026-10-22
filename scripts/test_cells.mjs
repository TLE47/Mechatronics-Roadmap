#!/usr/bin/env node
/**
 * `# %%` cells: the boundaries (`scripts/test_cells.mjs`, `npm run test:cells`)
 *
 * A cell button runs a *range of lines*, and the two ways to get it wrong are silent: the range that
 * includes one line too many (a half-written statement runs, or a later cell's side effects fire) and
 * the preamble that is dropped (the imports and constants above the first marker never execute, so
 * every cell `NameError`s). So:
 *
 * 1. **A marker starts a cell, at column 0 only.** `    # %%` inside a function is not a boundary.
 * 2. **The code above the first marker is a cell** — unless there is none, in which case it is not an
 *    empty "Cell 1" that shifts every button's number.
 * 3. **Run to here means through the end of that cell, and no further**, which is the only stateless
 *    reading of a cell run: the worker runs each program in a fresh namespace.
 * 4. **A title is optional**, trimmed, and printed beside the number.
 *
 * Run: node --experimental-strip-types scripts/test_cells.mjs
 */

import assert from 'node:assert/strict';
import { cellLabel, cellPrefix, hasCells, parseCells } from '../app/src/editor/cells.ts';

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

console.log('# %% cells');

check('a document with no markers is one cell, and the editor draws nothing', () => {
  const cells = parseCells('x = 1\ny = 2\n');
  assert.equal(cells.length, 1);
  assert.equal(cells[0].markerLine, null);
  assert.equal(cells[0].firstLine, 0);
  assert.equal(hasCells(cells), false);
  assert.equal(hasCells(parseCells('')), false);
});

check('markers split the document, with the code above the first one as cell 1', () => {
  const text = ['import math', '', '# %% Set up', 'mass = 2.0', '', '# %% The step', 'print(mass * 9.81)'].join('\n');
  const cells = parseCells(text);
  // The blank line that separates two cells belongs to neither: a cell ends at its last code line.
  assert.deepEqual(
    cells.map((cell) => [cell.index, cell.markerLine, cell.title, cell.firstLine, cell.lastLine]),
    [
      [0, null, '', 0, 0],
      [1, 2, 'Set up', 3, 3],
      [2, 5, 'The step', 6, 6],
    ]
  );
  assert.equal(hasCells(cells), true);
});

check('a marker on the first line is cell 1: no empty preamble to shift the numbers', () => {
  const cells = parseCells('# %%\nx = 1');
  assert.equal(cells.length, 1);
  assert.equal(cells[0].markerLine, 0);
  assert.equal(cells[0].title, '');
  assert.deepEqual([cells[0].firstLine, cells[0].lastLine], [1, 1]);
});

check('an indented marker is inside a block, not a boundary', () => {
  const text = ['def run():', '    # %% not a cell', '    return 1', '# %% real', 'run()'].join('\n');
  const cells = parseCells(text);
  assert.deepEqual(
    cells.map((cell) => cell.markerLine),
    [null, 3]
  );
  assert.equal(cells[1].title, 'real');
});

check('a cell with no code runs the code above it, marker line and all', () => {
  const text = ['x = 1', '# %%', '# %% after'].join('\n');
  const cells = parseCells(text);
  assert.deepEqual(
    cells.map((cell) => [cell.markerLine, cell.firstLine, cell.lastLine]),
    [
      [null, 0, 0],
      [1, 2, 1],
      [2, 3, 2],
    ]
  );
  // The marker is a comment, so running through it is the same program as running the line above.
  assert.equal(cellPrefix(text, 1), 'x = 1\n# %%');
});

check('run to here stops at the end of that cell, and never at the end of the file', () => {
  const text = ['# %% a', 'x = 1', '', '# %% b', 'y = x + 1', '', '# %% c', 'z = y * 2'].join('\n');
  assert.equal(cellPrefix(text, 0), '# %% a\nx = 1');
  assert.equal(cellPrefix(text, 1), '# %% a\nx = 1\n\n# %% b\ny = x + 1');
  assert.equal(cellPrefix(text, 2), text, 'the last cell is the whole document');
});

check('a trailing newline is not part of a cell', () => {
  const text = 'x = 1\n# %%\ny = 2\n';
  assert.equal(cellPrefix(text, 1), 'x = 1\n# %%\ny = 2');
});

check('an index that is not a cell runs nothing', () => {
  const text = 'x = 1\n# %%\ny = 2';
  assert.equal(cellPrefix(text, 2), null);
  assert.equal(cellPrefix(text, -1), null);
});

check('the button says the number and, when there is one, the title', () => {
  const cells = parseCells('x = 1\n# %%  Set up  ');
  assert.equal(cellLabel(cells[0]), 'Cell 1');
  assert.equal(cellLabel(cells[1]), 'Cell 2 · Set up');
});

console.log(`# %% cells: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
