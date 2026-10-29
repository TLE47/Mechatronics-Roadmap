#!/usr/bin/env node
/**
 * The first-run tour without a browser (`scripts/test_tour.mjs`, `npm run test:firstrun`).
 *
 * A tour is mostly words, and words are the part nobody tests. Three things can go wrong that a
 * reader of the code would not see:
 *
 * 1. **A step that asks for an action becomes skippable by accident** — the tour is then a slideshow
 *    again, which is the thing this design exists to avoid. So the gate is pinned per step.
 * 2. **An anchor stops existing.** A coach mark pointing at nothing renders as a card with a ring
 *    around empty space, or worse, falls back to the middle of the screen while claiming to point at
 *    the editor. The last check here reads the app's own source, so a rename fails CI instead of the
 *    tour.
 * 3. **The record reopens a finished tour, or never reopens a closed one.** `tourOffer` and
 *    `mergeTourStates` decide that, in both directions, and a restore is one of the ways it happens.
 * 4. **The gate is not the gate.** `package.json` is JSON, so a second `"test:tour"` key is not a
 *    syntax error — the last one silently wins, and the suite a doc names is a different suite. That
 *    happened here: the presets walker took the name and these checks ran nowhere. So the last check
 *    reads `package.json` itself and refuses any duplicate script name.
 *
 * Run: node --experimental-strip-types scripts/test_tour.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  FIRST_LESSON_TOUR,
  TOUR_STEP_COUNT,
  TOUR_VERSION,
  initialTourState,
  layoutForStep,
  primaryLabel,
  reduceTour,
  skipsResults,
  stepAnnouncement,
  stepAt,
} from '../app/src/tour.ts';
import {
  STORAGE_KEY_TOUR,
  mergeTourStates,
  readTour,
  resumeLabel,
  tourOffer,
  writeTour,
} from '../app/src/tourState.ts';

const repoRoot = path.resolve(import.meta.dirname, '..');

const NO_FACTS = { edited: false, runFinished: false, passed: false };
const NOW = 1_700_000_000_000;

/** A state that is on a given step, as the reducer would leave it. */
const at = (stepIndex, overrides = {}) => ({
  ...initialTourState(NOW),
  status: 'active',
  stepIndex,
  ...overrides,
});

let failures = 0;
function check(name, run) {
  try {
    run();
    console.log(`  ok  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${name}`);
    console.error(`       ${error.message.split('\n').join('\n       ')}`);
  }
}

console.log(`tour: ${TOUR_STEP_COUNT} steps, version ${TOUR_VERSION}`);

/* ---- 1. The table ------------------------------------------------------------------------- */

check('six steps, in the order the tour walks them', () => {
  assert.deepEqual(
    FIRST_LESSON_TOUR.map((step) => step.id),
    ['welcome', 'lesson', 'editor', 'run', 'results', 'hints']
  );
});

check('every step fits a coach mark', () => {
  for (const step of FIRST_LESSON_TOUR) {
    assert.ok(step.title.length > 0 && step.title.length <= 60, `${step.id}: title`);
    const words = step.body.trim().split(/\s+/).length;
    assert.ok(words <= 30, `${step.id}: ${words} words is a paragraph, not a coach mark`);
  }
});

check('the action steps wait for the action, and only they are skippable', () => {
  const actionSteps = FIRST_LESSON_TOUR.filter((step) => step.gate !== 'next');
  assert.deepEqual(actionSteps.map((step) => step.id), ['editor', 'run']);
  for (const step of FIRST_LESSON_TOUR) {
    if (step.gate === 'next') assert.equal(step.skippable, false, `${step.id} should not be skippable`);
    else assert.equal(step.skippable, true, `${step.id} must have a way out`);
  }
});

/* ---- 2. The gates ------------------------------------------------------------------------- */

check('Next advances a words step and does nothing on an action step', () => {
  assert.equal(reduceTour(at(0), 'next', NO_FACTS, NOW).stepIndex, 1);
  assert.equal(reduceTour(at(1), 'next', NO_FACTS, NOW).stepIndex, 2);
  assert.equal(reduceTour(at(2), 'next', NO_FACTS, NOW).stepIndex, 2);
  assert.equal(reduceTour(at(3), 'next', NO_FACTS, NOW).stepIndex, 3);
});

check('the editor step advances only on a real edit', () => {
  assert.equal(reduceTour(at(2), 'edited', NO_FACTS, NOW).stepIndex, 2);
  assert.equal(reduceTour(at(2), 'edited', { ...NO_FACTS, edited: true }, NOW).stepIndex, 3);
  // An edit on a step that does not ask for one is not a reason to move.
  assert.equal(reduceTour(at(4), 'edited', { ...NO_FACTS, edited: true }, NOW).stepIndex, 4);
});

check('the run step advances only on a run that finished', () => {
  assert.equal(reduceTour(at(3), 'run-finished', NO_FACTS, NOW).stepIndex, 3);
  assert.equal(
    reduceTour(at(3), 'run-finished', { ...NO_FACTS, runFinished: true }, NOW).stepIndex,
    4
  );
});

check('a first-run pass skips the red-checks step', () => {
  const facts = { edited: true, runFinished: true, passed: true };
  assert.equal(skipsResults(facts, 3), true);
  assert.equal(reduceTour(at(3), 'run-finished', facts, NOW).stepIndex, 5);
  // …and the step after it is still a step, not the end.
  assert.equal(reduceTour(at(4), 'next', facts, NOW).stepIndex, 5);
  assert.equal(reduceTour(at(5), 'next', facts, NOW).status, 'completed');
});

check('the last step finishes rather than looping', () => {
  const done = reduceTour(at(TOUR_STEP_COUNT - 1), 'next', NO_FACTS, NOW);
  assert.equal(done.status, 'completed');
  assert.equal(done.stepIndex, TOUR_STEP_COUNT - 1);
});

check('skip-step is honoured only where the table allows it', () => {
  assert.equal(reduceTour(at(2), 'skip-step', NO_FACTS, NOW).stepIndex, 3);
  assert.equal(reduceTour(at(3), 'skip-step', NO_FACTS, NOW).stepIndex, 4);
  assert.equal(reduceTour(at(1), 'skip-step', NO_FACTS, NOW).stepIndex, 1);
});

check('dismiss keeps the step it was on, and a closed tour stays closed', () => {
  const closed = reduceTour(at(3), 'dismiss', NO_FACTS, NOW);
  assert.equal(closed.status, 'dismissed');
  assert.equal(closed.stepIndex, 3, 'the chip needs the step to name it');
  assert.equal(reduceTour(closed, 'next', NO_FACTS, NOW), closed);
  assert.equal(reduceTour(closed, 'edited', { ...NO_FACTS, edited: true }, NOW), closed);
});

check('replay opens step one from any record', () => {
  const replayed = reduceTour({ ...at(5), status: 'completed' }, 'replay', NO_FACTS, NOW);
  assert.equal(replayed.status, 'active');
  assert.equal(replayed.stepIndex, 0);
  assert.equal(replayed.version, TOUR_VERSION);
});

check('a signal the step does not ask for returns the same object', () => {
  const state = at(1);
  assert.equal(reduceTour(state, 'run-finished', { ...NO_FACTS, runFinished: true }, NOW), state);
  assert.equal(reduceTour(state, 'edited', { ...NO_FACTS, edited: true }, NOW), state);
});

/* ---- 3. Words the buttons show ------------------------------------------------------------ */

check('the primary button is named for the step, and absent on action steps', () => {
  assert.equal(primaryLabel(0), 'Next');
  assert.equal(primaryLabel(2), null);
  assert.equal(primaryLabel(3), null);
  assert.equal(primaryLabel(4), 'Got it');
  assert.equal(primaryLabel(5), 'Finish tour');
});

check('the announcement names the step and its number', () => {
  assert.equal(stepAnnouncement(3), 'Step 4 of 6: Press Run & Verify Output');
  // An index from a store that no longer fits reads as the first step, not as a crash.
  assert.equal(stepAnnouncement(99), 'Step 1 of 6: Welcome to MechaLab');
  assert.equal(stepAt(-3).id, 'welcome');
});

check('the preset follows the step, and a phone shows one region at a time', () => {
  assert.equal(layoutForStep(0, false), 'study');
  assert.equal(layoutForStep(2, false), 'write');
  // The run step keeps the results region: the predict gate and the verdict the step waits for are
  // panes there, and Write hides both (which deadlocked the step until the tour timed out).
  assert.equal(layoutForStep(3, false), 'study');
  assert.equal(layoutForStep(4, false), 'study');
  assert.equal(layoutForStep(1, true), 'read');
  assert.equal(layoutForStep(2, true), 'write');
  assert.equal(layoutForStep(4, true), 'study');
});

/* ---- 4. The record ------------------------------------------------------------------------ */

function withStorage(store) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    value: store,
    configurable: true,
    writable: true,
  });
  return () => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  };
}

function fakeStorage(initial = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key, next) => {
      value = next;
    },
    removeItem: () => {
      value = null;
    },
    get value() {
      return value;
    },
  };
}

check('no storage at all still yields a usable record', () => {
  const state = readTour();
  assert.equal(state.status, 'not-started');
  assert.equal(writeTour(state).status, 'not-started');
});

check('a stored record is read field by field', () => {
  const store = fakeStorage(
    JSON.stringify({
      version: TOUR_VERSION,
      status: 'active',
      stepIndex: 3,
      chipShown: true,
      updatedAt: 12,
    })
  );
  const restore = withStorage(store);
  try {
    const state = readTour();
    assert.equal(state.status, 'active');
    assert.equal(state.stepIndex, 3);
    assert.equal(state.chipShown, true);
    assert.equal(state.updatedAt, 12);
  } finally {
    restore();
  }
});

check('junk, a wrong version and an out-of-range step all read as "never taken"', () => {
  for (const raw of [
    'not json',
    '{}',
    JSON.stringify({ version: TOUR_VERSION + 1, status: 'completed', stepIndex: 5 }),
    JSON.stringify({ version: TOUR_VERSION, status: 'nope', stepIndex: 2 }),
  ]) {
    const restore = withStorage(fakeStorage(raw));
    try {
      assert.equal(readTour().status, 'not-started', `read ${raw}`);
    } finally {
      restore();
    }
  }
  const restore = withStorage(
    fakeStorage(JSON.stringify({ version: TOUR_VERSION, status: 'active', stepIndex: 42 }))
  );
  try {
    assert.equal(readTour().stepIndex, 0);
  } finally {
    restore();
  }
});

check('a blocked write costs the memory, not the tour', () => {
  const store = fakeStorage();
  store.setItem = () => {
    throw new Error('quota');
  };
  const restore = withStorage(store);
  try {
    const state = at(2);
    assert.equal(writeTour(state).stepIndex, 2);
    assert.equal(store.value, null);
  } finally {
    restore();
  }
});

check('the key is the one the store and the backup both name', () => {
  assert.equal(STORAGE_KEY_TOUR, 'mechalab_tour_v1');
});

/* ---- 5. Whether to offer it --------------------------------------------------------------- */

check('a first visit opens the tour; progress or a later lesson does not', () => {
  const fresh = initialTourState(NOW);
  assert.equal(tourOffer(fresh, { onFirstLesson: true, hasProgress: false }), 'tour');
  assert.equal(tourOffer(fresh, { onFirstLesson: true, hasProgress: true }), 'none');
  assert.equal(tourOffer(fresh, { onFirstLesson: false, hasProgress: true }), 'none');
  assert.equal(tourOffer(fresh, { onFirstLesson: false, hasProgress: false }), 'chip');
});

check('a tour left mid-way chips once, and never reopens itself', () => {
  const mid = at(3);
  assert.equal(tourOffer(mid, { onFirstLesson: true, hasProgress: true }), 'chip');
  assert.equal(tourOffer({ ...mid, chipShown: true }, { onFirstLesson: true, hasProgress: true }), 'none');
  assert.equal(tourOffer(at(0), { onFirstLesson: true, hasProgress: true }), 'tour');
});

check('closed means closed, and the chip names the step it resumes at', () => {
  for (const status of ['dismissed', 'completed']) {
    const state = { ...at(4), status };
    assert.equal(tourOffer(state, { onFirstLesson: true, hasProgress: false }), 'none');
  }
  assert.equal(resumeLabel(at(2)), 'Resume tour (step 3 of 6)');
  assert.equal(resumeLabel(at(99)), 'Resume tour (step 6 of 6)');
});

check('a restore never moves the record backwards', () => {
  const completed = { ...at(5), status: 'completed' };
  const dismissed = { ...at(2), status: 'dismissed' };
  const activeEarly = at(1);
  const activeLate = at(4);
  assert.deepEqual(mergeTourStates(completed, activeEarly), completed);
  assert.deepEqual(mergeTourStates(dismissed, completed), completed);
  assert.deepEqual(mergeTourStates(activeEarly, activeLate), activeLate);
  assert.deepEqual(mergeTourStates(activeLate, activeEarly), activeLate);
  assert.deepEqual(mergeTourStates(activeLate, { ...activeEarly, version: 0 }), activeLate);
});

/* ---- 6. The anchors exist ------------------------------------------------------------------ */

/** Every `data-tour="…"` value in the app's source. */
function anchorsInSource() {
  const found = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) {
        const text = fs.readFileSync(full, 'utf8');
        for (const match of text.matchAll(/data-tour="([a-z-]+)"/g)) found.add(match[1]);
      }
    }
  };
  walk(path.join(repoRoot, 'app/src'));
  return found;
}

check('every anchor the tour points at is in the app', () => {
  const present = anchorsInSource();
  for (const step of FIRST_LESSON_TOUR) {
    if (step.anchor === null) continue;
    assert.ok(
      present.has(step.anchor),
      `no data-tour="${step.anchor}" in app/src (the step is named "${step.id}")`
    );
  }
});

check('no anchor is left behind by a step that was removed', () => {
  const used = new Set(FIRST_LESSON_TOUR.map((step) => step.anchor).filter(Boolean));
  for (const anchor of anchorsInSource()) {
    assert.ok(used.has(anchor), `data-tour="${anchor}" has no step; a stale name reads as a target`);
  }
});

/* ---- 7. The gate is registered, once ------------------------------------------------------- */

check('the script name this doc promises runs this file, and no name is declared twice', () => {
  const text = fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8');
  const body = text.slice(text.indexOf('"scripts"'), text.indexOf('"dependencies"'));
  const names = [...body.matchAll(/^\s{4}"([^"]+)":/gm)].map((match) => match[1]);
  const duplicated = names.filter((name, index) => names.indexOf(name) !== index);
  assert.deepEqual(
    [...new Set(duplicated)],
    [],
    'a duplicated script key is not an error to JSON: the last one wins, so the other suite never runs'
  );
  const registry = JSON.parse(text).scripts;
  assert.equal(
    registry['test:firstrun'],
    'node --experimental-strip-types scripts/test_tour.mjs',
    '`npm run test:firstrun` must be this file'
  );
});

if (failures) {
  console.error(`\n${failures} tour check(s) failed`);
  process.exit(1);
}
console.log('tour: all checks passed');
