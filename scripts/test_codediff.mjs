// The Diff panel is a judgement about the learner's work, so its rules are tested rather than eyeballed:
// what counts as a change, what a gap is, and what happens when the answer would not fit on a screen.
import assert from 'node:assert/strict';
import {
  DEFAULT_CONTEXT,
  MAX_DIFF_ROWS,
  MAX_TABLE_CELLS,
  diffLines,
  diffSummary,
  splitLines,
} from '../app/src/codeDiff.ts';
import {
  diffSameMessage,
  isDiffTarget,
  resolveDiffReference,
  runTarget,
} from '../app/src/diffReference.ts';
import { editedLines } from '../app/src/lessonDraft.ts';
import { PYTHON_LESSONS } from '../app/src/data/pythonLessonsData.ts';

let failures = 0;
function check(name, body) {
  try {
    body();
    console.log(`  ok  ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`  FAIL ${name}\n       ${error.message}`);
  }
}

const kinds = (diff) => diff.blocks.flatMap((block) => block.rows.map((row) => row.kind));
const texts = (diff) => diff.blocks.flatMap((block) => block.rows.map((row) => row.text));

check('a trailing newline is not a line', () => {
  assert.deepEqual(splitLines('a\nb\n'), ['a', 'b']);
  assert.deepEqual(splitLines('a\nb'), ['a', 'b']);
  assert.deepEqual(splitLines(''), []);
  // The empty file on one side and the empty string on the other are the same program.
  assert.equal(diffLines('', '').added + diffLines('', '').removed, 0);
});

check('identical texts have no blocks and say so', () => {
  const diff = diffLines('a\nb\nc\n', 'a\nb\nc\n');
  assert.equal(diff.added, 0);
  assert.equal(diff.removed, 0);
  assert.equal(diff.unchanged, 3);
  assert.deepEqual(diff.blocks, []);
  assert.equal(diffSummary(diff), 'no changes');
});

check('an inserted line costs one, not the whole file', () => {
  const before = ['def f(x):', '    y = x + 1', '    return y'];
  const after = ['def f(x):', '    y = x + 1', '    y = y * 2', '    return y'];
  const diff = diffLines(before.join('\n'), after.join('\n'));
  assert.equal(diff.added, 1);
  assert.equal(diff.removed, 0);
  assert.equal(diffSummary(diff), '+1');
  assert.deepEqual(kinds(diff), ['same', 'same', 'added', 'same']);
});

check('a rewrite reads as a removal and an addition', () => {
  const diff = diffLines('a = 1\nb = 2\n', 'a = 1\nb = 20\n');
  assert.equal(diff.removed, 1);
  assert.equal(diff.added, 1);
  assert.equal(diffSummary(diff), '+1 −1');
  // Removed first, then added: the panel reads top-to-bottom like `git diff`.
  assert.deepEqual(kinds(diff), ['same', 'removed', 'added']);
});

check('whitespace is a change — the output check is the lenient one', () => {
  const diff = diffLines('if x:\n  y\n', 'if x:\n    y\n');
  assert.equal(diff.removed, 1);
  assert.equal(diff.added, 1);
});

check('line numbers follow each side, and an added line has no left number', () => {
  const diff = diffLines('one\ntwo\n', 'one\nnew\ntwo\n');
  const rows = diff.blocks.flatMap((block) => block.rows);
  const added = rows.find((row) => row.kind === 'added');
  assert.equal(added.left, null);
  assert.equal(added.right, 2);
  const tail = rows[rows.length - 1];
  assert.equal(tail.kind, 'same');
  assert.equal(tail.left, 2);
  assert.equal(tail.right, 3);
});

check('unchanged runs are trimmed to context and the gap is counted', () => {
  const before = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`);
  const after = [...before];
  after[19] = 'line 20 changed';
  const diff = diffLines(before.join('\n'), after.join('\n'));
  assert.equal(diff.blocks.length, 1);
  const [block] = diff.blocks;
  assert.equal(block.gap, 19 - DEFAULT_CONTEXT, 'expected the skipped head counted as a gap');
  assert.equal(block.rows.length, DEFAULT_CONTEXT * 2 + 2, 'expected context either side plus the rewrite');
  assert.equal(diff.unchanged, 39, 'expected the counts to describe the whole file, not the trimmed view');
});

check('changes closer than twice the context share one block', () => {
  const before = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
  const after = [...before];
  after[9] = 'changed 10';
  after[12] = 'changed 13';
  const diff = diffLines(before.join('\n'), after.join('\n'));
  assert.equal(diff.blocks.length, 1, 'expected one block, not two windows that overlap');
  assert.equal(diff.blocks[0].gap, 9 - DEFAULT_CONTEXT);
});

check('the view is capped, but the counts still describe the whole file', () => {
  const before = Array.from({ length: MAX_DIFF_ROWS }, (_, i) => `old ${i}`);
  const after = Array.from({ length: MAX_DIFF_ROWS }, (_, i) => `new ${i}`);
  const diff = diffLines(before.join('\n'), after.join('\n'));
  assert.ok(diff.blocks.flatMap((block) => block.rows).length <= MAX_DIFF_ROWS, 'expected the view to be cut');
  assert.equal(diff.truncated, true);
  assert.equal(diff.removed, MAX_DIFF_ROWS);
  assert.equal(diff.added, MAX_DIFF_ROWS);
});

check('a table too large for the subsequence keeps the common head and tail', () => {
  const side = Math.ceil(Math.sqrt(MAX_TABLE_CELLS)) + 10;
  const before = Array.from({ length: side }, (_, i) => `line ${i}`);
  const after = Array.from({ length: side }, (_, i) => `line ${i}`);
  after[Math.floor(side / 2)] = 'middle changed';
  const diff = diffLines(before.join('\n'), after.join('\n'));
  assert.equal(diff.coarse, true, 'expected the head/tail fallback past the table limit');
  // Still a true statement about the two files: one line each way, the rest unchanged.
  assert.equal(diff.removed, 1);
  assert.equal(diff.added, 1);
});

check('nothing on the left is all additions, and nothing on the right all removals', () => {
  const fresh = diffLines('', 'a\nb\n');
  assert.equal(fresh.added, 2);
  assert.equal(fresh.removed, 0);
  const cleared = diffLines('a\nb\n', '');
  assert.equal(cleared.removed, 2);
  assert.equal(cleared.added, 0);
});

check('the Diff panel and the card count edits the same way', () => {
  // One implementation, two surfaces: the roadmap card's "N lines changed" and the panel's totals
  // must never disagree, on any starter the course ships.
  for (const lesson of PYTHON_LESSONS) {
    const starter = lesson.starterCode;
    const edits = [
      `${starter.trimEnd()}\n# one more idea`,
      starter.replace(/^(?=\S)/m, '# header\n'),
      starter.split('\n').reverse().join('\n'),
      '',
    ];
    for (const code of edits) {
      const diff = diffLines(starter, code);
      assert.equal(
        editedLines(code, starter),
        diff.added + diff.removed,
        `${lesson.id}: the card and the panel disagree on ${JSON.stringify(code.slice(0, 20))}`
      );
    }
    assert.equal(editedLines(starter, starter), 0, `${lesson.id}: the starter must read as untouched`);
  }
});

check('the summary omits a side that did not change', () => {
  assert.equal(diffSummary({ added: 3, removed: 0 }), '+3');
  assert.equal(diffSummary({ added: 0, removed: 4 }), '−4');
  assert.equal(diffSummary({ added: 0, removed: 0 }), 'no changes');
});

// --- What the panel compares against ------------------------------------------------------------
// Starter, the earned solution, and now the code a filed run started from. Both non-obvious rules are
// tested here rather than trusted to the panel: the fallback that keeps a stale target from blanking
// the diff, and the lock that keeps an unearned solution unreadable through the target id itself.

const NOW = 1_700_000_000_000;
const source = (over = {}) => ({
  starter: 'print("start")\n',
  solution: 'print("answer")\n',
  solutionUnlocked: false,
  history: [
    { code: 'print("newest")\n', at: NOW - 60_000, outcome: 'passed' },
    { code: 'print("older")\n', at: NOW - 3 * 3_600_000, outcome: 'mismatch' },
  ],
  ...over,
});

check('the starter is the reference until something else is picked', () => {
  const reference = resolveDiffReference('starter', source(), NOW);
  assert.equal(reference.code, 'print("start")\n');
  assert.equal(reference.label, 'starter');
  assert.equal(reference.fellBack, false);
});

check('run:<i> reads the code that version filed, and names it with its verdict', () => {
  const newest = resolveDiffReference(runTarget(0), source(), NOW);
  assert.equal(newest.code, 'print("newest")\n');
  assert.equal(newest.label, 'run 1 min ago · passed');
  assert.equal(newest.fellBack, false);
  const older = resolveDiffReference(runTarget(1), source(), NOW);
  assert.equal(older.code, 'print("older")\n');
  assert.equal(older.label, 'run 3 h ago · output mismatch');
});

check('a version the history no longer holds falls back to the starter, it never blanks', () => {
  // The cap keeps five, and the History panel can clear the list while a diff is open.
  for (const target of [runTarget(2), runTarget(99), runTarget(-1)]) {
    const reference = resolveDiffReference(target, source(), NOW);
    assert.equal(reference.code, 'print("start")\n', `${target} must read as the starter`);
    assert.equal(reference.fellBack, true, `${target} must say it fell back`);
  }
  const cleared = resolveDiffReference(runTarget(0), source({ history: [] }), NOW);
  assert.equal(cleared.code, 'print("start")\n');
  assert.equal(cleared.fellBack, true);
});

check('the solution stays unreadable until it is earned, even through the target id', () => {
  const locked = resolveDiffReference('solution', source(), NOW);
  assert.equal(locked.code, 'print("start")\n', 'a locked solution must not leak its text');
  assert.equal(locked.label, 'starter');
  assert.equal(locked.fellBack, true);
  const earned = resolveDiffReference('solution', source({ solutionUnlocked: true }), NOW);
  assert.equal(earned.code, 'print("answer")\n');
  assert.equal(earned.label, 'solution');
  assert.equal(earned.fellBack, false);
});

check('only the three reference shapes are targets', () => {
  assert.equal(isDiffTarget('starter'), true);
  assert.equal(isDiffTarget('solution'), true);
  assert.equal(isDiffTarget(runTarget(0)), true);
  for (const junk of ['', 'run:', 'run:one', 'run:0.5', 'latest', 'RUN:1']) {
    assert.equal(isDiffTarget(junk), false, `${JSON.stringify(junk)} must not be a target`);
  }
});

check('the "nothing to report" line names the reference it used', () => {
  const starter = resolveDiffReference('starter', source(), NOW);
  assert.equal(diffSameMessage('starter', starter), 'The starter, unchanged — nothing written yet.');
  const version = resolveDiffReference(runTarget(0), source(), NOW);
  assert.equal(diffSameMessage(runTarget(0), version), 'The run 1 min ago · passed, unchanged.');
  const solution = resolveDiffReference('solution', source({ solutionUnlocked: true }), NOW);
  assert.equal(diffSameMessage('solution', solution), 'The solution, unchanged.');
});

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log(`\ntest_codediff: all checks passed`);
