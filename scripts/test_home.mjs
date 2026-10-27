#!/usr/bin/env node
/**
 * Home's two pure halves (`scripts/test_home.mjs`).
 *
 * `homeLanding.ts` decides which page a visit opens and remembers the page on screen;
 * `homeData.ts` joins the mission, the route and the notebook into Home's rows. Neither needs React,
 * so both are pinned here — including the cases a browser suite cannot reach on purpose: a store
 * that throws, absent storage, a visit whose clock is ahead, a notebook entry with only a quote.
 *
 * Run: node --experimental-strip-types scripts/test_home.mjs (`npm run test:home`)
 */

import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  SITTING_MS,
  STORAGE_KEY_LAST_VISIT,
  hasLocalProgress,
  landingPage,
  noteVisit,
  readLastVisit,
} from '../app/src/homeLanding.ts';
import { buildHome, anchorWords, HOME_NOTES } from '../app/src/homeData.ts';
import { PYTHON_LESSONS } from '../app/src/data/pythonLessonsData.ts';
import { SPINE, entriesAtDepth } from '../app/src/spine.ts';
import { missionProgressForAll, nextMission } from '../app/src/gamification/missions.ts';
import { STORAGE_KEY_VERIFIED } from '../app/src/progressKeys.ts';

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

/** A fresh browser: working storage, one that throws on access, or none at all. */
function freshBrowser({ store = 'works' } = {}) {
  const window = new Window({ url: 'https://example.test/' });
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

const NOW = 1_800_000_000_000;
const base = { view: null, hasLesson: false, lastVisit: null, hasProgress: true, now: NOW };

check('a first visit opens the workbench, not Home', () => {
  assert.equal(landingPage({ ...base, hasProgress: false }), 'workbench');
});

check('an explicit view wins over everything', () => {
  assert.equal(landingPage({ ...base, view: 'workbench', hasLesson: true, lastVisit: { at: NOW, page: 'home' } }), 'workbench');
  assert.equal(landingPage({ ...base, view: 'home', hasProgress: false }), 'home');
  assert.equal(landingPage({ ...base, view: 'dashboard', hasProgress: false }), 'home');
  assert.equal(landingPage({ ...base, view: 'admin', hasProgress: false }), 'admin');
  // The introduction is a page of its own: the wordmark's address must win even on a first visit,
  // because a visitor who asked for it has not been given a Start Here card to read instead.
  assert.equal(landingPage({ ...base, view: 'intro', hasProgress: false }), 'intro');
  assert.equal(landingPage({ ...base, view: 'intro', hasLesson: true }), 'intro');
});

check('a deep link to a lesson is a destination, not a homepage', () => {
  assert.equal(landingPage({ ...base, hasLesson: true }), 'workbench');
  assert.equal(
    landingPage({ ...base, hasLesson: true, lastVisit: { at: NOW - SITTING_MS * 2, page: 'home' } }),
    'workbench'
  );
});

check('a reload inside the sitting returns to the page on screen', () => {
  assert.equal(landingPage({ ...base, lastVisit: { at: NOW - 60_000, page: 'workbench' } }), 'workbench');
  assert.equal(landingPage({ ...base, lastVisit: { at: NOW - 60_000, page: 'home' } }), 'home');
  // An admin session is a detour, not somewhere to be sent back to, and neither is a look at the
  // introduction: the workbench is the floor both fall back to.
  assert.equal(landingPage({ ...base, lastVisit: { at: NOW - 60_000, page: 'admin' } }), 'workbench');
  assert.equal(landingPage({ ...base, lastVisit: { at: NOW - 60_000, page: 'intro' } }), 'workbench');
});

check('a new sitting opens Home', () => {
  assert.equal(landingPage({ ...base, lastVisit: { at: NOW - SITTING_MS, page: 'workbench' } }), 'home');
  assert.equal(landingPage({ ...base, lastVisit: null }), 'home');
  // A clock that moved backwards is not a sitting: Home is the safe answer.
  assert.equal(landingPage({ ...base, lastVisit: { at: NOW + 5 * 60_000, page: 'workbench' } }), 'home');
});

check('the visit store round-trips, and survives a hostile one', () => {
  freshBrowser();
  assert.equal(readLastVisit(), null);
  noteVisit('home', NOW);
  assert.deepEqual(readLastVisit(), { at: NOW, page: 'home' });
  localStorage.setItem(STORAGE_KEY_LAST_VISIT, '{"page":"elsewhere","at":4}');
  assert.equal(readLastVisit(), null);
  localStorage.setItem(STORAGE_KEY_LAST_VISIT, 'not json');
  assert.equal(readLastVisit(), null);

  freshBrowser({ store: 'throws' });
  assert.equal(readLastVisit(), null);
  assert.doesNotThrow(() => noteVisit('workbench'), 'a blocked store must not throw');

  freshBrowser({ store: 'absent' });
  assert.equal(readLastVisit(), null);
  assert.doesNotThrow(() => noteVisit('home'));
});

check('progress in any of the three maps counts as returning', () => {
  freshBrowser();
  assert.equal(hasLocalProgress(), false);
  localStorage.setItem(STORAGE_KEY_VERIFIED, JSON.stringify({ [PYTHON_LESSONS[0].id]: true }));
  assert.equal(hasLocalProgress(), true);
});

check('today is the first unverified check of the next mission', () => {
  const model = buildHome({
    lessons: PYTHON_LESSONS,
    verified: {},
    study: {},
    continueLesson: null,
    reading: {},
  });
  const first = missionProgressForAll({})[0];
  assert.equal(model.today.kind, 'mission');
  assert.equal(model.today.missionName, first.mission.name);
  assert.equal(model.today.entryId, first.entries[0].id);
  assert.equal(model.today.verified, 0);
  assert.equal(model.today.total, first.entries.length);

  const all = Object.fromEntries(first.entries.map((entry) => [entry.id, true]));
  const next = buildHome({ lessons: PYTHON_LESSONS, verified: all, study: {}, continueLesson: null, reading: {} });
  assert.notEqual(next.today.missionName, first.mission.name, 'a verified mission hands the day forward');
  assert.equal(next.today.verified, 0);
  assert.ok(
    !first.entries.some((entry) => entry.id === next.today.entryId),
    'a verified entry is never offered again'
  );
});

check('with every mission verified, today says so instead of inventing a task', () => {
  const all = {};
  for (const step of SPINE) for (const entry of entriesAtDepth(step, 'tier1')) all[entry.id] = true;
  assert.equal(nextMission(all), null);
  const model = buildHome({ lessons: PYTHON_LESSONS, verified: all, study: {}, continueLesson: null, reading: {} });
  assert.equal(model.today.kind, 'complete');
  assert.equal(model.today.entryId, null);
  assert.match(model.today.label, /capstone/);
});

check('the route counts the same entries the missions ask for', () => {
  const verified = Object.fromEntries(entriesAtDepth(SPINE[0], 'tier1').map((entry) => [entry.id, true]));
  const model = buildHome({ lessons: PYTHON_LESSONS, verified, study: {}, continueLesson: null, reading: {} });
  assert.equal(model.route.length, SPINE.length);
  assert.deepEqual(model.route[0], {
    number: SPINE[0].number,
    title: SPINE[0].title,
    verified: entriesAtDepth(SPINE[0], 'tier1').length,
    total: entriesAtDepth(SPINE[0], 'tier1').length,
  });
  assert.equal(model.route[1].verified, 0);
  const grand = SPINE.reduce((sum, step) => sum + entriesAtDepth(step, 'tier1').length, 0);
  assert.equal(model.route.reduce((sum, step) => sum + step.total, 0), grand);
});

check('notes are the newest few, one line each, never a duplicate row', () => {
  const [a, b, c, d] = PYTHON_LESSONS;
  const note = (text, at, quotes = []) => ({
    note: text,
    highlights: quotes.map((quote) => ({ quote, comment: '', at })),
    updatedAt: at,
  });
  const model = buildHome({
    lessons: PYTHON_LESSONS,
    verified: {},
    study: {
      [a.id]: note('', 3, ['An uncommented quote is still a highlight.']),
      [b.id]: note('x'.repeat(400), 4),
      [c.id]: note('   ', 1),
      [d.id]: note('A note that is recent.', 9),
    },
    continueLesson: null,
    reading: {},
  });
  assert.equal(model.notes.length, HOME_NOTES);
  assert.deepEqual(
    model.notes.map((row) => row.id),
    [d.id, b.id, a.id]
  );
  assert.equal(model.notes[0].snippet, 'A note that is recent.');
  assert.match(model.notes[1].snippet, /…$/, 'a long note is clipped, not printed whole');
  assert.equal(model.notes[2].hasNote, false);
  assert.equal(model.notes[2].highlights, 1);
  assert.equal(model.notes[2].snippet, 'An uncommented quote is still a highlight.');
  assert.ok(!model.notes.some((row) => row.id === c.id), 'an empty notebook entry is not a row');
});

check('the reading position becomes words, and only for the offered lesson', () => {
  const lesson = PYTHON_LESSONS[0];
  const model = buildHome({
    lessons: PYTHON_LESSONS,
    verified: {},
    study: {},
    continueLesson: { id: lesson.id, reason: 'resume' },
    reading: { [lesson.id]: { anchor: 'idea-1-law-of-cosines', at: 900 } },
  });
  assert.equal(model.reading.lessonId, lesson.id);
  assert.equal(model.reading.title, lesson.title);
  assert.equal(model.reading.stoppedAt, 'idea 1 law of cosines');
  assert.equal(anchorWords(''), null);
  assert.equal(
    buildHome({ lessons: PYTHON_LESSONS, verified: {}, study: {}, continueLesson: null, reading: {} }).reading,
    null
  );
});

console.log(`\nhome: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
