#!/usr/bin/env node
/**
 * The cross-lesson trail (`scripts/test_timeline.mjs`).
 *
 * `app/src/timeline.ts` folds the learning log and the sitting clock into days of work: the first
 * place in the app where two stores are read together rather than per lesson. Every rule in it is a
 * judgement about what a row *means*, so each one is pinned here rather than left to the browser:
 *
 *  - a day is the learner's local day, and its label is the word they would use;
 *  - an open that was followed by work is that work, not a second row;
 *  - a verification is the run that passed, not a second success;
 *  - a sitting's time lands on the day it started, and nowhere else;
 *  - the caps say what they left out instead of ending mid-list.
 *
 * Timestamps are built with `new Date(y, m, d, h, min)`, so the local getters inside the model return
 * exactly those parts in every timezone — the assertions name days and clock times, not offsets.
 *
 * Run: node --experimental-strip-types scripts/test_timeline.mjs (`npm run test:trail`)
 */

import assert from 'node:assert/strict';
import {
  MAX_DAYS,
  MAX_ENTRIES,
  OPEN_WINDOW_MS,
  VERIFY_WINDOW_MS,
  buildTrail,
  dayKey,
  dayLabel,
  entryLabel,
  hasWork,
  timeLabel,
  withoutContextRows,
} from '../app/src/timeline.ts';

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
const MINUTE = 60_000;
const event = (kind, lesson, t, extra = {}) => ({ t, kind, lesson, ...extra });
const sitting = (start, end, extra = {}) => ({ start, end, runs: 0, reviews: 0, lessons: [], ...extra });

const NOW = at(21, 18);

console.log('timeline: days');

check('a day is the learner’s local calendar day', () => {
  assert.equal(dayKey(at(21, 0, 5)), '2026-10-21');
  assert.equal(dayKey(at(21, 23, 59)), '2026-10-21', 'expected late evening to stay on its own day');
  assert.equal(dayKey(at(20, 23, 59)), '2026-10-20');
});

check('a stamp reads as a 24-hour local time', () => {
  assert.equal(timeLabel(at(21, 9, 4)), '09:04');
  assert.equal(timeLabel(at(21, 21, 30)), '21:30');
});

check('the day label is Today, Yesterday, then the weekday and date', () => {
  assert.equal(dayLabel(at(21, 9), NOW), 'Today');
  assert.equal(dayLabel(at(20, 9), NOW), 'Yesterday');
  assert.equal(dayLabel(at(18, 9), NOW), 'Sun 18 Oct', 'expected an older day to be named');
  assert.equal(dayLabel(at(30, 9), NOW), 'Fri 30 Oct', 'expected the month to be the event’s, not now’s');
});

check('today is today across a month boundary, not a difference in days', () => {
  const firstOfNext = new Date(2026, 10, 1, 10).getTime();
  const lastOfMonth = new Date(2026, 9, 31, 22).getTime();
  assert.equal(dayLabel(lastOfMonth, firstOfNext), 'Yesterday', 'expected the last of a month to be yesterday');
  assert.equal(dayLabel(firstOfNext, firstOfNext), 'Today');
});

console.log('\ntimeline: rows');

check('work is grouped by day, newest first', () => {
  const trail = buildTrail(
    [
      event('run', 'P.1', at(21, 9), { outcome: 'verified' }),
      event('lesson_open', 'P.2', at(20, 8)),
      event('run', 'P.1', at(21, 9, 30), { outcome: 'mismatch', fail: 'line 3' }),
    ],
    [sitting(at(21, 8, 50), at(21, 9, 40), { runs: 2, lessons: ['P.1'] })],
    { now: NOW }
  );
  assert.deepEqual(
    trail.days.map((day) => day.label),
    ['Today', 'Yesterday'],
    'expected the newest day first'
  );
  assert.deepEqual(
    trail.days[0].entries.map((entry) => entry.outcome),
    ['mismatch', 'verified'],
    'expected a day’s rows newest first, from an unsorted log'
  );
  assert.equal(trail.days[1].entries.length, 1);
  assert.equal(trail.days[1].entries[0].kind, 'open');
});

check('an open followed by work for the same lesson is that work, not its own row', () => {
  const trail = buildTrail(
    [
      event('lesson_open', 'P.1', at(21, 9)),
      event('run', 'P.1', at(21, 9, 5), { outcome: 'mismatch' }),
    ],
    [],
    { now: NOW }
  );
  assert.deepEqual(
    trail.days[0].entries.map((entry) => entry.kind),
    ['run'],
    'expected the open to be folded into the run that followed it'
  );
});

check('an open with nothing behind it is one row: the read', () => {
  const trail = buildTrail([event('lesson_open', 'P.4', at(21, 9))], [], { now: NOW });
  assert.equal(trail.days[0].entries.length, 1);
  assert.equal(entryLabel(trail.days[0].entries[0]), 'opened');
});

check('an open only folds into work inside the window, not after a break', () => {
  const inside = at(21, 9) + OPEN_WINDOW_MS;
  const outside = inside + 1;
  const folded = buildTrail(
    [event('lesson_open', 'P.1', at(21, 9)), event('run', 'P.1', inside, { outcome: 'passed' })],
    [],
    { now: NOW }
  );
  const kept = buildTrail(
    [event('lesson_open', 'P.1', at(21, 9)), event('run', 'P.1', outside, { outcome: 'passed' })],
    [],
    { now: NOW }
  );
  assert.equal(folded.days[0].entries.length, 1, 'expected an open at the edge of the window to fold');
  assert.equal(kept.days[0].entries.length, 2, 'expected a return visit an hour later to be its own open');
});

check('an open folds only into its own lesson', () => {
  const trail = buildTrail(
    [
      event('lesson_open', 'P.1', at(21, 9)),
      event('run', 'P.2', at(21, 9, 2), { outcome: 'passed' }),
    ],
    [],
    { now: NOW }
  );
  const kinds = trail.days[0].entries.map((entry) => `${entry.kind}:${entry.lesson}`);
  assert.deepEqual(kinds, ['run:P.2', 'open:P.1'], 'expected another lesson’s run to leave the open alone');
});

check('a double mount is one open, not two', () => {
  const trail = buildTrail(
    [event('lesson_open', 'P.1', at(21, 9)), event('lesson_open', 'P.1', at(21, 9, 1))],
    [],
    { now: NOW }
  );
  assert.equal(trail.days[0].entries.length, 1, 'expected the earlier of two opens to fold');
  assert.equal(trail.days[0].entries[0].at, at(21, 9, 1), 'expected the surviving open to be the later one');
});

check('a verification is the run that passed, not a second success', () => {
  const trail = buildTrail(
    [
      event('run', 'P.1', at(21, 9), { outcome: 'passed' }),
      event('verified', 'P.1', at(21, 9) + 800),
    ],
    [],
    { now: NOW }
  );
  assert.deepEqual(
    trail.days[0].entries.map((entry) => entry.kind),
    ['run'],
    'expected the verification row to fold into the passing run'
  );
  assert.equal(trail.totals.verified, 0, 'expected no separate verified count when it folded');
});

check('a verification with no passing run behind it keeps its own row', () => {
  const trail = buildTrail([event('verified', 'P.1', at(21, 9))], [], { now: NOW });
  assert.equal(trail.days[0].entries.length, 1);
  assert.equal(entryLabel(trail.days[0].entries[0]), 'verified');
  assert.equal(trail.totals.verified, 1);
});

check('a verification long after a passing run is not that run', () => {
  const late = at(21, 9) + VERIFY_WINDOW_MS + 1;
  const trail = buildTrail(
    [event('run', 'P.1', at(21, 9), { outcome: 'passed' }), event('verified', 'P.1', late)],
    [],
    { now: NOW }
  );
  assert.equal(trail.days[0].entries.length, 2, 'expected a verification outside the window to stand alone');
});

check('a row says what happened in words, and a failure keeps its verdict', () => {
  const trail = buildTrail(
    [
      event('run', 'P.1', at(21, 9), { outcome: 'behavior_failed' }),
      event('run', 'P.1', at(21, 9, 10), { outcome: 'mismatch' }),
      event('run', 'P.1', at(21, 9, 20), { outcome: 'harness_failed' }),
      event('run', 'P.1', at(21, 9, 30), { outcome: 'error' }),
      event('run', 'P.1', at(21, 9, 40), { outcome: 'stopped' }),
      event('run', 'P.1', at(21, 9, 50), { outcome: 'passed' }),
      event('hint', 'P.1', at(21, 10), { level: 2 }),
      event('solution_open', 'P.1', at(21, 10, 5)),
      event('export', undefined, at(21, 10, 10)),
    ],
    [],
    { now: NOW }
  );
  const words = trail.days[0].entries.map(entryLabel);
  assert.deepEqual(words, [
    'exported the portfolio',
    'opened the solution',
    'read hint 2',
    'run · passed',
    'run · stopped',
    'run · error',
    'run · bench missed',
    'run · output differed',
    'run · checks failed',
  ]);
});

check('a failure line rides along so the row can be read without the runner', () => {
  const trail = buildTrail(
    [event('run', 'P.1', at(21, 9), { outcome: 'error', fail: 'ZeroDivisionError: division by zero' })],
    [],
    { now: NOW }
  );
  assert.equal(trail.days[0].entries[0].fail, 'ZeroDivisionError: division by zero');
});

console.log('\ntimeline: sittings');

check('a sitting adds measured time to the day it started', () => {
  const trail = buildTrail(
    [
      event('lesson_open', 'P.1', at(20, 23, 50)),
      event('lesson_open', 'P.2', at(21, 0, 20)),
      event('run', 'P.2', at(21, 0, 25), { outcome: 'mismatch' }),
    ],
    [sitting(at(20, 23, 50), at(21, 0, 25), { runs: 1, lessons: ['P.1', 'P.2'] })],
    { now: NOW }
  );
  const [today, yesterday] = trail.days;
  assert.equal(yesterday.label, 'Yesterday', 'expected the sitting to be filed on its start day');
  assert.equal(yesterday.measuredMs, 35 * MINUTE);
  assert.equal(yesterday.sittings, 1);
  assert.equal(today.measuredMs, 0, 'expected the day it ran into to carry no time');
  assert.equal(trail.totals.measuredMs, 35 * MINUTE, 'expected the total not to double-count the crossing');
});

check('sittings on one day add up, and their runs and reviews come with them', () => {
  const trail = buildTrail(
    [event('run', 'P.1', at(21, 9), { outcome: 'passed' })],
    [
      sitting(at(21, 8), at(21, 9), { runs: 1 }),
      sitting(at(21, 10), at(21, 10, 20), { reviews: 6 }),
    ],
    { now: NOW }
  );
  assert.equal(trail.days[0].sittings, 2);
  assert.equal(trail.days[0].measuredMs, 80 * MINUTE);
  assert.equal(trail.days[0].runs, 1);
  assert.equal(trail.days[0].reviews, 6);
});

check('a sitting with no events that day makes no day', () => {
  const trail = buildTrail([], [sitting(at(21, 8), at(21, 9))], { now: NOW });
  assert.deepEqual(trail.days, [], 'expected time without work not to invent a day');
  assert.equal(trail.totals.measuredMs, 0);
});

check('a backwards sitting is not negative time', () => {
  const trail = buildTrail([event('run', 'P.1', at(21, 9), { outcome: 'passed' })], [sitting(at(21, 9), at(21, 8))], {
    now: NOW,
  });
  assert.equal(trail.days[0].measuredMs, 0);
});

console.log('\ntimeline: caps and totals');

check('the newest days are the ones kept, and the rest are counted', () => {
  const days = [];
  for (let index = 0; index < MAX_DAYS + 3; index += 1) {
    const stamp = new Date(2026, 9, 21 - index, 9).getTime();
    days.push(event('run', 'P.1', stamp, { outcome: 'passed' }));
  }
  const trail = buildTrail(days, [], { now: NOW });
  assert.equal(trail.days.length, MAX_DAYS);
  assert.equal(trail.days[0].label, 'Today');
  assert.equal(trail.omitted.days, 3, 'expected the days past the cap to be reported');
  assert.equal(trail.totals.days, MAX_DAYS);
});

check('a day over the row cap says how many it left out', () => {
  const rows = Array.from({ length: 5 }, (_, index) =>
    event('run', 'P.1', at(21, 9) + index * MINUTE, { outcome: 'passed' })
  );
  const trail = buildTrail(rows, [], { now: NOW, maxEntriesPerDay: 3 });
  assert.equal(trail.days[0].entries.length, 3, 'expected the newest three rows');
  assert.equal(trail.days[0].omitted, 2);
  assert.equal(trail.omitted.entries, 2);
  assert.equal(trail.days[0].entries[0].at, at(21, 9) + 4 * MINUTE, 'expected the newest row to survive the cap');
});

check('the total budget is one budget, not one per day', () => {
  const rows = [];
  for (let day = 21; day > 21 - 5; day -= 1) {
    for (let minute = 0; minute < 4; minute += 1) {
      rows.push(event('run', 'P.1', new Date(2026, 9, day, 9, minute).getTime(), { outcome: 'passed' }));
    }
  }
  const trail = buildTrail(rows, [], { now: NOW, maxEntries: 5 });
  assert.equal(trail.totals.entries, 5, 'expected the budget to be spent across days in order');
  assert.equal(trail.days[0].entries.length, 4, 'expected the newest day to be filled first');
  assert.equal(trail.days[1].entries.length, 1);
  assert.equal(trail.days[2].entries.length, 0, 'expected the budget to stop the older days, not shrink the cap');
  assert.equal(trail.omitted.entries, 15);
});

check('totals describe what is on screen', () => {
  const trail = buildTrail(
    [
      event('run', 'P.1', at(21, 9), { outcome: 'passed' }),
      event('verified', 'P.1', at(20, 9), {}),
      event('run', 'P.2', at(20, 8), { outcome: 'mismatch' }),
    ],
    [sitting(at(21, 8, 30), at(21, 9, 30), { runs: 2, reviews: 3 })],
    { now: NOW }
  );
  assert.deepEqual(trail.totals, {
    days: 2,
    entries: 3,
    measuredMs: 60 * MINUTE,
    runs: 2,
    reviews: 3,
    verified: 1,
  });
});

check('nothing recorded is an empty trail, not an error', () => {
  const trail = buildTrail([], [], { now: NOW });
  assert.deepEqual(trail.days, []);
  assert.equal(trail.totals.entries, 0);
  assert.equal(trail.omitted.entries, 0);
  assert.equal(hasWork(trail), false);
});

// The app opens on the runner, so the very first render of a brand-new profile logs one open. That
// open is the app loading, not a sitting, and the card must not greet a beginner with it.
check('an open on its own is not work, but a day with a run is', () => {
  const opened = buildTrail([event('lesson_open', 'P.1', at(21, 9))], [], { now: NOW });
  assert.equal(hasWork(opened), false, 'expected a lone open not to summon the trail card');

  const ran = buildTrail(
    [event('lesson_open', 'P.1', at(21, 9)), event('run', 'P.1', at(21, 9, 5), { outcome: 'mismatch' })],
    [],
    { now: NOW }
  );
  assert.equal(hasWork(ran), true);
  assert.equal(ran.days[0].entries.length, 1, 'expected the open to fold into the run it started');
});

check('an unreadable timestamp is dropped and an unknown kind is still a row', () => {
  const events = [
    { kind: 'run', lesson: 'P.1' },
    { t: Number.NaN, kind: 'run', lesson: 'P.1' },
    { t: '1650000000000', kind: 'run', lesson: 'P.1' },
    { t: at(21, 9), kind: 'renamed_forever', lesson: 'P.1' },
  ];
  const trail = buildTrail(events, [], { now: NOW });
  assert.equal(trail.days[0].entries.length, 1, 'expected only the readable timestamp to survive');
  assert.equal(entryLabel(trail.days[0].entries[0]), 'renamed_forever', 'expected an unknown kind to print itself');
});

// The fold is exported on its own because the card's tooltip wants to count what it removed; pin it
// directly so a regression in the two windows is not only visible through `buildTrail`.
check('the fold is a function of the rows, in time order', () => {
  const entries = [
    { at: at(21, 9), kind: 'hint', lesson: 'P.1', level: 1 },
    { at: at(21, 9, 1), kind: 'run', lesson: 'P.1', outcome: 'mismatch' },
  ];
  assert.equal(withoutContextRows(entries).length, 2, 'expected a hint to be its own row');
  assert.equal(MAX_ENTRIES > MAX_DAYS, true, 'expected the budget to allow more than one row a day');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
