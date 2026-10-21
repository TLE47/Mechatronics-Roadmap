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
  resumeCandidate,
} from '../app/src/lastLesson.ts';
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

// The roadmap's resume card asks `resumeCandidate` what to offer. Pin the one rule that is not
// "whatever was stored": the runner mounts on the first entry, so an untouched first visit must not
// arrive as a lesson to resume. Everything else about the card is rendering, which the E2E covers.
const FIRST = PYTHON_LESSONS[0].id;

check('nothing remembered offers no lesson', () => {
  assert.equal(resumeCandidate(null, { firstId: FIRST, verified: false, completed: false }), null);
});

check('an untouched first visit is not a lesson to resume', () => {
  assert.equal(
    resumeCandidate(FIRST, { firstId: FIRST, verified: false, completed: false }),
    null,
    'expected an unstarted Lesson 1 to be left to the Start here block'
  );
});

check('a first lesson that was used is offered back', () => {
  assert.equal(resumeCandidate(FIRST, { firstId: FIRST, verified: true, completed: false }), FIRST);
  assert.equal(resumeCandidate(FIRST, { firstId: FIRST, verified: false, completed: true }), FIRST);
});

check('any later lesson is offered whatever its state', () => {
  for (const done of [false, true]) {
    assert.equal(
      resumeCandidate(LAST, { firstId: FIRST, verified: done, completed: !done }),
      LAST,
      'expected a lesson past the first to be offered even before it is verified'
    );
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
