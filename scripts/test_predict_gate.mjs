// The predict-first gate grades a free-text guess, which is the kind of judgement that must be stated
// rather than felt: these checks pin the rules (lines not strings, four verdicts, no fuzzy distance),
// the store's bounds, and the one thing the gate must never do — block a learner for good.
import assert from 'node:assert/strict';
import {
  MAX_PREDICTION_CHARS,
  MAX_PREDICTIONS,
  PREDICTIONS_KEY,
  checkPrediction,
  clearAllPredictions,
  clearPrediction,
  describeCheck,
  predictionFor,
  predictionLines,
  readPredictions,
  savePrediction,
} from '../app/src/predictGate.ts';
import { PYTHON_LESSONS } from '../app/src/data/pythonLessonsData.ts';

/** A `Storage` in memory: the gate reads through the bulk store, which falls back to the bucket. */
class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  get length() {
    return this.map.size;
  }
  key(index) {
    return [...this.map.keys()][index] ?? null;
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, String(value));
  }
  removeItem(key) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
}

globalThis.localStorage = new MemoryStorage();

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

const RECORD = (over) => ({
  lessonId: 'P.1',
  text: 'x',
  verdict: 'match',
  matchedLines: 1,
  predictedLines: 1,
  skipped: false,
  at: 1_700_000_000_000,
  ...over,
});

check('a prediction is compared by its lines, trimmed and with inner whitespace collapsed', () => {
  assert.deepEqual(predictionLines('  a  =  1 \n\n b=2 \r\n'), ['a = 1', 'b=2']);
  assert.deepEqual(predictionLines(''), []);
  assert.deepEqual(predictionLines('\n \n'), []);
});

check('case and punctuation are part of the claim', () => {
  // Python's `True` is not `true`; a prediction that says so is wrong in a way the learner can see.
  const result = checkPrediction('Mode: ACTIVE\nE-Stop: true', 'Mode: ACTIVE\nE-Stop: True');
  assert.equal(result.verdict, 'partial');
  assert.equal(result.matchedLines, 1);
  assert.deepEqual(result.missing, ['E-Stop: true']);
});

check('every line, in order, is a match', () => {
  const expected = 'Encoder Ticks: 425 | Battery: 12.15 V\nMode: ACTIVE';
  const result = checkPrediction('Encoder Ticks: 425 | Battery: 12.15 V\nMode: ACTIVE\n', expected);
  assert.equal(result.verdict, 'match');
  assert.equal(result.matchedLines, 2);
  assert.equal(result.predictedLines, 2);
  assert.equal(describeCheck(result), 'exact');
});

check('the right lines in the wrong order are distinct from a miss', () => {
  const result = checkPrediction('b\na', 'a\nb');
  assert.equal(result.verdict, 'reordered');
  assert.equal(result.matchedLines, 2);
  assert.equal(describeCheck(result), 'the right lines, in a different order');
});

check('a partly-right guess reports how much it got', () => {
  const result = checkPrediction('a\nnope', 'a\nb');
  assert.equal(result.verdict, 'partial');
  assert.equal(result.matchedLines, 1);
  assert.equal(describeCheck(result), '1 of 2 lines');
  assert.equal(checkPrediction('a', 'a\nb').predictedLines, 1);
  assert.equal(describeCheck(checkPrediction('a', 'a\nb')), '1 of 1 line');
});

check('an extra line is not a match, even when every expected line is present', () => {
  const result = checkPrediction('a\nb\nc', 'a\nb');
  assert.equal(result.verdict, 'partial', 'a guess with a line to spare is not the output');
  assert.equal(result.matchedLines, 2);
  assert.deepEqual(result.missing, ['c']);
});

check('nothing right is a miss, and an empty guess is never a match', () => {
  const miss = checkPrediction('completely different', 'a\nb');
  assert.equal(miss.verdict, 'miss');
  assert.equal(describeCheck(miss), '0 of 1 line');
  const empty = checkPrediction('   \n\n', 'a\nb');
  assert.equal(empty.verdict, 'miss');
  assert.equal(empty.predictedLines, 0);
  assert.equal(describeCheck(empty), 'nothing predicted');
});

check('a repeated line is matched once per occurrence, not by presence alone', () => {
  // The output prints `ok` twice; a guess that prints it three times has one line too many.
  const result = checkPrediction('ok\nok\nok', 'ok\nok');
  assert.equal(result.verdict, 'partial');
  assert.equal(result.matchedLines, 2);
  assert.deepEqual(result.missing, ['ok']);
});

check('a real lesson judged by its own expected output', () => {
  const lesson = PYTHON_LESSONS.find((entry) => entry.id === 'P.1');
  const right = checkPrediction(lesson.expectedOutput, lesson.expectedOutput);
  assert.equal(right.verdict, 'match', 'the expected output must predict itself');
  const starter = checkPrediction('Mode: STANDBY | E-Stop: False\nEncoder Ticks: 400 | Battery: 12.60 V', lesson.expectedOutput);
  assert.equal(starter.verdict, 'miss', 'the starter prints neither the new ticks nor the new battery');
  assert.equal(starter.matchedLines, 0);
  assert.equal(starter.predictedLines, 2, 'both of its lines were still a claim about the output');
});

check('the store keeps one record per lesson, and the newest wins', () => {
  clearAllPredictions();
  assert.equal(predictionFor('P.1'), null);
  savePrediction(RECORD({ verdict: 'miss', matchedLines: 0 }));
  savePrediction(RECORD({ verdict: 'match', text: 'second' }));
  assert.equal(readPredictions().length, 1, 'a revision replaces the earlier guess, it does not add one');
  const stored = predictionFor('P.1');
  assert.equal(stored.verdict, 'match');
  assert.equal(stored.text, 'second');
  savePrediction(RECORD({ lessonId: 'P.2', text: 'other' }));
  assert.equal(readPredictions().length, 2);
  assert.equal(predictionFor('P.2').lessonId, 'P.2');
});

check('a skip is stored as a skip, not as a prediction', () => {
  clearAllPredictions();
  savePrediction(RECORD({ text: '', verdict: 'miss', matchedLines: 0, predictedLines: 0, skipped: true }));
  const stored = predictionFor('P.1');
  assert.equal(stored.skipped, true);
  assert.equal(describeCheck(stored), 'nothing predicted');
});

check('a prediction is cut to its cap rather than refused', () => {
  clearAllPredictions();
  const stored = savePrediction(RECORD({ text: 'x'.repeat(MAX_PREDICTION_CHARS + 500) }));
  assert.equal(stored.text.length, MAX_PREDICTION_CHARS);
});

check('the store is bounded, oldest out first', () => {
  clearAllPredictions();
  for (let index = 0; index < MAX_PREDICTIONS + 3; index += 1) {
    savePrediction(RECORD({ lessonId: `lesson-${index}`, at: 1_700_000_000_000 + index }));
  }
  const records = readPredictions();
  assert.equal(records.length, MAX_PREDICTIONS);
  assert.equal(records[0].lessonId, 'lesson-3', 'the three oldest guesses are the ones evicted');
  assert.equal(predictionFor('lesson-0'), null);
});

check('Predict again clears one lesson and leaves the rest', () => {
  clearAllPredictions();
  savePrediction(RECORD({ lessonId: 'P.1' }));
  savePrediction(RECORD({ lessonId: 'P.2' }));
  clearPrediction('P.1');
  assert.equal(predictionFor('P.1'), null);
  assert.equal(predictionFor('P.2').lessonId, 'P.2');
});

check('an unreadable or foreign store reads as no predictions', () => {
  clearAllPredictions();
  localStorage.setItem(PREDICTIONS_KEY, '{not json');
  assert.deepEqual(readPredictions(), [], 'a corrupt file must not break the runner');
  localStorage.setItem(PREDICTIONS_KEY, JSON.stringify({ schema: 'someone-else/1', records: [RECORD()] }));
  assert.deepEqual(readPredictions(), [], 'another app\'s file is not this store');
  localStorage.setItem(
    PREDICTIONS_KEY,
    JSON.stringify({ schema: 'mechalab.predictions/1', records: [RECORD(), { lessonId: 'P.9' }, null] })
  );
  assert.equal(readPredictions().length, 1, 'a record missing its verdict is dropped, the good one stays');
});

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\ntest_predict_gate: all checks passed');
