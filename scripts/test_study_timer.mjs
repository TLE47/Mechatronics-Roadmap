#!/usr/bin/env node
/**
 * The study clock's arithmetic, without a browser or a timer (`npm run test:studyclock`).
 *
 * The clock fails in the quiet direction: a reload that forgets the half hour, an absence that gets
 * paid, a pause that keeps counting. None of those throw, so each is pinned here — plus the reason
 * the clock exists at all, that a `study` heartbeat extends a sitting without pretending a run
 * happened.
 */

import assert from 'node:assert/strict';
import {
  IDLE_TIMER,
  TIMER_STORAGE_KEY,
  clearTimer,
  clearedTimer,
  elapsedMs,
  formatClock,
  heartbeat,
  parseTimer,
  pauseTimer,
  readTimer,
  resumeTimer,
  startTimer,
  writeTimer,
} from '../app/src/studyTimer.ts';
import { MAX_SITTING_MS, closeSitting, nextSitting } from '../app/src/sittingClock.ts';

let passed = 0;
let failed = 0;

function section(title) {
  console.log(`\n${title}`);
}

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

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    data,
  };
}

const T0 = 1_700_000_000_000;
const MIN = 60_000;

section('the reading');

check('the clock prints h:mm:ss, unpadded hours and padded rest', () => {
  assert.equal(formatClock(0), '0:00:00');
  assert.equal(formatClock(9_000), '0:00:09');
  assert.equal(formatClock(61_000), '0:01:01');
  assert.equal(formatClock(3_725_000), '1:02:05');
  assert.equal(formatClock(11 * 3600_000), '11:00:00');
});

check('a nonsense reading is zero, never negative or NaN', () => {
  assert.equal(formatClock(-5), '0:00:00');
  assert.equal(formatClock(Number.NaN), '0:00:00');
  assert.equal(formatClock(Infinity), '0:00:00');
  assert.equal(elapsedMs({ ...IDLE_TIMER, bankedMs: -100 }, T0), 0);
  assert.equal(elapsedMs({ ...IDLE_TIMER, bankedMs: Number.NaN }, T0), 0);
});

check('a running stretch counts from its own start', () => {
  const running = { bankedMs: 5 * MIN, runningSince: T0, lastTick: T0, lesson: 'P.1' };
  assert.equal(elapsedMs(running, T0 + 2 * MIN), 7 * MIN);
  // A clock that was corrected backwards cannot subtract from the bank.
  assert.equal(elapsedMs(running, T0 - 5 * MIN), 5 * MIN);
});

section('start, pause, resume');

check('Start banks what was there and opens a stretch', () => {
  const paused = { bankedMs: 5 * MIN, runningSince: null, lastTick: T0, lesson: 'P.1' };
  const started = startTimer(paused, T0 + MIN, 'P.2');
  assert.equal(started.bankedMs, 5 * MIN);
  assert.equal(started.runningSince, T0 + MIN);
  assert.equal(started.lastTick, T0 + MIN);
  assert.equal(started.lesson, 'P.2');
});

check('a start with no lesson keeps the one the clock had', () => {
  const started = startTimer({ ...IDLE_TIMER, lesson: 'P.1' }, T0, '');
  assert.equal(started.lesson, 'P.1');
});

check('Pause keeps the time and stops it moving', () => {
  const running = startTimer(IDLE_TIMER, T0, 'P.1');
  const paused = pauseTimer(running, T0 + 4 * MIN);
  assert.equal(paused.runningSince, null);
  assert.equal(elapsedMs(paused, T0 + 4 * MIN), 4 * MIN);
  // Ten minutes later the paused clock has not gained a second.
  assert.equal(elapsedMs(paused, T0 + 14 * MIN), 4 * MIN);
  // Pausing twice is not a way to double the bank.
  assert.equal(elapsedMs(pauseTimer(paused, T0 + 20 * MIN), T0 + 20 * MIN), 4 * MIN);
});

check('two stretches add up to their own total, not to the wall clock', () => {
  const first = pauseTimer(startTimer(IDLE_TIMER, T0, 'P.1'), T0 + 3 * MIN);
  const second = pauseTimer(startTimer(first, T0 + 10 * MIN, 'P.1'), T0 + 12 * MIN);
  assert.equal(elapsedMs(second, T0 + 60 * MIN), 5 * MIN);
});

check('a heartbeat moves only the trust, never the reading', () => {
  const running = startTimer(IDLE_TIMER, T0, 'P.1');
  const signed = heartbeat(running, T0 + MIN);
  assert.equal(signed.lastTick, T0 + MIN);
  assert.equal(signed.runningSince, T0);
  assert.equal(elapsedMs(signed, T0 + MIN), MIN);
  // A paused clock has no heartbeat to write.
  const paused = pauseTimer(signed, T0 + MIN);
  assert.deepEqual(heartbeat(paused, T0 + 5 * MIN), paused);
});

check('Log & reset zeroes the clock and forgets nothing else', () => {
  const cleared = clearedTimer('P.1');
  assert.equal(elapsedMs(cleared, T0 + 99 * MIN), 0);
  assert.equal(cleared.runningSince, null);
  assert.equal(cleared.lesson, 'P.1');
});

section('a store from another visit');

check('a fresh heartbeat is resumed, so a reload keeps the stretch', () => {
  const running = { bankedMs: 0, runningSince: T0, lastTick: T0 + 10 * MIN, lesson: 'P.1' };
  const resumed = resumeTimer(running, T0 + 12 * MIN);
  assert.equal(resumed.runningSince, T0);
  assert.equal(elapsedMs(resumed, T0 + 12 * MIN), 12 * MIN);
  // A clock that already banked an earlier stretch keeps it: the reading is the sum, not the stretch.
  const banked = { bankedMs: 10 * MIN, runningSince: T0, lastTick: T0 + 2 * MIN, lesson: 'P.1' };
  assert.equal(elapsedMs(resumeTimer(banked, T0 + 2 * MIN), T0 + 2 * MIN), 12 * MIN);
});

check('a page that was away is paused at its last heartbeat, not paid for the absence', () => {
  // Left running at 10 min, heartbeat at 10 min, reopened two hours later.
  const running = { bankedMs: 0, runningSince: T0, lastTick: T0 + 10 * MIN, lesson: 'P.1' };
  const resumed = resumeTimer(running, T0 + 120 * MIN);
  assert.equal(resumed.runningSince, null);
  assert.equal(elapsedMs(resumed, T0 + 120 * MIN), 10 * MIN);
  assert.equal(elapsedMs(resumed, T0 + 121 * MIN), 10 * MIN);
});

check('a stored clock with no heartbeat is trusted only to its start', () => {
  const running = { bankedMs: 0, runningSince: T0, lastTick: 0, lesson: 'P.1' };
  const resumed = resumeTimer(running, T0 + 10 * MIN);
  assert.equal(resumed.runningSince, null);
  assert.equal(elapsedMs(resumed, T0 + 10 * MIN), 0);
});

check('a paused store is left exactly as stored', () => {
  const paused = { bankedMs: 7 * MIN, runningSince: null, lastTick: T0, lesson: 'P.1' };
  assert.deepEqual(resumeTimer(paused, T0 + 500 * MIN), paused);
});

check('junk in the store reads as the fields that do parse', () => {
  assert.deepEqual(parseTimer(null), IDLE_TIMER);
  assert.deepEqual(parseTimer('not json'), IDLE_TIMER);
  assert.deepEqual(parseTimer('[1,2,3]'), IDLE_TIMER);
  const half = parseTimer(JSON.stringify({ bankedMs: '5000', runningSince: 'bad', lesson: 7 }));
  assert.equal(half.bankedMs, 5000);
  assert.equal(half.runningSince, null);
  assert.equal(half.lesson, '');
  // A heartbeat before the stretch began would let the absence rule pay for time that never ran.
  const backwards = parseTimer(JSON.stringify({ runningSince: T0, lastTick: T0 - MIN }));
  assert.equal(backwards.lastTick, T0);
});

check('the store round-trips, and a cleared clock removes the key', () => {
  const store = fakeStorage();
  const running = { bankedMs: 2 * MIN, runningSince: T0, lastTick: T0 + MIN, lesson: 'P.1' };
  writeTimer(running, store);
  assert.deepEqual(readTimer(store), running);
  assert.ok(store.data.has(TIMER_STORAGE_KEY));
  writeTimer(clearedTimer('P.1'), store);
  assert.equal(store.data.has(TIMER_STORAGE_KEY), false);
  assert.deepEqual(readTimer(store), IDLE_TIMER);
  clearTimer(store);
  assert.equal(store.data.has(TIMER_STORAGE_KEY), false);
});

check('blocked storage costs the write, never the render', () => {
  const angry = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
    removeItem: () => {
      throw new Error('blocked');
    },
  };
  assert.doesNotThrow(() => readTimer(angry));
  assert.doesNotThrow(() => writeTimer({ ...IDLE_TIMER, bankedMs: MIN }, angry));
  assert.doesNotThrow(() => clearTimer(angry));
  assert.deepEqual(readTimer(null), IDLE_TIMER);
});

section('what a logged stretch does to the sitting');

check('a study heartbeat extends the sitting without inventing a run or a review', () => {
  const opened = nextSitting(null, { at: T0, kind: 'study', lesson: 'P.1' }).sitting;
  const later = nextSitting(opened, { at: T0 + 30 * MIN, kind: 'study', lesson: 'P.1' }).sitting;
  assert.equal(later.end, T0 + 30 * MIN);
  assert.equal(later.runs, 0);
  assert.equal(later.reviews, 0);
  assert.deepEqual(later.lessons, ['P.1']);
});

check('half-hour heartbeats grow one sitting all the way to the cap', () => {
  let sitting = nextSitting(null, { at: T0, kind: 'study' }).sitting;
  for (let at = T0 + 30 * MIN; at <= T0 + MAX_SITTING_MS; at += 30 * MIN) {
    sitting = nextSitting(sitting, { at, kind: 'study' }).sitting;
  }
  assert.equal(sitting.end, T0 + MAX_SITTING_MS);
  // One past the cap closes this sitting at the cap and opens the next.
  const after = nextSitting(sitting, { at: T0 + MAX_SITTING_MS + 30 * MIN, kind: 'study' });
  assert.equal(after.closed?.end, T0 + MAX_SITTING_MS);
  assert.equal(after.sitting.start, T0 + MAX_SITTING_MS + 30 * MIN);
});

check('a filed sitting is never longer than the cap', () => {
  const capped = closeSitting({
    start: T0,
    end: T0 + MAX_SITTING_MS + MIN,
    runs: 0,
    reviews: 0,
    lessons: [],
  });
  assert.equal(capped.end, T0 + MAX_SITTING_MS);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
