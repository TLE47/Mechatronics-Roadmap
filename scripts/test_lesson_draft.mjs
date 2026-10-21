#!/usr/bin/env node
/**
 * The editor's unfinished work survives the tab (`scripts/test_lesson_draft.mjs`).
 *
 * `app/src/lessonDraft.ts` is the store behind two promises: a half-written exercise is still there
 * when the learner comes back, and the roadmap card can say so before opening it. Both are small
 * enough to pin without a browser, and the cases a browser test cannot reach on purpose are the ones
 * that matter: storage that throws (private mode), a store written by an older version, a bucket that
 * is full, a draft past the size cap, and the eviction order when more lessons are edited than the
 * store keeps.
 *
 * Run: node --experimental-strip-types scripts/test_lesson_draft.mjs (`npm run test:draft`)
 */

import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  MAX_DRAFTS,
  MAX_DRAFT_CHARS,
  STORAGE_KEY_DRAFTS,
  clearDraft,
  editedLines,
  readDraft,
  readDrafts,
  saveDraft,
} from '../app/src/lessonDraft.ts';
import { PYTHON_LESSONS } from '../app/src/data/pythonLessonsData.ts';
import { coachForLesson, draftProgress } from '../app/src/lessonCoach.ts';

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

/** A fresh browser: new storage, one that throws on access, or none at all. */
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

const LESSON = PYTHON_LESSONS[0];
const OTHER = PYTHON_LESSONS[1];
const EDIT = `${LESSON.starterCode}\nprint("half-written")\n`;

console.log('lesson drafts');

check('an untouched lesson stores nothing', () => {
  const window = freshBrowser();
  saveDraft(LESSON.id, LESSON.starterCode);
  assert.equal(
    window.localStorage.getItem(STORAGE_KEY_DRAFTS),
    null,
    'expected a lesson still on its starter to leave the store empty'
  );
  assert.equal(readDraft(LESSON.id), null);
});

check('an edited lesson is read back exactly, newline included', () => {
  freshBrowser();
  saveDraft(LESSON.id, EDIT);
  assert.equal(readDraft(LESSON.id), EDIT, 'expected the draft byte-for-byte');
  assert.deepEqual(Object.keys(readDrafts()), [LESSON.id]);
});

check('Reset Starter forgets the draft instead of keeping a copy', () => {
  freshBrowser();
  saveDraft(LESSON.id, EDIT);
  saveDraft(LESSON.id, LESSON.starterCode);
  assert.equal(readDraft(LESSON.id), null, 'expected returning to the starter to clear the draft');
  assert.deepEqual(readDrafts(), {});
  saveDraft(LESSON.id, EDIT);
  clearDraft(LESSON.id);
  assert.deepEqual(readDrafts(), {}, 'expected clearDraft to remove it too');
});

check('a draft for an id the registry does not list is not stored', () => {
  const window = freshBrowser();
  saveDraft('NOT.A.LESSON', 'print(1)');
  assert.equal(window.localStorage.getItem(STORAGE_KEY_DRAFTS), null);
});

check('the store keeps the most recent lessons and evicts the oldest', () => {
  freshBrowser();
  const ids = PYTHON_LESSONS.slice(0, MAX_DRAFTS + 2).map((lesson) => lesson.id);
  for (const id of ids) saveDraft(id, `# edited ${id}\n`);
  const kept = Object.keys(readDrafts());
  assert.equal(kept.length, MAX_DRAFTS, `expected ${MAX_DRAFTS} drafts, kept ${kept.length}`);
  assert.deepEqual(kept, ids.slice(2), 'expected the two oldest edits to be evicted');

  // Editing an evicted lesson again makes it the newest, not the oldest by accident.
  saveDraft(ids[0], '# back again\n');
  const after = Object.keys(readDrafts());
  assert.equal(after[after.length - 1], ids[0], 'expected a re-edited lesson to move to the newest slot');
  assert.equal(after.length, MAX_DRAFTS, 'expected the cap to hold after re-adding');
});

check('a paste past the size cap is not stored, and does not disturb the rest', () => {
  freshBrowser();
  saveDraft(LESSON.id, EDIT);
  saveDraft(OTHER.id, 'x'.repeat(MAX_DRAFT_CHARS + 1));
  assert.equal(readDraft(OTHER.id), null, 'expected an oversized draft to be refused');
  assert.equal(readDraft(LESSON.id), EDIT, 'expected the refused draft to leave the store alone');
});

check('a store written by an older version reads as empty, not as a crash', () => {
  const window = freshBrowser();
  window.localStorage.setItem(STORAGE_KEY_DRAFTS, '[1, 2, 3]');
  assert.deepEqual(readDrafts(), {}, 'expected a non-object store to read as no drafts');
  window.localStorage.setItem(STORAGE_KEY_DRAFTS, '{"P.1":42}');
  assert.deepEqual(readDrafts(), {}, 'expected non-string values to be dropped');
  window.localStorage.setItem(STORAGE_KEY_DRAFTS, '{not json');
  assert.deepEqual(readDrafts(), {});
  saveDraft(LESSON.id, EDIT);
  assert.equal(readDraft(LESSON.id), EDIT, 'expected a save to replace the unreadable store');
});

check('a store that throws neither crashes nor pretends to save', () => {
  freshBrowser({ store: 'throws' });
  assert.deepEqual(readDrafts(), {});
  assert.equal(readDraft(LESSON.id), null);
  saveDraft(LESSON.id, EDIT);
  clearDraft(LESSON.id);
  assert.ok(true, 'expected every entry point to survive a blocked store');
});

check('no storage at all (the server render) is not an error', () => {
  freshBrowser({ store: 'absent' });
  assert.deepEqual(readDrafts(), {});
  saveDraft(LESSON.id, EDIT);
  assert.equal(readDraft(LESSON.id), null);
});

check('editedLines counts what changed, not how long the file is', () => {
  assert.equal(editedLines(LESSON.starterCode, LESSON.starterCode), 0, 'expected the starter to read as 0');
  assert.equal(
    editedLines(`${LESSON.starterCode.trimEnd()}\n# one more idea`, LESSON.starterCode),
    1,
    'expected one appended line to cost one, not the whole file'
  );
  const oneLineChanged = LESSON.starterCode.split('\n');
  const target = oneLineChanged.findIndex((line) => line.trim().length > 0);
  oneLineChanged[target] = '# rewritten';
  assert.equal(
    editedLines(oneLineChanged.join('\n'), LESSON.starterCode),
    2,
    'expected a rewritten line to cost its removal plus its replacement'
  );
});

// How close a half-written exercise is to passing, as far as text can tell. The point of these
// checks is the difference between "two lines changed" (run 136's measure) and "one step written":
// unrelated typing must not read as progress, and a filled step must count without running anything.
const lessonById = (id) => PYTHON_LESSONS.find((lesson) => lesson.id === id);
const P1 = lessonById('P.1');
const P4 = lessonById('P.4');
const EXERCISE = PYTHON_LESSONS.find((lesson) => lesson.track === 'modules');

check('an untouched starter has nothing written', () => {
  for (const lesson of [P1, P4, EXERCISE]) {
    const progress = draftProgress(lesson.starterCode, lesson);
    assert.equal(progress.filled, 0, `${lesson.id}: expected no holes filled on the starter`);
    assert.ok(progress.total > 0, `${lesson.id}: expected the starter to mark holes to measure`);
  }
});

check('the card\'s total is the guide\'s count, on every entry', () => {
  // One parser feeds both surfaces. Two numbers derived separately would eventually disagree on some
  // starter, and the learner would read "1 of 3" under a guide that promised four lines.
  for (const lesson of PYTHON_LESSONS) {
    const progress = draftProgress(lesson.starterCode, lesson);
    const coach = coachForLesson(lesson);
    assert.equal(
      progress.total,
      coach.holeCount,
      `${lesson.id}: the card counts ${progress.total} holes, the guide says ${coach.holeCount}`
    );
    assert.ok(coach.holeCount > 0, `${lesson.id}: expected at least one marked hole`);
  }
});

check('filling one marked step counts one, and only what changed', () => {
  const starter = P1.starterCode;
  const filled = starter.replace('encoder_ticks = encoder_ticks', 'encoder_ticks = encoder_ticks + 25');
  assert.equal(draftProgress(filled, P1).filled, 1, 'expected replacing the first placeholder to count once');
  const both = filled.replace('battery_level = battery_level', 'battery_level = battery_level - 0.45');
  // TODO 1 covers both assignments, so its probe as a whole still differs from the starter's.
  assert.ok(draftProgress(both, P1).filled >= 1, 'expected the whole first step to stay counted');
});

check('unrelated typing does not read as progress', () => {
  const noisy = `${P4.starterCode}\nprint("a thought")`;
  assert.equal(
    draftProgress(noisy, P4).filled,
    0,
    'expected appending a line to leave the measure where the starter is; changed-lines would have said 2'
  );
});

check('a TODO with no placeholder is written by typing under it', () => {
  // P.4's second step is an insertion point: the starter leaves nothing to replace, so the only
  // evidence is code appearing where the marker points.
  const withStep = P4.starterCode.replace(
    '    #         and add safe_cmd to total_cmd.',
    '    #         and add safe_cmd to total_cmd.\n    clamped_commands.append(safe_cmd)\n    total_cmd = total_cmd + safe_cmd'
  );
  const progress = draftProgress(withStep, P4);
  assert.equal(progress.total, draftProgress(P4.starterCode, P4).total, 'expected the same denominator');
  assert.equal(progress.filled, 1, 'expected the inserted step to count once');
  // Writing in both steps is the whole exercise written.
  const both = withStep.replace('safe_cmd = cmd', 'safe_cmd = min(max(cmd, 0), 255)');
  assert.equal(draftProgress(both, P4).filled, progress.total, 'expected both steps to read as done');
});

check('an exercise counts a hole as filled when its raise is gone', () => {
  const raise = EXERCISE.starterCode.split('\n').find((line) => /raise\s+NotImplementedError\(/.test(line));
  assert.ok(raise, 'expected the exercise starter to raise for at least one hole');
  const before = draftProgress(EXERCISE.starterCode, EXERCISE);
  const after = draftProgress(EXERCISE.starterCode.replace(raise, '    return 1.0'), EXERCISE);
  assert.equal(after.filled, before.filled + 1, 'expected implementing one raise to count one hole');
  assert.equal(after.total, before.total, 'expected the denominator to stay the starter\'s own count');
});

check('a lesson whose starter marks nothing measurable says so instead of guessing', () => {
  const unmarked = { ...P1, starterCode: 'print("no markers here")' };
  assert.deepEqual(draftProgress('print(1)', unmarked), { filled: 0, total: 0, isExercise: false });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
