#!/usr/bin/env node
/**
 * Searching inside the lessons (`scripts/test_lesson_search.mjs`, `npm run test:search`).
 *
 * `⌘⇧F` promises that a word a learner half-remembers can be found in the text the app carries, and
 * the ways that promise breaks are all silent:
 *
 * 1. **A hit points at the wrong line** — line numbers are per field, and only a starter line is a
 *    position in the editor. A hit that says "line 3" of a hint block, handed to the editor, puts
 *    the caret on line 3 of the program.
 * 2. **The solution is searchable** — the diff panel refuses to show the answer until it is earned;
 *    a search box echoing solution lines would be the same door, unlocked. This suite proves it is
 *    shut by taking text that exists *only* in a solution and finding nothing.
 * 3. **One letter matches everything** — a query under two characters is not a search, and returning
 *    forty rows for `a` teaches a learner that the box does not work.
 * 4. **A common word builds a wall** — the caps are per lesson and overall, and both are pinned.
 *
 * Run: node --experimental-strip-types scripts/test_lesson_search.mjs
 */

import assert from 'node:assert/strict';
import { PYTHON_LESSONS } from '../app/src/data/pythonLessonsData.ts';
import {
  MAX_HITS_PER_LESSON,
  MAX_SEARCH_HITS,
  MIN_SEARCH_QUERY,
  isEditorLine,
  lessonSearchItems,
  searchLessonText,
} from '../app/src/lessonSearch.ts';
import { lessonIdOf } from '../app/src/palette.ts';

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

const searchableText = (lesson) =>
  [
    lesson.starterCode,
    lesson.hints.join('\n'),
    lesson.instructorTests,
    lesson.expectedOutput,
    lesson.id,
    lesson.title,
    lesson.ideas.join(' '),
  ].join('\n');

console.log('search inside the lessons');

check('a word from a starter is found at its own line, and only a starter is a line of the editor', () => {
  const lesson = PYTHON_LESSONS[0];
  const lines = lesson.starterCode.split('\n');
  const index = lines.findIndex((line) => line.trim().length >= 8);
  assert.ok(index >= 0, `${lesson.id} has no line long enough to search for`);
  const word = lines[index].trim().split(/[^A-Za-z_]+/).find((part) => part.length >= 4);
  assert.ok(word, `expected a word of four letters on ${lesson.id}:${index + 1}`);

  const hits = searchLessonText(word, [lesson]);
  const starterHit = hits.find((hit) => hit.field === 'starter');
  assert.ok(starterHit, `expected a starter hit for ${word}, got ${JSON.stringify(hits)}`);
  assert.equal(starterHit.lessonId, lesson.id);
  assert.equal(starterHit.line, index + 1, 'the line is 1-based, as the editor counts');
  assert.equal(isEditorLine(starterHit), true);

  const items = lessonSearchItems(word, [lesson]);
  const item = items.find((entry) => entry.lessonId === lesson.id && entry.line === index + 1);
  assert.ok(item, `the starter hit has no row: ${JSON.stringify(items)}`);
  assert.equal(item.line, index + 1, 'a starter hit carries the line the app should reveal');
  assert.equal(lessonIdOf(item), lesson.id, 'the row opens its lesson even though its id is per-hit');
});

check('a hint is a hit, but not a line of the editor', () => {
  const lesson = PYTHON_LESSONS.find((entry) => entry.hints.some((hint) => hint.length > 40));
  assert.ok(lesson, 'no lesson has a hint long enough to search');
  const hintIndex = lesson.hints.findIndex((hint) => hint.length > 40);
  const word = lesson.hints[hintIndex].split(/\s+/).find((part) => /^[A-Za-z]{6,}$/.test(part));

  const hits = searchLessonText(word, [lesson]);
  const hintHit = hits.find((hit) => hit.field === 'hints');
  assert.ok(hintHit, `expected a hint hit for ${word} in ${lesson.id}`);
  assert.equal(isEditorLine(hintHit), false, 'a hint line is not a line of main.py');
  const item = lessonSearchItems(word, [lesson]).find(
    (entry) => entry.lessonId === lesson.id && /^hint · line \d+/.test(entry.detail ?? '')
  );
  assert.ok(item, `the hint hit has no row: ${JSON.stringify(lessonSearchItems(word, [lesson]))}`);
  assert.equal(item.line, undefined, 'a hint row must not ask the editor to reveal its line');
  assert.match(item.detail, /^hint · line \d+ — /);
});

check('the solution is not searchable', () => {
  // Text that exists only in the answer: the first solution line longer than twelve characters that
  // is nowhere in the lesson's visible text.
  let probe = null;
  for (const lesson of PYTHON_LESSONS) {
    const visible = searchableText(lesson).toLowerCase();
    for (const line of lesson.fullSolution.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.length < 12) continue;
      if (visible.includes(trimmed.toLowerCase())) continue;
      for (const word of trimmed.split(/[^A-Za-z_]+/)) {
        if (word.length >= 6 && !visible.includes(word.toLowerCase())) {
          probe = { lesson, word };
          break;
        }
      }
      if (probe) break;
    }
    if (probe) break;
  }
  assert.ok(probe, 'every solution word also appears in the visible text, so this check proves nothing');
  const hits = searchLessonText(probe.word, [probe.lesson]);
  assert.equal(
    hits.length,
    0,
    `a solution-only word (${probe.word}) must find nothing; got ${JSON.stringify(hits)}`
  );
});

check('something under two characters is not a search', () => {
  assert.equal(MIN_SEARCH_QUERY, 2);
  assert.deepEqual(searchLessonText(''), []);
  assert.deepEqual(searchLessonText('a'), []);
  assert.deepEqual(searchLessonText('  a  '), [], 'the trim happens before the length test');
  assert.ok(searchLessonText('ab').length > 0, 'two letters is a search');
});

check('a common word is capped per lesson and overall', () => {
  const hits = searchLessonText('th');
  assert.ok(hits.length > 0, 'expected `th` to match something');
  assert.ok(hits.length <= MAX_SEARCH_HITS, `expected at most ${MAX_SEARCH_HITS} rows, got ${hits.length}`);
  const perLesson = new Map();
  for (const hit of hits) perLesson.set(hit.lessonId, (perLesson.get(hit.lessonId) ?? 0) + 1);
  for (const [lessonId, count] of perLesson) {
    assert.ok(
      count <= MAX_HITS_PER_LESSON,
      `${lessonId} contributed ${count} rows, over the ${MAX_HITS_PER_LESSON}-per-lesson cap`
    );
  }
});

check('rows have unique ids and come in course order', () => {
  const items = lessonSearchItems('th');
  const ids = items.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate row ids: ${ids.join(', ')}`);
  const order = items.map((item) => PYTHON_LESSONS.findIndex((lesson) => lesson.id === item.lessonId));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'the list must not reorder the course');
});

check('a lesson id or title is a hit of its own, with no line to reveal', () => {
  const hits = searchLessonText('P.1');
  const headline = hits.find((hit) => hit.field === 'title' && hit.lessonId === 'P.1');
  assert.ok(headline, `expected the title of P.1 among ${JSON.stringify(hits.slice(0, 3))}`);
  assert.equal(headline.line, 0, 'a title is not a line of anything');
  const item = lessonSearchItems('P.1').find(
    (entry) => entry.lessonId === 'P.1' && /^title or ideas/.test(entry.detail ?? '')
  );
  assert.ok(item, 'the title hit has no row');
  assert.equal(item.line, undefined);
  assert.equal(lessonIdOf(item), 'P.1');
  assert.match(item.detail, /title or ideas/);
});

console.log(`lesson search: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
