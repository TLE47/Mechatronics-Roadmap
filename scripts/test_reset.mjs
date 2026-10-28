#!/usr/bin/env node
/**
 * Erasing progress, one part or all of it (`scripts/test_reset.mjs`, `npm run test:reset`).
 *
 * The rule this suite exists for is not "the key was removed" — that is one line and no test needed.
 * It is that the *parts* are honest: a row's count is what the store actually holds, resetting one row
 * leaves every other row's work alone, a row with nothing in it is skipped rather than written back as
 * an empty store, and only the parts the account also holds leave a watermark for the merge to honour.
 * A reset that cleared a neighbour's key, or one that reported work it did not erase, would look
 * perfectly fine in the UI.
 *
 * Runs under Node with a `happy-dom` window and no React, the same shape as `test_backup.mjs`: the
 * module reads `localStorage` through the stores, so a fresh `Window` per case is a fresh browser.
 *
 * Run: node --experimental-strip-types scripts/test_reset.mjs
 */

import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  RESET_AREAS,
  RESET_EVERYTHING,
  RESET_EVENT,
  STORAGE_KEY_RESET_AT,
  readResetAt,
  resetAreas,
  resetEverything,
  resetSummary,
} from '../app/src/progressReset.ts';
import {
  STORAGE_KEY_COMPLETED,
  STORAGE_KEY_MILESTONES,
  STORAGE_KEY_VERIFIED,
} from '../app/src/progressKeys.ts';
import { STORAGE_KEY_HISTORY } from '../app/src/draftHistory.ts';
import { LOG_STORAGE_KEY, logEvent, readLearningLog } from '../app/src/learningLog.ts';
import { readDrafts, saveDraft } from '../app/src/lessonDraft.ts';
import { addHighlight, saveNote, studyCounts } from '../app/src/studyNotes.ts';
import { readTicks, setTicked, tickCounts } from '../app/src/lessonChecks.ts';
import { readCardList, syncCards } from '../app/src/studyCards.ts';
import { readSittings, recordSittingEvent } from '../app/src/sittingClock.ts';
import { readPredictions, savePrediction } from '../app/src/predictGate.ts';
import { readAwards, recordAwards } from '../app/src/gamification/awardStore.ts';
import { readTour, writeTour } from '../app/src/tourState.ts';
import { markStorySeen } from '../app/src/story.ts';
import { rememberLastLesson } from '../app/src/lastLesson.ts';
import { noteVisit } from '../app/src/homeLanding.ts';
import { writeReadingPosition } from '../app/src/readingPosition.ts';
import { areaItemCount, areaItems, resetItem } from '../app/src/resetItems.ts';

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

/** A fresh browser: new storage with nothing in it, and the page's own event target. */
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

/** The Start Here card's key. A literal here: `startHere.ts` pulls the generated lesson registry. */
const START_HERE_KEY = 'mechalab_start_here_dismissed_v1';

const area = (id) => RESET_AREAS.find((entry) => entry.id === id);

/** Something in every part, through the stores' own writers wherever they exist. */
function seedEverything() {
  localStorage.setItem(STORAGE_KEY_VERIFIED, JSON.stringify({ 'P.1': true, 'P.2': true }));
  localStorage.setItem(STORAGE_KEY_COMPLETED, JSON.stringify({ 'P.3': true }));
  localStorage.setItem(STORAGE_KEY_MILESTONES, JSON.stringify({ m1: true, m2: true }));
  localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify({ 'P.1': [{ code: 'x = 1', at: 1, outcome: 'untested' }] }));
  recordAwards([{ id: 'level-1', kind: 'level', label: 'Level 1', at: 1000 }]);
  saveDraft('P.1', 'print("hi")');
  saveNote('P.1', 'a note');
  addHighlight('P.1', 'the passage', 'why it matters');
  setTicked('P.1', 'Run the sweep', true, 900);
  setTicked('P.1', 'Read the trace', true, 901);
  syncCards(1_700_000_000_000);
  logEvent({ kind: 'run', lesson: 'P.1', outcome: 'verified' });
  recordSittingEvent({ at: 1_700_000_000_000, kind: 'run', lesson: 'P.1' });
  savePrediction({
    lessonId: 'P.1',
    text: '42',
    verdict: 'match',
    matchedLines: 1,
    predictedLines: 1,
    skipped: false,
    at: 1000,
  });
  writeTour({ ...readTour(), status: 'completed', stepIndex: 1 });
  markStorySeen();
  localStorage.setItem(START_HERE_KEY, '1');
  rememberLastLesson('P.1');
  noteVisit('workbench');
  writeReadingPosition('P.1', { anchor: 'a heading', at: 4 });
}

console.log('reset registry');

check('twelve parts, each with a label, a hint and one group', () => {
  assert.equal(RESET_AREAS.length, 12);
  const ids = RESET_AREAS.map((entry) => entry.id);
  assert.deepEqual(ids, [
    'lessons',
    'checks',
    'milestones',
    'awards',
    'cards',
    'notes',
    'drafts',
    'log',
    'sittings',
    'predictions',
    'onboarding',
    'resume',
  ]);
  for (const entry of RESET_AREAS) {
    assert.ok(entry.label.length > 2, `${entry.id} needs a label a learner would recognise`);
    assert.ok(entry.hint.length > 20, `${entry.id} needs a sentence saying what goes`);
    assert.ok(['progress', 'workspace', 'local'].includes(entry.group), `${entry.id} group`);
  }
  assert.deepEqual([...RESET_EVERYTHING], ids, 'reset everything names every part once');
});

check('a fresh browser has nothing in any part, and says so', () => {
  freshBrowser();
  for (const entry of RESET_AREAS) {
    const state = entry.count();
    assert.equal(state.n, 0, `${entry.id} should be empty in a fresh browser`);
    assert.ok(state.text.length > 0, `${entry.id} still needs an empty sentence`);
  }
});

console.log('\ncounts read the stores');

check('every part counts what its own store holds', () => {
  freshBrowser();
  seedEverything();
  const expected = {
    lessons: 3,
    checks: 2,
    milestones: 2,
    awards: 1,
    cards: 1,
    notes: 2,
    drafts: 2,
    log: 1,
    sittings: 1,
    predictions: 1,
    onboarding: 3,
    resume: 3,
  };
  for (const [id, n] of Object.entries(expected)) {
    const state = area(id).count();
    assert.equal(state.n, n, `${id} should count ${n}, counted ${state.n} (${state.text})`);
  }
  assert.match(area('lessons').count().text, /2 verified · 1 self-marked/);
  assert.match(area('checks').count().text, /2 ticks in 1 lesson/);
  assert.match(area('notes').count().text, /1 note · 1 highlight/);
  assert.match(area('drafts').count().text, /1 draft · 1 version/);
});

console.log('\none part, alone');

check('resetting lessons erases the flags and the stamps, and nothing else', () => {
  freshBrowser();
  seedEverything();
  const report = resetAreas(['lessons'], 9_000);
  assert.deepEqual(report.areas, ['lessons']);
  assert.equal(report.items, 3);
  assert.equal(report.progress, true, 'lessons live in the account row too');
  assert.equal(localStorage.getItem(STORAGE_KEY_VERIFIED), null);
  assert.equal(localStorage.getItem(STORAGE_KEY_COMPLETED), null);
  assert.equal(area('lessons').count().n, 0);
  // The neighbours are untouched, which is the whole promise of a per-part reset.
  assert.equal(area('milestones').count().n, 2);
  assert.equal(area('log').count().n, 1);
  assert.equal(area('drafts').count().n, 2);
  assert.equal(area('notes').count().n, 2);
});

check('resetting checklists erases the ticks, and leaves the notes and verdicts', () => {
  freshBrowser();
  seedEverything();
  const report = resetAreas(['checks'], 9_500);
  assert.deepEqual(report.areas, ['checks']);
  assert.equal(report.items, 2);
  assert.equal(report.progress, false, 'ticks never leave this browser');
  assert.equal(report.resetAt, null, 'a local part must not move the cloud watermark');
  assert.deepEqual(readTicks('P.1'), []);
  assert.deepEqual(tickCounts(), { lessons: 0, ticks: 0 });
  assert.equal(area('lessons').count().n, 3, 'the verdicts are untouched');
  assert.equal(area('notes').count().n, 2);
});

check('resetting drafts keeps the notes, and the other way round', () => {
  freshBrowser();
  seedEverything();
  const drafts = resetAreas(['drafts']);
  assert.equal(drafts.workspace, true, 'drafts live in the account workspace too');
  assert.deepEqual(readDrafts(), {});
  assert.equal(area('notes').count().n, 2);
  assert.equal(area('drafts').count().n, 0);

  freshBrowser();
  seedEverything();
  resetAreas(['notes']);
  assert.equal(studyCounts().notes + studyCounts().highlights, 0);
  assert.equal(area('drafts').count().n, 2);
});

check('resetting a part with nothing in it writes nothing and reports nothing', () => {
  freshBrowser();
  saveDraft('P.1', 'print(1)');
  const report = resetAreas(['notes'], 5_000);
  assert.deepEqual(report.areas, []);
  assert.equal(report.items, 0);
  assert.equal(report.resetAt, null, 'an empty part cannot claim a reset happened');
  assert.equal(localStorage.getItem(STORAGE_KEY_RESET_AT), null);
  assert.equal(area('drafts').count().n, 1, 'the seeded draft is still there');
});

check('an unknown id is ignored rather than thrown', () => {
  freshBrowser();
  seedEverything();
  const report = resetAreas(['notes', 'not-a-part']);
  assert.deepEqual(report.areas, ['notes']);
  assert.equal(area('notes').count().n, 0);
});

console.log('\nthe watermark');

check('only a part the account also holds writes it', () => {
  freshBrowser();
  seedEverything();
  assert.equal(readResetAt(), 0);
  resetAreas(['predictions'], 7_000);
  assert.equal(readResetAt(), 0, 'predictions never leave this browser');

  const report = resetAreas(['milestones'], 8_000);
  assert.equal(report.resetAt, 8_000);
  assert.equal(readResetAt(), 8_000);
  assert.equal(localStorage.getItem(STORAGE_KEY_RESET_AT), '8000');
});

check('a workspace part reports the workspace copy but not the progress one', () => {
  freshBrowser();
  seedEverything();
  const report = resetAreas(['drafts'], 6_000);
  assert.equal(report.workspace, true);
  assert.equal(report.progress, false);
  assert.equal(report.resetAt, null);
  assert.equal(area('drafts').count().n, 0);
});

check('a second press on an empty part cannot move the watermark', () => {
  freshBrowser();
  seedEverything();
  resetAreas(['lessons'], 4_000);
  const again = resetAreas(['lessons'], 5_000);
  assert.deepEqual(again.areas, []);
  assert.equal(readResetAt(), 4_000, 'the first reset is when it happened');
});

console.log('\neverything');

check('reset everything empties every part and leaves the preferences alone', () => {
  freshBrowser();
  seedEverything();
  localStorage.setItem('mechalab_theme_v1', 'paper');
  localStorage.setItem('mechalab_sound_v1', '{"master":0.4}');
  const report = resetEverything(10_000);
  assert.equal(report.areas.length, 12);
  for (const entry of RESET_AREAS) {
    assert.equal(entry.count().n, 0, `${entry.id} should be empty after everything`);
  }
  assert.equal(readLearningLog().length, 0);
  assert.equal(readSittings().length, 0);
  assert.equal(readPredictions().length, 0);
  assert.equal(readAwards().length, 0);
  assert.equal(readCardList().length, 0);
  assert.equal(report.progress && report.workspace, true);
  assert.equal(report.resetAt, 10_000);
  // Preferences are choices about a screen, not work, and this feature deliberately cannot touch them.
  assert.equal(localStorage.getItem('mechalab_theme_v1'), 'paper');
  assert.equal(localStorage.getItem('mechalab_sound_v1'), '{"master":0.4}');
});

check('the sentence names the parts it erased, and says so when there was nothing', () => {
  freshBrowser();
  seedEverything();
  const report = resetAreas(['lessons', 'predictions']);
  assert.equal(resetSummary(report), 'Reset 4 items · Lessons, Predictions');
  const empty = resetAreas(['lessons', 'predictions']);
  assert.match(resetSummary(empty), /Nothing to reset/);
});

console.log('\nopening a part');

check("every part's items add up to the count its row shows", () => {
  freshBrowser();
  seedEverything();
  for (const entry of RESET_AREAS) {
    const items = areaItems(entry.id);
    const counted = items.reduce((total, item) => total + item.n, 0);
    assert.equal(
      counted,
      entry.count().n,
      `${entry.id}: its ${items.length} item(s) carry ${counted}, the row says ${entry.count().n}`
    );
    assert.equal(areaItemCount(entry.id), entry.count().n, `${entry.id} cheap count`);
    for (const item of items) {
      assert.ok(item.id.length > 0, `${entry.id} item without an id`);
      assert.ok(item.label.length > 0, `${entry.id}/${item.id} needs a label`);
      assert.ok(item.n > 0, `${entry.id}/${item.id} should erase something or not be listed`);
    }
  }
});

check('one lesson is erased without the lesson beside it', () => {
  freshBrowser();
  seedEverything();
  const report = resetItem('lessons', 'P.1', 11_000);
  assert.deepEqual(report.areas, ['lessons']);
  assert.equal(report.items, 1);
  assert.equal(report.progress, true, 'a lesson flag lives in the account row');
  assert.equal(report.resetAt, 11_000);
  assert.equal(readResetAt(), 11_000);
  assert.equal(area('lessons').count().n, 2, 'P.2 verified and P.3 self-marked are untouched');
  assert.deepEqual(
    Object.keys(JSON.parse(localStorage.getItem(STORAGE_KEY_VERIFIED) ?? '{}')),
    ['P.2'],
    'the verified map keeps its other lesson'
  );
});

check('one lesson\'s checklist is erased without the other ticks or the notes', () => {
  freshBrowser();
  seedEverything();
  setTicked('P.2', 'Open the REPL', true, 902);
  assert.equal(area('checks').count().n, 3);
  const item = areaItems('checks').find((entry) => entry.id === 'checks:P.1');
  assert.ok(item, 'P.1 should be listed as its own checklist');
  assert.equal(item.n, 2);
  assert.match(item.detail, /2 ticked items/);
  const report = resetItem('checks', item.id, 12_500);
  assert.equal(report.items, 2);
  assert.equal(report.resetAt, null, 'a local part leaves no watermark');
  assert.deepEqual(readTicks('P.1'), []);
  assert.deepEqual(readTicks('P.2'), ['Open the REPL'], 'the other lesson keeps its tick');
  assert.equal(area('notes').count().n, 2);
});

check('a note item takes its highlights with it, and leaves the rest of the store', () => {
  freshBrowser();
  seedEverything();
  saveNote('P.2', 'another note');
  assert.equal(area('notes').count().n, 3, 'one lesson with a note and a highlight, one with a note');
  const report = resetItem('notes', 'P.1', 12_000);
  assert.equal(report.items, 2);
  assert.equal(report.resetAt, null, 'notes live in the workspace row, not the progress one');
  assert.equal(report.workspace, true);
  assert.equal(studyCounts().notes, 1, 'P.2\'s note survived');
  assert.equal(studyCounts().highlights, 0);
});

check('the log lists days, and one press erases that day only', () => {
  freshBrowser();
  logEvent({ kind: 'run', lesson: 'P.1', outcome: 'verified', t: 1_700_000_000_000 });
  logEvent({ kind: 'hint', lesson: 'P.1', level: 1, t: 1_700_000_100_000 });
  logEvent({ kind: 'run', lesson: 'P.2', outcome: 'mismatch', t: 1_700_200_000_000 });
  const items = areaItems('log');
  assert.equal(items.length, 2, 'three events on two days are two items');
  const older = items.find((item) => item.n === 2);
  assert.ok(older, 'the day with two events should carry both');
  const report = resetItem('log', older.id);
  assert.equal(report.items, 2);
  assert.equal(readLearningLog().length, 1, 'the other day is still there');
});

check('an id the part never had erases nothing and stays quiet', () => {
  freshBrowser();
  seedEverything();
  let heard = null;
  window.addEventListener(RESET_EVENT, (event) => {
    heard = event.detail;
  });
  const report = resetItem('lessons', 'P.99');
  assert.deepEqual(report.areas, []);
  assert.equal(report.items, 0);
  assert.equal(heard, null);
  assert.equal(area('lessons').count().n, 3, 'nothing was touched');
});

console.log('\nthe event');

check('a reset tells the page what it did, after it has done it', () => {
  freshBrowser();
  seedEverything();
  let heard = null;
  window.addEventListener(RESET_EVENT, (event) => {
    heard = event.detail;
    // The stores are already clear when the listener runs, which is what lets a screen re-read
    // them synchronously instead of racing the write.
    assert.equal(localStorage.getItem(STORAGE_KEY_VERIFIED), null);
  });
  const report = resetAreas(['lessons']);
  assert.ok(heard, 'no event was dispatched');
  assert.deepEqual(heard, report);
  assert.equal(heard.areas[0], 'lessons');
});

check('a reset that erased nothing stays quiet', () => {
  freshBrowser();
  let heard = null;
  window.addEventListener(RESET_EVENT, (event) => {
    heard = event.detail;
  });
  resetAreas([]);
  assert.equal(heard, null, 'an empty reset should not make the page re-read');
});

console.log(`\n${failed === 0 ? 'OK' : 'FAILED'}: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
