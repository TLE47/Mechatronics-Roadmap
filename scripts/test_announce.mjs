// A live region interrupts whatever a screen reader is in the middle of, so the sentence it holds is a
// piece of writing with rules: verdict first, the specific reason, short, and nothing at all when there
// is no outcome. Those rules are pinned here because a browser can only reach the easy branches.
import assert from 'node:assert/strict';
import {
  MAX_ANNOUNCEMENT,
  condense,
  exceptionLine,
  predictionAnnouncement,
  runAnnouncement,
} from '../app/src/announce.ts';
import { compareStdout } from '../app/src/outputMatch.ts';

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

const RUN = (over) => ({ lessonId: 'P.1', verdict: 'mismatch', ...over });

check('an untested lesson announces nothing', () => {
  assert.equal(runAnnouncement(RUN({ verdict: 'untested' })), '');
  assert.equal(runAnnouncement(RUN({ verdict: 'untested', prediction: { verdict: 'match', matchedLines: 1, predictedLines: 1, skipped: false } })), '');
});

check('a pass says so first, then what was checked', () => {
  const text = runAnnouncement(RUN({ verdict: 'passed' }));
  assert.match(text, /^Lesson P\.1 passed:/);
  assert.match(text, /output matched/);
  assert.match(text, /behaviour check/);
});

check('a mismatch quotes the two lines instead of pointing at a colour', () => {
  const text = runAnnouncement(
    RUN({ verdict: 'mismatch', firstDiff: { expected: 'Encoder Ticks: 425', actual: 'Encoder Ticks: 400' } })
  );
  assert.match(text, /^Lesson P\.1 has not passed:/);
  assert.match(text, /expected "Encoder Ticks: 425", got "Encoder Ticks: 400"/);
  assert.equal(
    /read the failing line above/i.test(text),
    false,
    'the announcement must carry the failure, not an instruction to go and find it'
  );
});

check('a long line is quoted short, on a clean cut', () => {
  const long = 'A'.repeat(200);
  const text = runAnnouncement(RUN({ verdict: 'mismatch', firstDiff: { expected: long, actual: 'x' } }));
  assert.ok(text.length <= MAX_ANNOUNCEMENT, `expected <= ${MAX_ANNOUNCEMENT} chars, got ${text.length}`);
  assert.match(text, /…/, 'a cut quote must say it was cut');
});

check('behaviour and harness failures carry their own sentence', () => {
  const behaviour = runAnnouncement(RUN({ verdict: 'behavior_failed', harnessSummary: 'settling_time(20, 0.7) expected 0.286, got 0.5' }));
  assert.match(behaviour, /a behaviour check failed/);
  assert.match(behaviour, /settling_time/);
  const harness = runAnnouncement(RUN({ verdict: 'harness_failed', harnessSummary: 'penalty 4.5 nH against a 2.0 nH budget' }));
  assert.match(harness, /a graded metric is off target/);
  assert.match(harness, /4\.5 nH/);
});

check('a runtime error announces the exception line, not the traceback', () => {
  const stderr = [
    'Traceback (most recent call last):',
    '  File "main.py", line 7, in <module>',
    '    print(total)',
    'NameError: name \'total\' is not defined',
  ].join('\n');
  const text = runAnnouncement(RUN({ verdict: 'error', stderr }));
  assert.match(text, /failed to run:/);
  assert.match(text, /NameError: name 'total' is not defined/);
  assert.match(text, /^Lesson P\.1 failed to run: NameError/, 'the verdict must be the first words');
  assert.equal(text.includes('Traceback'), false, 'frames are for the card, not the announcement');
});

check('an error with no message still says something true', () => {
  assert.match(runAnnouncement(RUN({ verdict: 'error', stderr: '   ' })), /raised an error/);
});

check('a Stop says what happened and what was kept', () => {
  const text = runAnnouncement(RUN({ verdict: 'stopped' }));
  assert.match(text, /was stopped/);
  assert.match(text, /code is preserved/);
});

check('the prediction is a second sentence, and a skip is not a guess', () => {
  const matched = runAnnouncement(
    RUN({ verdict: 'passed', prediction: { verdict: 'match', matchedLines: 2, predictedLines: 2, skipped: false } })
  );
  assert.match(matched, /Your prediction was exact\.$/);
  const partial = runAnnouncement(
    RUN({ verdict: 'mismatch', firstDiff: { expected: 'a', actual: 'b' }, prediction: { verdict: 'partial', matchedLines: 1, predictedLines: 3, skipped: false } })
  );
  assert.match(partial, /matched 1 of 3 lines/);
  const skipped = runAnnouncement(
    RUN({ verdict: 'passed', prediction: { verdict: 'miss', matchedLines: 0, predictedLines: 0, skipped: true } })
  );
  assert.match(skipped, /without predicting/);
  assert.match(predictionAnnouncement({ verdict: 'match', matchedLines: 1, predictedLines: 1, skipped: false }), /exact/);
  assert.equal(predictionAnnouncement({ verdict: 'miss', matchedLines: 0, predictedLines: 0, skipped: true }), 'Prediction skipped.');
});

check('the failing line is the one the comparison named', () => {
  // The announcement's quote comes from the same comparison the panel draws, so the two surfaces cannot
  // name different lines.
  const comparison = compareStdout('ok\nsecond', 'ok\nfirst');
  assert.equal(comparison.firstDiffLine, 2);
  assert.deepEqual(comparison.firstDiff, { expected: 'first', actual: 'second' });
  assert.equal(compareStdout('ok', 'ok').firstDiff, null);
});

check('an output that ends early is a difference, not a missing value', () => {
  const comparison = compareStdout('only one line', 'only one line\nand a second');
  assert.deepEqual(comparison.firstDiff, {
    expected: 'and a second',
    actual: '(no line: the output ends here)',
  });
  const longer = compareStdout('a\nb\nc', 'a\nb');
  assert.deepEqual(longer.firstDiff, { expected: '(no line: the output ends here)', actual: 'c' });
});

check('condense flattens whitespace, cuts on a word, and leaves short text alone', () => {
  assert.equal(condense('a\n\n  b\t c'), 'a b c');
  assert.equal(condense('short'), 'short');
  const cut = condense('one two three four five six seven eight nine ten', 20);
  assert.ok(cut.length <= 20, `expected <= 20 chars, got ${cut.length}`);
  assert.ok(cut.endsWith('…'));
  assert.equal(cut.includes('een'), false, 'the cut must land between words');
});

check('the exception line of a traceback is its last non-empty line', () => {
  assert.equal(exceptionLine('a\nb\n\n'), 'b');
  assert.equal(exceptionLine(''), '');
});

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\ntest_announce: all checks passed');
