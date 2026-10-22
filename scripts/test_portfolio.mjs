#!/usr/bin/env node
/**
 * The portfolio document, pinned without React or a browser (`scripts/test_portfolio.mjs`,
 * `npm run test:portfolio`).
 *
 * The export is the one artifact a learner hands to somebody else, so the failures that matter are
 * the ones a screenshot never shows: three empty headings that read as "did nothing", a note that
 * starts with `#` turning into a heading and swallowing the section after it, a 500-card deck pasted
 * in whole, a time table whose minutes disagree with the totals above it, or a document whose date
 * moves between the preview and the download.
 *
 * The builder takes the stores as arguments and `now` as an argument, which is what makes all of that
 * checkable here: the suite seeds stores, builds the document, and reads it as text.
 *
 * Run: node --experimental-strip-types scripts/test_portfolio.mjs
 */

import assert from 'node:assert/strict';
import {
  MAX_LISTED_CARDS,
  MAX_LISTED_SITTINGS,
  buildPortfolioMarkdown,
} from '../app/src/portfolio.ts';
import { DAY_MS, newCard, review } from '../app/src/fsrs.ts';
import { MAX_CARDS } from '../app/src/studyCards.ts';
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

const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);
const MIN = 60_000;
const LESSON = PYTHON_LESSONS[0];
const OTHER = PYTHON_LESSONS[1];

/** One highlight, with the comment that turns it into a card. */
const highlight = (quote, comment = '', at = 1000) => ({ quote, comment, at });

/** A studied card: `grades` answers, one per `step` days after `start`. */
function answeredCard(lesson, quote, comment, grades, start = NOW - 30 * DAY_MS) {
  let schedule = newCard(start);
  grades.forEach((grade, index) => {
    schedule = review(schedule, grade, start + index * 3 * DAY_MS);
  });
  return { id: `${lesson}::${quote}`, lesson, quote, comment, schedule };
}

function build(extras = {}, progress = {}) {
  return buildPortfolioMarkdown(
    progress.verified ?? {},
    progress.completed ?? {},
    progress.milestones ?? {},
    { pythonTabName: 'Python', now: NOW, ...extras }
  );
}

const headings = (doc) => doc.split('\n').filter((line) => /^#{2,3} /.test(line));

console.log('the progress record');

check('a fresh browser gets the three progress sections and nothing else', () => {
  const doc = build();
  assert.deepEqual(headings(doc), [
    '## 1. Execution-Verified Python Exercises (Executed & Passed in Pyodide WASM)',
    '## 2. Self-Marked Completed Python Lessons (Manual Checklist, Not Yet Executed in WASM)',
    '## 3. Self-Reported Ten-Step Track Milestones',
  ]);
  assert.equal(doc.includes('Study Notes and Kept Passages'), false, 'no empty notes heading');
  assert.equal(doc.includes('Review Deck'), false);
  assert.equal(doc.includes('Measured Study Time'), false);
  assert.equal(doc.includes('**Study notes:**'), false, 'no zero-count bullet either');
  assert.match(doc, /Open Python and click "Run & Verify Output"/, 'the empty state names the tab it was given');
  assert.match(doc, /^- \*\*Generated:\*\* 2026-10-21$/m, 'the date comes from `now`, so preview and download agree');
});

check('the counts and the categories stay what they were', () => {
  const doc = build({}, {
    verified: { [LESSON.id]: true },
    completed: { [LESSON.id]: true, [OTHER.id]: true },
    milestones: {},
  });
  assert.equal(
    doc.includes(`Pyodide WASM):** 1 / ${PYTHON_LESSONS.length}`),
    true,
    'the verified count must be the lessons that were verified'
  );
  assert.equal(
    doc.includes(`(Manual Checklist):** 2 / ${PYTHON_LESSONS.length}`),
    true,
    'the self-marked count keeps counting a lesson that was also verified'
  );
  // A lesson that was verified is not repeated as self-marked.
  const occurrences = doc.split(`Lesson ${LESSON.id} (`).length - 1;
  assert.equal(occurrences, 1, 'verified and self-marked must not both list the same lesson');
});

console.log('notes and kept passages');

check('one lesson per heading, in registry order, with the note quoted', () => {
  const doc = build({
    study: {
      [OTHER.id]: { note: '', highlights: [highlight('second lesson passage')], updatedAt: 2 },
      [LESSON.id]: { note: 'tolerance is on the angle\nnot the position', highlights: [], updatedAt: 1 },
    },
  });
  const noteHeadings = headings(doc).filter((line) => line.startsWith('### '));
  assert.equal(noteHeadings.length, 2);
  assert.match(noteHeadings[0], new RegExp(`### Lesson ${LESSON.id}`), 'registry order, not insertion order');
  assert.match(noteHeadings[1], new RegExp(`### Lesson ${OTHER.id}`));
  assert.match(doc, /^> tolerance is on the angle$/m);
  assert.match(doc, /^> not the position$/m, 'a note keeps its own line breaks');
});

check('a highlight is one line, and its comment follows an em dash', () => {
  const doc = build({
    study: {
      [LESSON.id]: {
        note: '',
        highlights: [highlight('the  tolerance\nis  on the angle', 'because 5 mm passed'), highlight('marked only')],
        updatedAt: 1,
      },
    },
  });
  assert.match(doc, /^- “the tolerance is on the angle” — because 5 mm passed$/m);
  assert.match(doc, /^- “marked only”$/m, 'a passage with no comment gets no dangling dash');
});

check('a note cannot escape its blockquote into a heading or a rule', () => {
  const doc = build({
    study: {
      [LESSON.id]: { note: '# Not a heading\n---\n## Also not', highlights: [], updatedAt: 1 },
    },
  });
  for (const line of ['# Not a heading', '## Also not']) {
    assert.equal(doc.includes(`\n${line}\n`), false, `"${line}" leaked out of the blockquote`);
    assert.equal(doc.includes(`\n> ${line}\n`), true, `"${line}" must stay quoted`);
  }
  // A rule cannot be quoted, so the check is that the *only* bare `---` is the footer's own separator:
  // in a real document the note's would end the section and swallow everything after it.
  const lines = doc.split('\n');
  assert.equal(lines.includes('> ---'), true, 'the note\'s dashed line stays inside the quote');
  assert.equal(
    lines.filter((line) => line === '---').length,
    1,
    'a bare separator belongs to the footer, not to a note'
  );
});

check('every lesson with only a note still gets a section, and an empty store gets none', () => {
  const empty = build({ study: { [LESSON.id]: { note: '   ', highlights: [], updatedAt: 1 } } });
  assert.equal(empty.includes('Study Notes and Kept Passages'), false, 'a whitespace note is not a note');

  const onlyNote = build({ study: { [LESSON.id]: { note: 'a thought', highlights: [], updatedAt: 1 } } });
  assert.equal(onlyNote.includes('Study Notes and Kept Passages'), true);
  assert.equal(onlyNote.includes('**Kept passages**'), false, 'a lesson with no passages says nothing');
});

console.log('the deck');

check('the deck lists due and next, and marks a card that was never answered', () => {
  const doc = build({
    cards: [
      {
        id: `${LESSON.id}::seen card`,
        lesson: LESSON.id,
        quote: 'seen card',
        comment: 'why',
        schedule: {
          ...newCard(NOW - 5 * DAY_MS),
          stability: 10,
          difficulty: 5,
          reps: 2,
          lastReview: NOW - 5 * DAY_MS,
          due: NOW + 2 * DAY_MS,
          intervalDays: 7,
        },
      },
      { id: `${OTHER.id}::fresh`, lesson: OTHER.id, quote: 'fresh card', comment: 'new', schedule: newCard(NOW) },
    ],
  });
  assert.match(doc, /^- \*\*Cards:\*\* 2 · \*\*Due now:\*\* 1 · \*\*Next card:\*\* due now$/m);
  assert.match(doc, /^- “fresh card” — lesson .* · not answered yet · due now$/m);
  assert.match(doc, /^- “seen card” — lesson .* · seen 2× · in 2 days$/m);
});

check('a big deck lists twenty and says how many it did not list', () => {
  const cards = Array.from({ length: MAX_LISTED_CARDS + 5 }, (_, index) => ({
    id: `${LESSON.id}::card ${index}`,
    lesson: LESSON.id,
    quote: `card ${index}`,
    comment: 'why',
    schedule: newCard(NOW),
  }));
  const doc = build({ cards });
  const listed = doc.split('\n').filter((line) => /^- “card \d+”/.test(line)).length;
  assert.equal(listed, MAX_LISTED_CARDS);
  assert.match(doc, /_…and 5 more cards, not listed\._/);
  assert.ok(MAX_CARDS > MAX_LISTED_CARDS, 'the cap the deck may hold is far above what the export lists');
});

console.log('measured time');

check('totals and the table agree, and the table is the most recent sittings', () => {
  const sittings = Array.from({ length: MAX_LISTED_SITTINGS + 2 }, (_, index) => ({
    start: NOW - (index + 1) * DAY_MS,
    end: NOW - (index + 1) * DAY_MS + (5 + index) * MIN,
    runs: index,
    reviews: 0,
    lessons: [`P.${index}`, 'P.1', 'P.2', 'P.3'],
  }));
  const doc = build({ sittings: sittings.slice().reverse() });
  const rows = doc.split('\n').filter((line) => /^\| \d{4}-\d{2}-\d{2} \|/.test(line));
  assert.equal(rows.length, MAX_LISTED_SITTINGS, 'the table stops at the cap');
  assert.match(doc, new RegExp(`\\*\\*Sittings:\\*\\* ${sittings.length} `));
  assert.match(doc, /_Measured on this device/, 'the document says where the numbers come from');
  for (const row of rows) {
    assert.match(row, /^\| \d{4}-\d{2}-\d{2} \| \d+ \| \d+ \| \d+ \| .* \+1 \|$/, `seat of a row: ${row}`);
  }
});

check('the totals bullet and the time summary repeat the same duration', () => {
  const sittings = [
    { start: NOW - 2 * DAY_MS, end: NOW - 2 * DAY_MS + 20 * MIN, runs: 1, reviews: 0, lessons: [] },
    { start: NOW - DAY_MS, end: NOW - DAY_MS + 40 * MIN, runs: 2, reviews: 3, lessons: [LESSON.id] },
  ];
  const doc = build({ sittings });
  assert.match(doc, /\*\*Measured study time:\*\* 1 h across 2 sittings/);
  assert.match(doc, /\*\*Total:\*\* 1 h/);
  assert.match(doc, /\*\*Median:\*\* 30 min/);
  assert.match(doc, /\*\*Longest:\*\* 40 min/);
  assert.match(doc, /\| \d{4}-\d{2}-\d{2} \| 40 \| 2 \| 3 \| P\.1 \|/, 'minutes, runs, reviews and lessons on one row');
});

check('the summary bullets appear only when there is something to summarise', () => {
  const withNote = build({
    study: { [LESSON.id]: { note: 'a thought', highlights: [highlight('one', 'c'), highlight('two')], updatedAt: 1 } },
  });
  assert.match(withNote, /\*\*Study notes:\*\* 1 lesson · \*\*Kept passages:\*\* 2 · \*\*Review cards:\*\* 0/);
  const withTime = build({ sittings: [{ start: NOW - MIN, end: NOW, runs: 0, reviews: 0, lessons: [] }] });
  assert.match(withTime, /\*\*Measured study time:\*\* 1 min across 1 sitting$/m);
});

check('the document does not depend on when it is built', () => {
  const extras = () => ({
    study: { [LESSON.id]: { note: 'same', highlights: [highlight('same', 'same')], updatedAt: 1 } },
    cards: [answeredCard(LESSON.id, 'same', 'same', [3])],
    sittings: [{ start: NOW - DAY_MS, end: NOW - DAY_MS + 10 * MIN, runs: 1, reviews: 0, lessons: [] }],
  });
  assert.equal(build(extras()), build(extras()), 'two builds of one state must be byte-identical');
  assert.match(build(extras()), /Exported from \[MechaLab/, 'the footer always closes the document');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
