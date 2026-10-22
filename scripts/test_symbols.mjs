#!/usr/bin/env node
/**
 * Symbol linking: the rules (`scripts/test_symbols.mjs`, `npm run test:symbols`)
 *
 * Pressing F12 on a name should land on the line that defines it, and the interesting question is not
 * the jump, it is what counts as a definition and which one wins when there are two. Each rule is
 * pinned here because each fails differently in a browser:
 *
 * 1. **`def`, `async def` and `class`, at any indent.** A method is a definition a learner reads too;
 *    a `# def` in a comment and a `def` mentioned in prose are not definitions at all.
 * 2. **A top-level assignment is the other kind**, and only top level: `total = 0j` is a line to land
 *    on, `total += z` inside a loop is not, and `x == 1` binds nothing.
 * 3. **The first occurrence wins.** Python would keep the last; a jump to the bottom of the file is a
 *    worse answer than the line where the name is introduced.
 * 4. **The caret counts as being on the word before it**, because a learner types a name and presses
 *    F12 with the caret after it; whitespace and numbers resolve to nothing.
 * 5. **An attribute is not this file's symbol** — `z.real` is reported as one so the runner can
 *    decline it rather than jump to an unrelated `real`.
 * 6. **The open file wins a tie**, and the helper file is still searched: that is the jump that makes
 *    the read-only plant tab worth having.
 *
 * Run: node --experimental-strip-types scripts/test_symbols.mjs
 */

import assert from 'node:assert/strict';
import { findDefinition, indexSymbols, symbolAt } from '../app/src/symbolIndex.ts';

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

console.log('symbol linking');

check('def, async def and class are definitions with 1-based lines', () => {
  const code = ['import math', '', 'def run():', '    pass', '', '@decorator', 'async def tick():', '    pass', '', 'class Arm:', '    pass'].join('\n');
  const index = indexSymbols(code);
  assert.deepEqual(index.get('run'), { name: 'run', line: 3, kind: 'function' });
  assert.deepEqual(index.get('tick'), { name: 'tick', line: 7, kind: 'function' });
  assert.deepEqual(index.get('Arm'), { name: 'Arm', line: 10, kind: 'class' });
});

check('a method is a definition, a mention in a comment or a string is not', () => {
  const code = [
    'class Arm:',
    '    def reset(self):',
    '        """def home(self) is only words here."""',
    '        pass',
    '# def commented_out():',
    'def real():',
    '    pass',
  ].join('\n');
  const index = indexSymbols(code);
  assert.deepEqual(index.get('reset'), { name: 'reset', line: 2, kind: 'function' });
  assert.equal(index.has('commented_out'), false, 'a commented-out def was indexed');
  assert.equal(index.get('home'), undefined, 'a def inside a docstring was indexed');
  assert.deepEqual(index.get('real'), { name: 'real', line: 6, kind: 'function' });
});

check('a top-level assignment is a definition; an indented or augmented one is not', () => {
  const code = [
    'total = 0j',                     // 1  yes
    'gain: float = 1.0',              // 2  annotated, yes
    'flag = a == b',                  // 3  binds flag (to a comparison), yes
    'for z in arrows:',               // 4
    '    inner = z',                  // 5  indented
    'total += z',                     // 6  augmented, not a new binding line
    '# other = 1',                    // 7  a comment
  ].join('\n');
  const index = indexSymbols(code);
  assert.deepEqual(index.get('total'), { name: 'total', line: 1, kind: 'variable' });
  assert.deepEqual(index.get('gain'), { name: 'gain', line: 2, kind: 'variable' });
  assert.deepEqual(index.get('flag'), { name: 'flag', line: 3, kind: 'variable' });
  assert.equal(index.has('inner'), false, 'an indented assignment was indexed');
  assert.equal(index.has('other'), false, 'a comment was indexed');
});

check('the first definition wins, because that is the line to read', () => {
  const code = ['def step():', '    return 1', '', 'def step():', '    return 2'].join('\n');
  assert.equal(indexSymbols(code).get('step').line, 1);
});

check('the caret sits on the word before it', () => {
  const code = 'total = 3.25';
  assert.deepEqual(symbolAt(code, 2), { name: 'total', from: 0, to: 5, attribute: false });
  // Caret after the last letter: "total|" still answers total.
  assert.equal(symbolAt(code, 5).name, 'total');
  assert.equal(symbolAt(code, 5).to, 5);
  // On the space after it, and on the `=` after that: one answers the word, the other nothing.
  assert.equal(symbolAt(code, 6), null);
  assert.equal(symbolAt(code, 12), null, 'a number is not a name');
  assert.equal(symbolAt(code, 0).name, 'total');
  assert.equal(symbolAt('', 0), null);
});

check('a name after a dot is an attribute, and says so', () => {
  const ref = symbolAt('z = arrow(3.0, 0.0)\nprint(z.real)', 30);
  assert.equal(ref.name, 'real');
  assert.equal(ref.attribute, true);
  // The receiver itself is not an attribute.
  assert.equal(symbolAt('z = 1\nprint(z)', 12).attribute, false);
});

check('the active file wins a tie; the helper is still searched', () => {
  const files = [
    { name: 'main.py', text: 'def run():\n    pass' },
    { name: 'mechalab_plant.py', text: 'def run():\n    pass\n\ndef simulate_arm(t):\n    return t' },
  ];
  const tie = findDefinition('run', files, 'mechalab_plant.py');
  assert.equal(tie.file, 'mechalab_plant.py', 'the open file should win the tie');
  assert.equal(tie.line, 1);
  const only = findDefinition('simulate_arm', files, 'main.py');
  assert.deepEqual(only, { name: 'simulate_arm', line: 4, kind: 'function', file: 'mechalab_plant.py' });
});

check('a name nothing defines resolves to nothing', () => {
  const files = [{ name: 'main.py', text: 'x = 1' }];
  assert.equal(findDefinition('nope', files, 'main.py'), null);
  assert.equal(findDefinition('x', files, 'main.py').line, 1);
});

console.log(`symbol linking: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
