#!/usr/bin/env node
/**
 * What a learner writes down, without a browser (`scripts/test_study.mjs`, `npm run test:study`).
 *
 * `app/src/studyNotes.ts` is small, and every rule in it is the kind that is invisible until it
 * bites: a note that comes back with its indent stripped, a highlight that duplicates when the same
 * passage is pinned twice, a clear that leaves an empty entry behind, a store written by an older
 * version read as a crash, a write the bucket refuses, and a restore that overwrites a note written
 * this morning with one from last week. It also pins the retention promise the store now makes:
 * every lesson keeps its note, with no count at which the oldest is dropped.
 *
 * The storage cases are the ones the browser cannot be asked to produce on purpose: blocked storage
 * (private mode), storage that throws on access, and a bucket that rejects the write.
 *
 * Run: node --experimental-strip-types scripts/test_study.mjs
 */

import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  MAX_COMMENT_CHARS,
  MAX_HIGHLIGHT_CHARS,
  MAX_HIGHLIGHTS,
  MAX_NOTE_CHARS,
  STORAGE_KEY_STUDY,
  addHighlight,
  cleanQuote,
  mergeStudy,
  parseStudy,
  readLessonStudy,
  readStudy,
  removeHighlight,
  replaceStudy,
  saveNote,
  studyCounts,
} from '../app/src/studyNotes.ts';

let passed = 0;
let failed = 0;
const entries = [];

function section(title) {
  entries.push({ section: title });
}

function check(name, fn) {
  entries.push({ name, fn });
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

section('a note');

check('a note is stored per lesson and read back with its own line breaks', () => {
  freshBrowser();
  saveNote('P.1', '  first line\n    indented second  ', 1000);
  assert.equal(readLessonStudy('P.1').note, 'first line\n    indented second');
  assert.equal(readLessonStudy('P.2'), null, 'a lesson with nothing written has no entry');
});

check('a note written again replaces the first one instead of stacking', () => {
  freshBrowser();
  saveNote('P.1', 'first', 1000);
  saveNote('P.1', 'second', 2000);
  const study = readLessonStudy('P.1');
  assert.equal(study.note, 'second');
  assert.equal(study.updatedAt, 2000);
  assert.equal(Object.keys(readStudy()).length, 1);
});

check('a note cleared to nothing removes the entry, highlights or not', () => {
  freshBrowser();
  saveNote('P.1', 'something', 1000);
  saveNote('P.1', '   ', 2000);
  assert.equal(readLessonStudy('P.1'), null, 'an empty note must not leave an entry behind');

  saveNote('P.2', 'keep me', 1000);
  addHighlight('P.2', 'a passage', '', 1100);
  saveNote('P.2', '', 1200);
  const kept = readLessonStudy('P.2');
  assert.equal(kept.note, '');
  assert.equal(kept.highlights.length, 1, 'the highlight outlives the note that was cleared');
});

check('a note longer than the cap is cut, not refused', () => {
  freshBrowser();
  saveNote('P.1', 'x'.repeat(MAX_NOTE_CHARS + 500), 1000);
  assert.equal(readLessonStudy('P.1').note.length, MAX_NOTE_CHARS);
});

section('a highlight');

check('a quote collapses its whitespace and is capped', () => {
  freshBrowser();
  const highlight = addHighlight('P.1', '  the tolerance   is on\n   the angle  ', 'why', 1000);
  assert.equal(highlight.quote, 'the tolerance is on the angle');
  assert.equal(highlight.comment, 'why');
  assert.equal(highlight.at, 1000);
  assert.equal(cleanQuote('   '), '', 'an empty selection is not a highlight');
  assert.equal(cleanQuote('y'.repeat(MAX_HIGHLIGHT_CHARS + 50)).length, MAX_HIGHLIGHT_CHARS);
});

check('pinning the same passage twice updates the comment and keeps the first timestamp', () => {
  freshBrowser();
  addHighlight('P.1', 'same passage', 'first thought', 1000);
  const again = addHighlight('P.1', 'same  passage', 'second thought', 2000);
  const study = readLessonStudy('P.1');
  assert.equal(study.highlights.length, 1, 'the same passage is one highlight');
  assert.equal(again.comment, 'second thought');
  assert.equal(study.highlights[0].at, 1000, 'the first sighting is the useful timestamp');
});

check('a blank comment does not erase a comment already written', () => {
  freshBrowser();
  addHighlight('P.1', 'passage', 'written', 1000);
  addHighlight('P.1', 'passage', '   ', 2000);
  assert.equal(readLessonStudy('P.1').highlights[0].comment, 'written');
});

check('a comment is capped at the margin-note limit, not the essay limit', () => {
  freshBrowser();
  addHighlight('P.1', 'passage', 'c'.repeat(MAX_COMMENT_CHARS + 100), 1000);
  assert.equal(readLessonStudy('P.1').highlights[0].comment.length, MAX_COMMENT_CHARS);
});

check('one lesson keeps the newest highlights and drops the oldest', () => {
  freshBrowser();
  for (let index = 0; index < MAX_HIGHLIGHTS + 5; index += 1) {
    addHighlight('P.1', `passage ${index}`, '', 1000 + index);
  }
  const quotes = readLessonStudy('P.1').highlights.map((highlight) => highlight.quote);
  assert.equal(quotes.length, MAX_HIGHLIGHTS);
  assert.equal(quotes[0], 'passage 5', 'the five oldest are the ones evicted');
  assert.equal(quotes.at(-1), `passage ${MAX_HIGHLIGHTS + 4}`);
});

check('removing a highlight keeps the rest, and empties the lesson when it was the last thing', () => {
  freshBrowser();
  addHighlight('P.1', 'one', '', 1000);
  addHighlight('P.1', 'two', '', 1001);
  removeHighlight('P.1', 'one');
  assert.deepEqual(readLessonStudy('P.1').highlights.map((highlight) => highlight.quote), ['two']);
  removeHighlight('P.1', 'two');
  assert.equal(readLessonStudy('P.1'), null, 'a lesson with nothing left must not linger in the store');
  removeHighlight('P.1', 'never there');
  assert.equal(readLessonStudy('P.1'), null);
});

section('the bucket');

check('every lesson keeps its note, however many are written', () => {
  // The store used to keep 25 lessons and drop the least-recently-written; a note from week one was
  // the first thing to go. Forty is past that old limit on purpose: authored work is not cache.
  freshBrowser();
  for (let index = 0; index < 40; index += 1) {
    saveNote(`L.${index}`, `note ${index}`, 1000 + index);
  }
  const study = readStudy();
  assert.equal(Object.keys(study).length, 40, 'no lesson is dropped for being old');
  assert.equal(study['L.0'].note, 'note 0', 'the first lesson written is still there');
  assert.equal(study['L.39'].note, 'note 39');

  // Editing the oldest again neither evicts it nor changes another lesson's text.
  saveNote('L.0', 'back to this one', 9000);
  const after = readStudy();
  assert.equal(Object.keys(after).length, 40);
  assert.equal(after['L.0'].note, 'back to this one');
  assert.equal(after['L.1'].note, 'note 1');
});

check('a store written by something else reads as the part of itself that parses', () => {
  assert.deepEqual(parseStudy('{not json'), {});
  assert.deepEqual(parseStudy('null'), {});
  assert.deepEqual(parseStudy('[1,2,3]'), {});
  assert.deepEqual(parseStudy(JSON.stringify({ 'P.1': { note: '  ', highlights: [] } })), {}, 'an empty entry is not an entry');
  assert.deepEqual(
    parseStudy(
      JSON.stringify({
        'P.1': {
          note: 'kept',
          updatedAt: 5,
          highlights: [{ quote: '  a passage ', at: 3 }, { quote: '' }, 'junk', { quote: 'a passage' }],
        },
      })
    ),
    { 'P.1': { note: 'kept', updatedAt: 5, highlights: [{ quote: 'a passage', comment: '', at: 3 }] } }
  );
});

check('a blocked or throwing store never throws at the caller', () => {
  freshBrowser({ store: 'throws' });
  assert.deepEqual(readStudy(), {});
  assert.equal(readLessonStudy('P.1'), null);
  assert.equal(saveNote('P.1', 'text'), false, 'a blocked write says it did not land');
  assert.equal(addHighlight('P.1', 'quote'), null);

  freshBrowser({ store: 'absent' });
  assert.deepEqual(readStudy(), {});
  assert.equal(saveNote('P.1', 'text'), false);
});

check('a bucket that rejects the write keeps the session working', () => {
  freshBrowser();
  const window = globalThis.window;
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
  assert.equal(saveNote('P.1', 'text'), false, 'the refusal is reported, not swallowed');
  assert.deepEqual(readStudy(), {}, 'the write was lost, and nothing crashed');
});

section('the merge a restore performs');

check('an empty store takes the whole file, and counts what arrived', () => {
  const incoming = {
    'P.1': { note: 'from the file', highlights: [{ quote: 'passage', comment: '', at: 5 }], updatedAt: 5 },
  };
  const merged = mergeStudy({}, incoming);
  assert.deepEqual(merged.store, incoming);
  assert.deepEqual(
    { lessons: merged.addedLessons, notes: merged.addedNotes, highlights: merged.addedHighlights },
    { lessons: 1, notes: 1, highlights: 1 }
  );
});

check('a note written here wins, and an empty one is filled from the file', () => {
  const local = {
    'P.1': { note: 'written here', highlights: [], updatedAt: 10 },
    'P.2': { note: '', highlights: [{ quote: 'local', comment: '', at: 4 }], updatedAt: 4 },
  };
  const incoming = {
    'P.1': { note: 'from the file', highlights: [], updatedAt: 99 },
    'P.2': { note: 'from the file', highlights: [], updatedAt: 99 },
  };
  const merged = mergeStudy(local, incoming);
  assert.equal(merged.store['P.1'].note, 'written here');
  assert.equal(merged.store['P.2'].note, 'from the file');
  assert.equal(merged.addedNotes, 1);
  assert.equal(merged.addedHighlights, 0);
  assert.equal(merged.store['P.2'].highlights[0].quote, 'local', 'local highlights are never dropped');
});

check('highlights union by quote, and the newer comment wins', () => {
  const local = {
    'P.1': {
      note: '',
      highlights: [
        { quote: 'kept', comment: 'old', at: 10 },
        { quote: 'only here', comment: '', at: 11 },
      ],
      updatedAt: 11,
    },
  };
  const incoming = {
    'P.1': {
      note: '',
      highlights: [
        { quote: 'kept', comment: 'newer', at: 20 },
        { quote: 'only in the file', comment: '', at: 30 },
      ],
      updatedAt: 30,
    },
  };
  const merged = mergeStudy(local, incoming);
  const quotes = merged.store['P.1'].highlights.map((highlight) => highlight.quote).sort();
  assert.deepEqual(quotes, ['kept', 'only here', 'only in the file']);
  assert.equal(merged.store['P.1'].highlights.find((h) => h.quote === 'kept').comment, 'newer');
  assert.equal(merged.addedHighlights, 1);
});

check('an older file cannot erase a comment written after it', () => {
  const local = {
    'P.1': { note: '', highlights: [{ quote: 'passage', comment: 'today', at: 50 }], updatedAt: 50 },
  };
  const incoming = {
    'P.1': { note: '', highlights: [{ quote: 'passage', comment: 'last week', at: 10 }], updatedAt: 10 },
  };
  const merged = mergeStudy(local, incoming);
  assert.equal(merged.store['P.1'].highlights[0].comment, 'today');
  assert.equal(merged.addedHighlights, 0);
});

check('a restore keeps every lesson in the file, including the ones written first', () => {
  freshBrowser();
  const incoming = {};
  for (let index = 0; index < 30; index += 1) {
    incoming[`L.${index}`] = { note: `n${index}`, highlights: [], updatedAt: 1000 + index };
  }
  const merged = mergeStudy({}, incoming);
  assert.equal(Object.keys(merged.store).length, 30, 'the merge drops nothing');
  assert.equal(merged.addedLessons, 30);
  assert.equal(replaceStudy(merged.store), true, 'the write landed');
  const stored = readStudy();
  assert.equal(Object.keys(stored).length, 30, 'a restore drops no lesson for being old');
  assert.equal(stored['L.0'].note, 'n0', 'the oldest lesson in the file survives the round trip');
  assert.equal(stored['L.29'].note, 'n29');
});

check('counts say how much was written, not how many lessons exist', () => {
  freshBrowser();
  saveNote('P.1', 'a note', 1000);
  addHighlight('P.1', 'one', '', 1001);
  addHighlight('P.2', 'two', '', 1002);
  assert.deepEqual(studyCounts(), { lessons: 2, notes: 1, highlights: 2 });
  assert.deepEqual(studyCounts({}), { lessons: 0, notes: 0, highlights: 0 });
});

for (const entry of entries) {
  if (entry.section) {
    console.log(entry.section);
    continue;
  }
  try {
    await entry.fn();
    passed += 1;
    console.log(`  ok   ${entry.name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL ${entry.name}\n       ${error.message}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
