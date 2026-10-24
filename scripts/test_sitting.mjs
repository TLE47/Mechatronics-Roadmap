#!/usr/bin/env node
/**
 * The sitting clock and focus mode, without a browser (`scripts/test_sitting.mjs`,
 * `npm run test:sitting`).
 *
 * The clock is the first number in this app that nobody can check against the screen, so the rules
 * that make it honest are pinned here rather than trusted: five minutes without a run or an answer is
 * a break, a sitting is never longer than three hours, a clock that went backwards starts a new
 * sitting instead of filing a negative one, the list holds one entry per sitting and drops the oldest,
 * and a store written by something else reads as the part of itself that parses.
 *
 * Focus mode is checked for the two things that can go wrong: a stored "on" that does not survive a
 * reload, and a store that cannot be written leaving the toggle dead instead of working for the visit.
 * The exit itself is the browser suite's job — `data-chrome` regions and the pill need a layout.
 *
 * Run: node --experimental-strip-types scripts/test_sitting.mjs
 */

import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  IDLE_GAP_MS,
  MAX_SITTINGS,
  MAX_SITTING_LESSONS,
  MAX_SITTING_MS,
  SITTING_RECORDED_EVENT,
  STORAGE_KEY_SITTINGS,
  closeSitting,
  currentSitting,
  formatDuration,
  nextSitting,
  parseSittings,
  readSittings,
  recordSittingEvent,
  sittingSummary,
  sittingTotals,
} from '../app/src/sittingClock.ts';
import {
  FOCUS_EVENT,
  STORAGE_KEY_FOCUS,
  focusLabel,
  readFocus,
  setFocus,
  toggleFocus,
} from '../app/src/focusMode.ts';
import { learningLogJson } from '../app/src/learningLog.ts';

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

/** A fresh browser: new storage with nothing in it. */
function freshBrowser() {
  const window = new Window({ url: 'https://example.test/' });
  globalThis.window = window;
  globalThis.document = window.document;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: window.localStorage,
  });
  return window;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = 1_700_000_000_000;

console.log('one sitting');

check('the first event opens a sitting at that instant', () => {
  const { sitting, closed } = nextSitting(null, { at: T0, kind: 'open', lesson: 'P.1' });
  assert.equal(closed, null);
  assert.deepEqual(sitting, { start: T0, end: T0, runs: 0, reviews: 0, lessons: ['P.1'] });
});

check('an event inside the gap extends the sitting, counting what happened', () => {
  const first = nextSitting(null, { at: T0, kind: 'open', lesson: 'P.1' }).sitting;
  const run = nextSitting(first, { at: T0 + 4 * MIN, kind: 'run', lesson: 'P.1' });
  assert.equal(run.closed, null, 'four minutes is still the same sitting');
  assert.equal(run.sitting.start, T0, 'the start does not move');
  assert.equal(run.sitting.end, T0 + 4 * MIN);
  assert.equal(run.sitting.runs, 1);

  const review = nextSitting(run.sitting, { at: T0 + 9 * MIN, kind: 'review', lesson: 'P.2' }).sitting;
  assert.equal(review.reviews, 1);
  assert.equal(review.runs, 1);
  assert.deepEqual(review.lessons, ['P.1', 'P.2']);
});

check('exactly the gap still counts as the same sitting; a minute more is a new one', () => {
  const first = nextSitting(null, { at: T0, kind: 'open' }).sitting;
  const atEdge = nextSitting(first, { at: T0 + IDLE_GAP_MS, kind: 'open' });
  assert.equal(atEdge.closed, null);
  assert.equal(atEdge.sitting.start, T0);

  const after = nextSitting(first, { at: T0 + IDLE_GAP_MS + MIN, kind: 'open' });
  assert.ok(after.closed, 'a break has to close the sitting');
  assert.equal(after.closed.start, T0);
  assert.equal(after.closed.end, T0, 'the closed sitting ends at its last activity, not at the break');
  assert.equal(after.sitting.start, T0 + IDLE_GAP_MS + MIN);
  assert.equal(after.sitting.runs, 0);
});

check('the cap closes a sitting that would run longer than three hours', () => {
  let sitting = nextSitting(null, { at: T0, kind: 'open', lesson: 'P.1' }).sitting;
  // Work in four-minute steps for four hours: no single gap is a break, the sitting is still too long.
  for (let at = T0 + 4 * MIN; at <= T0 + 4 * HOUR; at += 4 * MIN) {
    const step = nextSitting(sitting, { at, kind: 'run', lesson: 'P.1' });
    if (step.closed) {
      assert.equal(step.closed.end, T0 + MAX_SITTING_MS, 'the closed sitting is filed at the cap');
      assert.equal(step.sitting.start, at, 'and a fresh one begins with this event');
      return;
    }
    sitting = step.sitting;
  }
  assert.fail('four hours of four-minute steps never hit the cap');
});

check('a clock that went backwards starts a new sitting and files no negative time', () => {
  const first = nextSitting(null, { at: T0, kind: 'run' }).sitting;
  const back = nextSitting(first, { at: T0 - 10 * MIN, kind: 'run' });
  assert.equal(back.sitting.start, T0 - 10 * MIN);
  assert.equal(back.sitting.end, T0 - 10 * MIN, 'the new sitting never ends before it started');
  assert.equal(back.closed.end, T0);
});

check('lessons are deduped and capped at twelve', () => {
  let sitting = nextSitting(null, { at: T0, kind: 'open', lesson: 'P.1' }).sitting;
  for (let index = 0; index < MAX_SITTING_LESSONS + 4; index += 1) {
    sitting = nextSitting(sitting, { at: T0 + index * 1000, kind: 'open', lesson: `L.${index}` }).sitting;
  }
  sitting = nextSitting(sitting, { at: T0 + 20 * 1000, kind: 'open', lesson: 'L.15' }).sitting;
  assert.equal(sitting.lessons.length, MAX_SITTING_LESSONS);
  assert.equal(sitting.lessons[0], 'P.1', 'the lesson the sitting opened on is kept');
  assert.equal(sitting.lessons.includes('L.0'), true, 'an already-recorded lesson stays recorded');
  assert.equal(sitting.lessons.includes('L.15'), false, 'past the cap a new lesson is not recorded');
});

check('a sitting is never filed longer than the cap, whatever it holds', () => {
  const filed = closeSitting({ start: T0, end: T0 + 9 * HOUR, runs: 3, reviews: 0, lessons: [] });
  assert.equal(filed.end, T0 + MAX_SITTING_MS);
});

console.log('the store');

check('one event is one entry: extending replaces, breaking adds', () => {
  freshBrowser();
  recordSittingEvent({ at: T0, kind: 'open', lesson: 'P.1' });
  let list = recordSittingEvent({ at: T0 + MIN, kind: 'run', lesson: 'P.1' });
  assert.equal(list.length, 1, 'an extension must not append');
  assert.equal(list[0].runs, 1);

  list = recordSittingEvent({ at: T0 + IDLE_GAP_MS + 2 * MIN, kind: 'open', lesson: 'P.2' });
  assert.equal(list.length, 2);
  assert.equal(list[0].end, T0 + MIN, 'the filed sitting keeps the end it had');
  assert.equal(JSON.parse(globalThis.localStorage.getItem(STORAGE_KEY_SITTINGS)).length, 2);
});

check('the store keeps the newest sittings and drops the oldest', () => {
  freshBrowser();
  for (let index = 0; index < MAX_SITTINGS + 5; index += 1) {
    recordSittingEvent({ at: T0 + index * (IDLE_GAP_MS + MIN), kind: 'run', lesson: 'P.1' });
  }
  const list = readSittings();
  assert.equal(list.length, MAX_SITTINGS);
  assert.equal(list[0].start, T0 + 5 * (IDLE_GAP_MS + MIN), 'the five oldest went first');
});

check('a store written by another version reads as the part of itself that parses', () => {
  assert.deepEqual(parseSittings('{not json'), []);
  assert.deepEqual(parseSittings('null'), []);
  assert.deepEqual(parseSittings('{"start":1}'), []);
  assert.deepEqual(parseSittings(JSON.stringify([{ start: 5, end: 3 }])), [], 'an end before a start');
  const parsed = parseSittings(
    JSON.stringify([
      { start: 200, end: 260, runs: 2, reviews: 1, lessons: ['P.1', 7, ''] },
      { start: 100, end: 160, runs: -3, reviews: 'x' },
      { start: 50, end: 50 + 9 * HOUR, runs: 1 },
      'junk',
    ])
  );
  assert.deepEqual(parsed.map((sitting) => sitting.start), [50, 100, 200], 'sorted by start');
  assert.deepEqual(parsed[2].lessons, ['P.1']);
  assert.equal(parsed[1].runs, 0, 'a negative count is not a count');
  assert.equal(parsed[0].end, 50 + MAX_SITTING_MS, 'the cap applies on the way in, too');
});

check('the open sitting is the recent one, and nothing after a break', () => {
  const sitting = { start: T0, end: T0 + 10 * MIN, runs: 1, reviews: 0, lessons: [] };
  assert.equal(currentSitting([sitting], T0 + 12 * MIN)?.start, T0);
  assert.equal(currentSitting([sitting], T0 + 10 * MIN + IDLE_GAP_MS), sitting, 'the edge is still open');
  assert.equal(currentSitting([sitting], T0 + 10 * MIN + IDLE_GAP_MS + 1), null);
  assert.equal(currentSitting([], T0), null);
});

check('blocked or absent storage never throws into the render', () => {
  const window = new Window({ url: 'https://example.test/' });
  globalThis.window = window;
  globalThis.document = window.document;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('SecurityError: localStorage is disabled');
    },
  });
  assert.deepEqual(readSittings(), []);
  assert.doesNotThrow(() => recordSittingEvent({ at: T0, kind: 'run' }));

  delete globalThis.localStorage;
  assert.deepEqual(readSittings(), []);
  assert.doesNotThrow(() => recordSittingEvent({ at: T0, kind: 'run' }));
});

console.log('the numbers');

check('totals: count, sum, median (odd and even), longest and today', () => {
  const now = new Date(2026, 9, 21, 15, 0, 0).getTime();
  const today = (startHour, minutes) => ({
    start: new Date(2026, 9, 21, startHour, 0, 0).getTime(),
    end: new Date(2026, 9, 21, startHour, minutes, 0).getTime(),
    runs: 0,
    reviews: 0,
    lessons: [],
  });
  const yesterday = {
    start: new Date(2026, 9, 20, 23, 0, 0).getTime(),
    end: new Date(2026, 9, 20, 23, 50, 0).getTime(),
    runs: 0,
    reviews: 0,
    lessons: [],
  };
  const three = sittingTotals([today(9, 10), today(11, 40), yesterday], now);
  assert.equal(three.count, 3);
  assert.equal(three.totalMs, (10 + 40 + 50) * MIN);
  assert.equal(three.medianMs, 40 * MIN, 'the middle sitting, not the mean');
  assert.equal(three.longestMs, 50 * MIN);
  assert.equal(three.todayMs, 50 * MIN, 'only sittings that started today');
  assert.equal(three.todayCount, 2);

  const even = sittingTotals([today(9, 10), today(10, 30)], now);
  assert.equal(even.medianMs, 20 * MIN, 'an even count averages the middle pair');
  assert.deepEqual(sittingTotals([], now), {
    count: 0,
    totalMs: 0,
    medianMs: 0,
    longestMs: 0,
    todayMs: 0,
    todayCount: 0,
  });
});

check('a duration reads the way a person says it', () => {
  assert.equal(formatDuration(0), 'under a minute');
  assert.equal(formatDuration(59_999), 'under a minute');
  assert.equal(formatDuration(60_000), '1 min');
  assert.equal(formatDuration(23 * MIN), '23 min');
  assert.equal(formatDuration(59 * MIN), '59 min');
  assert.equal(formatDuration(HOUR), '1 h');
  assert.equal(formatDuration(90 * MIN), '1 h 30 min');
  assert.equal(formatDuration(Number.NaN), 'under a minute');
});

check('the summary names today and the median, and says nothing when there is nothing', () => {
  const now = new Date(2026, 9, 21, 15, 0, 0).getTime();
  assert.equal(sittingSummary([], now), 'No sittings recorded yet');
  const stale = [
    {
      start: new Date(2026, 9, 20, 9, 0, 0).getTime(),
      end: new Date(2026, 9, 20, 9, 20, 0).getTime(),
      runs: 1,
      reviews: 0,
      lessons: [],
    },
  ];
  assert.equal(sittingSummary(stale, now), 'Nothing today', 'one sitting has no median worth quoting');
  // A sitting that has just opened has no duration yet; it is work today, not an absence of work.
  const opening = {
    start: new Date(2026, 9, 21, 14, 55, 0).getTime(),
    end: new Date(2026, 9, 21, 14, 55, 0).getTime(),
    runs: 0,
    reviews: 0,
    lessons: ['P.1'],
  };
  assert.equal(
    sittingSummary([opening], now),
    'Today under a minute',
    'a fresh sitting must not read as nothing done'
  );
  const second = { ...opening, start: opening.start - 60 * MIN, end: opening.start - 40 * MIN };
  assert.equal(
    sittingSummary([second, opening], now),
    'Today 20 min · median sitting 10 min',
    'with two sittings the median earns its line'
  );
});

check('the exported log carries the sittings beside the events', () => {
  freshBrowser();
  recordSittingEvent({ at: T0, kind: 'open', lesson: 'P.1' });
  recordSittingEvent({ at: T0 + 2 * MIN, kind: 'run', lesson: 'P.1' });
  const exported = JSON.parse(learningLogJson());
  assert.equal(exported.schema, 'mechalab.learning-log/1');
  assert.ok(Array.isArray(exported.events), 'the events array stays what it was');
  assert.equal(exported.sittings.length, 1, 'the pilot needs the measured time in the same file');
  assert.equal(exported.sittings[0].runs, 1);
  assert.equal(exported.sittings[0].end - exported.sittings[0].start, 2 * MIN);
});

check('every write announces itself, after the store already holds it', () => {
  const window = freshBrowser();
  const heard = [];
  window.addEventListener(SITTING_RECORDED_EVENT, (event) => {
    // The listener stands in for the study panel: it re-reads, so it has to see the sitting this
    // event is about rather than the one before it.
    heard.push({ runs: event.detail.runs, stored: readSittings().at(-1)?.runs ?? -1 });
  });
  recordSittingEvent({ at: T0, kind: 'open', lesson: 'P.1' });
  recordSittingEvent({ at: T0 + 2 * MIN, kind: 'run', lesson: 'P.1' });
  recordSittingEvent({ at: T0 + 3 * MIN, kind: 'review', lesson: 'P.1' });
  assert.equal(
    heard.length,
    3,
    'one announcement per write: a run happens one component away from the panel that prints the clock'
  );
  assert.deepEqual(
    heard.map((entry) => entry.runs),
    [0, 1, 1],
    'the announcement carries the run count, so a reader that never re-read the store still moves'
  );
  assert.deepEqual(
    heard.map((entry) => entry.stored),
    [0, 1, 1],
    'the store is written before the screen is told: a listener that re-reads must not see the old value'
  );
});

console.log('focus mode');

check('focus starts off, survives a reload, and toggles back', () => {
  freshBrowser();
  assert.equal(readFocus(), false);
  assert.equal(setFocus(true), true);
  assert.equal(globalThis.localStorage.getItem(STORAGE_KEY_FOCUS), '1');
  assert.equal(readFocus(), true);
  assert.equal(toggleFocus(), false);
  assert.equal(readFocus(), false, 'the choice is remembered, not just rendered');
});

check('the toggle tells the page, once, with the state it applied', () => {
  const window = freshBrowser();
  const seen = [];
  window.addEventListener(FOCUS_EVENT, (event) => seen.push(event.detail.on));
  setFocus(true);
  setFocus(false);
  assert.deepEqual(seen, [true, false]);
});

check('a store that refuses the write still returns the state to render', () => {
  const window = freshBrowser();
  const real = window.localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => real.getItem(key),
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: (key) => real.removeItem(key),
    },
  });
  assert.equal(setFocus(true), true, 'the visit still gets focus mode');
  assert.equal(readFocus(), false, 'and the next visit does not');
  assert.doesNotThrow(() => toggleFocus());
});

check('the label says what the press does', () => {
  assert.match(focusLabel(false), /Focus mode/);
  assert.match(focusLabel(true), /Leave focus/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
