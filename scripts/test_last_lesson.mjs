#!/usr/bin/env node
/**
 * The workbench reopens the lesson the learner was on (`scripts/test_last_lesson.mjs`).
 *
 * `app/src/lastLesson.ts` is the storage half of the same promise `lessonRoute.ts` keeps for the
 * address bar, and it is deliberately small enough to pin without a browser: what it does with a
 * known id, an id the registry does not list, a store that throws (private mode, a blocked
 * third-party context) and no store at all. Those last two are the ones a browser test cannot reach
 * on purpose - and the ones where "throws" would mean a blank workbench rather than P.1.
 *
 * Run: node --experimental-strip-types scripts/test_last_lesson.mjs (`npm run test:resume`)
 */

import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  STORAGE_KEY_LAST_LESSON,
  readLastLessonId,
  rememberLastLesson,
  lessonOffer,
} from '../app/src/lastLesson.ts';
import { attemptsByLesson } from '../app/src/learningLog.ts';
import { PYTHON_LESSONS } from '../app/src/data/pythonLessonsData.ts';

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

/** A fresh browser: new storage, or one that throws on access, or none at all. */
function freshBrowser({ store = 'works' } = {}) {
  const window = new Window({ url: 'https://example.test/' });
  if (store === 'throws') {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('SecurityError: localStorage is disabled');
      },
    });
  }
  globalThis.window = window;
  globalThis.document = window.document;
  if (store === 'absent') {
    delete globalThis.localStorage;
  } else if (store === 'throws') {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError: localStorage is disabled');
      },
    });
  } else {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: window.localStorage,
    });
  }
  return window;
}

const LAST = PYTHON_LESSONS[PYTHON_LESSONS.length - 1].id;
assert.ok(LAST && LAST !== PYTHON_LESSONS[0].id, 'the registry must list more than one lesson');

console.log('last lesson');

check('a first visit has nothing remembered', () => {
  freshBrowser();
  assert.equal(readLastLessonId(), null, 'expected no stored lesson to mean "start at the top"');
});

check('the lesson on screen is the lesson the next visit opens', () => {
  const window = freshBrowser();
  rememberLastLesson(LAST);
  assert.equal(window.localStorage.getItem(STORAGE_KEY_LAST_LESSON), LAST, 'expected the id to be stored');
  assert.equal(readLastLessonId(), LAST, 'expected the stored id to be read back');
});

check('an id the registry does not list is ignored, not opened', () => {
  const window = freshBrowser();
  window.localStorage.setItem(STORAGE_KEY_LAST_LESSON, 'NOT.A.LESSON');
  assert.equal(readLastLessonId(), null, 'expected an unknown stored id to fall back to the first lesson');
});

check('an unknown id is not written over a real one', () => {
  const window = freshBrowser();
  rememberLastLesson(PYTHON_LESSONS[1].id);
  rememberLastLesson('NOT.A.LESSON');
  assert.equal(
    window.localStorage.getItem(STORAGE_KEY_LAST_LESSON),
    PYTHON_LESSONS[1].id,
    'expected a rejected id to leave the remembered lesson alone'
  );
});

check('a store that throws neither crashes nor forgets the visit', () => {
  freshBrowser({ store: 'throws' });
  assert.equal(readLastLessonId(), null, 'expected a throwing store to read as "nothing remembered"');
  rememberLastLesson(LAST);
  assert.ok(true, 'expected rememberLastLesson not to throw in private mode');
});

check('no storage at all (the server render) is not an error', () => {
  freshBrowser({ store: 'absent' });
  assert.equal(readLastLessonId(), null, 'expected the server render to have nothing remembered');
  rememberLastLesson(LAST);
  assert.ok(true, 'expected rememberLastLesson to be safe without a store');
});

// The roadmap's card asks `lessonOffer` what to offer. Pin the two rules behind it: an untouched
// first visit must not arrive as a lesson to resume, and once the stopped-on lesson is verified the
// offer has to move forward instead of asking for that lesson again. Rendering is the E2E's job.
const IDS = PYTHON_LESSONS.map((lesson) => lesson.id);
const FIRST = IDS[0];
const SECOND = IDS[1];
const NONE = { verified: {}, completed: {} };
const offer = (storedId, progress = NONE) => lessonOffer(storedId, IDS, progress);

check('nothing remembered offers no lesson', () => {
  assert.equal(offer(null), null);
});

check('an untouched first visit is not a lesson to resume', () => {
  assert.equal(
    offer(FIRST),
    null,
    'expected an unstarted Lesson 1 to be left to the Start here block'
  );
});

check('the lesson stopped on is offered back while it is unverified', () => {
  for (const stored of [FIRST, LAST]) {
    const progress = stored === FIRST ? { verified: {}, completed: { [FIRST]: true } } : NONE;
    assert.deepEqual(offer(stored, progress), { id: stored, reason: 'resume' });
  }
});

check('a verified lesson hands the offer forward, never back to itself', () => {
  assert.deepEqual(offer(FIRST, { verified: { [FIRST]: true }, completed: {} }), {
    id: SECOND,
    reason: 'next',
  });
});

check('the next offer skips what is already done, verified or self-marked', () => {
  const at = 1;
  const progress = {
    verified: { [IDS[at]]: true, [IDS[at + 1]]: true },
    completed: { [IDS[at + 2]]: true },
  };
  assert.deepEqual(offer(IDS[at], progress), { id: IDS[at + 3], reason: 'next' });
});

check('finishing the last lesson wraps to the earliest gap, not nowhere', () => {
  const verified = Object.fromEntries(IDS.map((id) => [id, true]));
  delete verified[SECOND];
  assert.deepEqual(offer(LAST, { verified, completed: {} }), { id: SECOND, reason: 'next' });
});

check('a fully verified course offers nothing rather than repeating itself', () => {
  const all = Object.fromEntries(IDS.map((id) => [id, true]));
  assert.equal(offer(LAST, { verified: all, completed: {} }), null);
});

check('a self-marked lesson is still unverified, so the card keeps offering it', () => {
  const all = Object.fromEntries(IDS.map((id) => [id, true]));
  assert.deepEqual(
    offer(LAST, { verified: {}, completed: all }),
    { id: LAST, reason: 'resume' },
    'expected self-marking to be a note, not a pass, on the lesson the learner stopped on'
  );
});

check('an id the list does not hold offers nothing', () => {
  assert.equal(offer('NOT.A.LESSON', { verified: {}, completed: {} }), null);
});

// The card's state line, and the roadmap's practice chips, separate "opened" from "attempted" by
// folding the learning log the runner already writes. Pin the fold: an open with no run is a read,
// and a lesson that was run is never mistaken for one that was merely opened.
const event = (kind, lesson, extra = {}) => ({ t: 1, kind, lesson, ...extra });

check('a lesson opened and left has opens but no runs', () => {
  const attempts = attemptsByLesson([event('lesson_open', 'P.4'), event('lesson_open', 'P.4')]);
  assert.deepEqual(attempts['P.4'], { opens: 2, runs: 0 });
});

check('a run counts as an attempt even with no open recorded', () => {
  const attempts = attemptsByLesson([event('run', 'P.5', { outcome: 'mismatch', fail: 'line 3' })]);
  assert.equal(attempts['P.5'].runs, 1, 'expected the run to be counted');
  assert.equal(attempts['P.5'].opens, 0, 'expected the open count to stay zero');
});

check('the last run wins, and its failure line is kept', () => {
  const attempts = attemptsByLesson([
    event('lesson_open', 'P.6'),
    event('run', 'P.6', { outcome: 'behavior_failed', fail: 'first failure' }),
    event('run', 'P.6', { outcome: 'mismatch', fail: 'second failure' }),
    event('verified', 'P.6'),
  ]);
  assert.equal(attempts['P.6'].runs, 2);
  assert.equal(attempts['P.6'].lastOutcome, 'mismatch');
  assert.equal(attempts['P.6'].lastFail, 'second failure');
});

check('hints and exports are not attempts, and a lesson-less event is skipped', () => {
  const attempts = attemptsByLesson([
    event('hint', 'P.4', { level: 2 }),
    event('export'),
    event('solution_open', 'P.4'),
  ]);
  assert.deepEqual(attempts, {}, 'expected nothing that is not an open or a run to appear');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
