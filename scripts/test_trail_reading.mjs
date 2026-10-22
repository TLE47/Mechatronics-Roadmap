#!/usr/bin/env node
/**
 * The trail's readings (`scripts/test_trail_reading.mjs`, `npm run test:trailreading`).
 *
 * `app/src/trailReading.ts` turns the trail into at most three observations. Each one is a judgement
 * about when the data is worth a sentence, so every floor is pinned here rather than left to the card:
 *
 *  - a lesson is "resisting" at three failed runs, not at one, and a lesson that then passed is told
 *    that way;
 *  - the deck is quiet only after three whole local days without a review;
 *  - opens alone are a pattern at two days, not at one;
 *  - the readings are ordered the way they matter, and capped;
 *  - nothing is claimed about work the trail's caps left out, because the readings only see the days
 *    the card draws.
 *
 * Timestamps come from `buildTrail` itself rather than being hand-built, so these assertions describe
 * the same pipeline the app runs: log + sittings in, readings out.
 *
 * Run: node --experimental-strip-types scripts/test_trail_reading.mjs
 */

import assert from 'node:assert/strict';
import { buildTrail } from '../app/src/timeline.ts';
import {
  MAX_READINGS,
  MIN_OPEN_DAYS,
  MIN_RUNS_FOR_ATTEMPT_READING,
  REVIEW_QUIET_DAYS,
  readTrail,
} from '../app/src/trailReading.ts';

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

/** A local timestamp: the parts are what the model reads back, whatever the machine's timezone. */
const at = (day, hour, minute = 0) => new Date(2026, 9, day, hour, minute, 0, 0).getTime();
const event = (kind, lesson, t, extra = {}) => ({ t, kind, lesson, ...extra });
const sitting = (start, end, extra = {}) => ({ start, end, runs: 0, reviews: 0, lessons: [], ...extra });

const NOW = at(21, 18);

/** Readings as of NOW, from a log and a sitting list. */
const read = (events = [], sittings = []) =>
  readTrail(buildTrail(events, sittings, { now: NOW }), { now: NOW });

/** N failing runs of one lesson, one per minute from a start time. */
function failingRuns(lesson, count, start = at(21, 9)) {
  return Array.from({ length: count }, (_, index) =>
    event('run', lesson, start + index * 60_000, { outcome: 'mismatch' })
  );
}

console.log('trail readings: a lesson that resisted');

check(`fewer than ${MIN_RUNS_FOR_ATTEMPT_READING} failed runs says nothing`, () => {
  const readings = read(failingRuns('05.1', MIN_RUNS_FOR_ATTEMPT_READING - 1));
  assert.deepEqual(readings.filter((reading) => reading.kind === 'many-runs'), []);
});

check('three failed runs, never passed, are named as not passed yet', () => {
  const readings = read(failingRuns('05.1', 3));
  const reading = readings.find((entry) => entry.kind === 'many-runs');
  assert.ok(reading, 'expected a many-runs reading');
  assert.equal(reading.lesson, '05.1');
  assert.equal(reading.runs, 3);
  assert.match(reading.text, /05\.1: 3 failed runs and not passed yet\./);
});

check('a pass afterwards is the same count in the past tense', () => {
  const readings = read([
    ...failingRuns('05.1', 3),
    event('run', '05.1', at(21, 10), { outcome: 'passed' }),
    event('verified', '05.1', at(21, 10) + 900),
  ]);
  const reading = readings.find((entry) => entry.kind === 'many-runs');
  assert.ok(reading, 'expected a many-runs reading');
  assert.equal(reading.runs, 3);
  assert.match(reading.text, /3 failed runs before it passed/);
});

check('a verification without a passing run still counts as the pass', () => {
  const readings = read([...failingRuns('02.1', 4), event('verified', '02.1', at(21, 11))]);
  const reading = readings.find((entry) => entry.kind === 'many-runs');
  assert.match(reading?.text ?? '', /before it passed/);
});

check('the lesson with the most failed runs wins, not the first one seen', () => {
  const readings = read([...failingRuns('01.1', 3), ...failingRuns('07.1', 5, at(20, 9))]);
  assert.equal(readings.find((entry) => entry.kind === 'many-runs')?.lesson, '07.1');
});

check('a tie goes to the lesson still asking for something', () => {
  const readings = read([
    ...failingRuns('01.1', 3, at(20, 9)),
    ...failingRuns('07.1', 3, at(21, 9)),
    event('run', '01.1', at(20, 10), { outcome: 'passed' }),
  ]);
  assert.equal(readings.find((entry) => entry.kind === 'many-runs')?.lesson, '07.1');
});

console.log('trail readings: the deck going quiet');

check('no reviews at all says nothing about reviews', () => {
  const readings = read(failingRuns('05.1', 1));
  assert.deepEqual(readings.filter((entry) => entry.kind === 'no-review'), []);
});

check('a review on the most recent day is quiet-free', () => {
  const readings = read(
    [event('run', '05.1', at(21, 9), { outcome: 'passed' })],
    [sitting(at(21, 9), at(21, 9) + 600_000, { reviews: 4 })]
  );
  assert.deepEqual(readings.filter((entry) => entry.kind === 'no-review'), []);
});

check(`exactly ${REVIEW_QUIET_DAYS} days without a review is a reading, with the day it stopped`, () => {
  const readings = read(
    [
      event('run', '05.1', at(18, 9), { outcome: 'passed' }),
      event('run', '05.1', at(21, 9), { outcome: 'passed' }),
    ],
    [sitting(at(18, 9), at(18, 9) + 600_000, { reviews: 2 })]
  );
  const reading = readings.find((entry) => entry.kind === 'no-review');
  assert.ok(reading, 'expected a no-review reading');
  assert.equal(reading.sinceDays, 3);
  assert.match(reading.text, /No card review since Sun 18 Oct\./);
});

check('a review two days ago is not yet quiet', () => {
  const readings = read(
    [event('run', '05.1', at(19, 9), { outcome: 'passed' })],
    [sitting(at(19, 9), at(19, 9) + 600_000, { reviews: 1 })]
  );
  assert.deepEqual(readings.filter((entry) => entry.kind === 'no-review'), []);
});

check('the most recent review day is the one named, not the first', () => {
  const readings = read(
    [
      event('run', '05.1', at(17, 9), { outcome: 'passed' }),
      event('run', '05.1', at(18, 9), { outcome: 'passed' }),
    ],
    [
      sitting(at(17, 9), at(17, 9) + 600_000, { reviews: 3 }),
      sitting(at(18, 9), at(18, 9) + 600_000, { reviews: 1 }),
    ]
  );
  const reading = readings.find((entry) => entry.kind === 'no-review');
  assert.equal(reading?.sinceDays, 3);
  assert.match(reading?.text ?? '', /Sun 18 Oct/);
});

console.log('trail readings: days that were only opens');

check(`one open-only day is under the floor of ${MIN_OPEN_DAYS}`, () => {
  const readings = read([event('run', '05.1', at(21, 9), { outcome: 'passed' }), event('lesson_open', '02.1', at(20, 9))]);
  assert.deepEqual(readings.filter((entry) => entry.kind === 'opens-alone'), []);
});

check('two open-only days are named, with the day count they came from', () => {
  // The opens are far apart so none of them folds into the work on the 21st.
  const readings = read([
    event('lesson_open', '02.1', at(19, 9)),
    event('lesson_open', '03.1', at(20, 9)),
    event('run', '05.1', at(21, 9), { outcome: 'passed' }),
  ]);
  const reading = readings.find((entry) => entry.kind === 'opens-alone');
  assert.ok(reading, 'expected an opens-alone reading');
  assert.equal(reading.days, 2);
  assert.match(reading.text, /^2 of these 3 days are opens with nothing after them\.$/);
});

check('an open followed by work on the same day is not an open-only day', () => {
  const readings = read([
    event('lesson_open', '02.1', at(19, 9)),
    event('run', '02.1', at(19, 9) + 5 * 60_000, { outcome: 'mismatch' }),
    event('run', '02.1', at(19, 9) + 6 * 60_000, { outcome: 'mismatch' }),
    event('run', '02.1', at(19, 9) + 7 * 60_000, { outcome: 'passed' }),
  ]);
  assert.deepEqual(readings.filter((entry) => entry.kind === 'opens-alone'), []);
});

console.log('trail readings: order, cap, and an empty trail');

check('an empty trail has nothing to say', () => {
  assert.deepEqual(read(), []);
});

check('a single passing run has nothing to say', () => {
  assert.deepEqual(read([event('run', '05.1', at(21, 9), { outcome: 'passed' })]), []);
});

check('readings arrive most actionable first', () => {
  const readings = read(
    [
      event('lesson_open', '02.1', at(18, 9)),
      event('lesson_open', '03.1', at(19, 9)),
      event('run', '05.1', at(15, 9), { outcome: 'passed' }),
      ...failingRuns('05.1', 3),
    ],
    [sitting(at(15, 9), at(15, 9) + 600_000, { reviews: 2 })]
  );
  assert.deepEqual(
    readings.map((entry) => entry.kind),
    ['many-runs', 'no-review', 'opens-alone']
  );
});

check(`at most ${MAX_READINGS} readings are returned`, () => {
  const readings = read(
    [
      event('lesson_open', '02.1', at(18, 9)),
      event('lesson_open', '03.1', at(19, 9)),
      event('run', '05.1', at(15, 9), { outcome: 'passed' }),
      ...failingRuns('05.1', 3),
    ],
    [sitting(at(15, 9), at(15, 9) + 600_000, { reviews: 2 })]
  );
  assert.ok(readings.length <= MAX_READINGS, `got ${readings.length}`);
});

check('a caller can ask for fewer, or for none', () => {
  const trail = buildTrail(
    [event('lesson_open', '02.1', at(18, 9)), ...failingRuns('05.1', 3)],
    [],
    { now: NOW }
  );
  assert.equal(readTrail(trail, { now: NOW, max: 1 }).length, 1);
  assert.deepEqual(readTrail(trail, { now: NOW, max: 0 }), []);
});

check('a lesson id is only attached where there is one to open', () => {
  const readings = read([
    event('lesson_open', '02.1', at(18, 9)),
    event('lesson_open', '03.1', at(19, 9)),
    ...failingRuns('05.1', 3),
  ]);
  const byKind = Object.fromEntries(readings.map((entry) => [entry.kind, entry]));
  assert.equal(byKind['many-runs'].lesson, '05.1');
  assert.equal(byKind['opens-alone'].lesson, undefined);
});

console.log(
  failed ? `\n[FAIL] ${failed} of ${passed + failed} readings checks failed` : `[PASS] Trail readings: ${passed} checks`
);
process.exitCode = failed ? 1 : 0;
