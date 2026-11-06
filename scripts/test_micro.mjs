#!/usr/bin/env node
/**
 * The micro-learning rules without a browser (`scripts/test_micro.mjs`, `npm run test:micro`).
 *
 * The tab is presentation; the promises are in the reducer, the review rotation, the two clocks,
 * the versioned store and the compare-and-swap save. Each of those is exercised here with an
 * injected clock and a fake bucket, including the cases a browser suite cannot reach on purpose:
 * a newer schema, a full bucket, a second tab writing between read and write, a clock that moved
 * backwards, and a review set that must rotate every attempt.
 *
 * Run: node --experimental-strip-types scripts/test_micro.mjs
 */

import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { MICRO_CONCEPTS, MICRO_PARENTS } from '../app/src/micro/catalog.ts';
import { randomizeConcept, samplePrimitiveData } from '../app/src/micro/randomize.ts';
import {
  CHALLENGE_SUCCESS_DAYS,
  FAILURE_RETRY_DAYS,
  PROVISIONAL_DUE_DAYS,
  REVIEW_INTERVALS_DAYS,
  applyMicroEvent,
  dueConceptIds,
  emptyConceptState,
  gradeAnswer,
  intervalDays,
  isDue,
  isStale,
  nextConceptId,
  normalizeShortAnswer,
  reviewSet,
  statusLabel,
} from '../app/src/micro/engine.ts';
import {
  MICRO_EVENT_LIMIT,
  MICRO_SETTINGS_KEY,
  MICRO_STORAGE_KEY,
  MICRO_STORE_VERSION,
  MICRO_DAY_MS,
} from '../app/src/micro/types.ts';
import {
  emptyStore,
  parseStore,
  pruneEvents,
} from '../app/src/micro/store.ts';
import { createMicroProgress } from '../app/src/micro/progress.ts';
import { readMicroEnabled, writeMicroEnabled } from '../app/src/micro/settings.ts';
import { isCodeLikeText, tokenizeInlineCode } from '../app/src/micro/inlineCode.ts';
import { comparisonPreview, questionTarget } from '../app/src/micro/questionComparison.ts';
import {
  DEFAULT_WALKTHROUGH_KEYS,
  formatWalkthroughChord,
  normalizeWalkthroughKeys,
  readWalkthroughKeys,
  updateWalkthroughKey,
} from '../app/src/micro/walkthroughKeys.ts';
import {
  ActivityClock,
  MICRO_OVER_TARGET_SECONDS,
  MICRO_VISIBLE_ALERT_SECONDS,
  clampGap,
  formatClock,
} from '../app/src/micro/timer.ts';

let passed = 0;
let failed = 0;
const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);

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

function section(title) {
  console.log(`\n${title}`);
}

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

function learnEvent(concept, fields = {}, overrides = {}) {
  return {
    eventId: `event-${Math.random().toString(36).slice(2)}`,
    attemptId: `attempt-${Math.random().toString(36).slice(2)}`,
    conceptId: concept.id,
    activity: 'learn',
    timestamp: NOW,
    elapsedSeconds: 42,
    visibleSeconds: 45,
    sourceRevision: concept.revision,
    diagnosticTotal: 2,
    ...fields,
    ...overrides,
  };
}

function reviewEvent(concept, correctCount, overrides = {}) {
  return {
    eventId: `review-${Math.random().toString(36).slice(2)}`,
    attemptId: `review-attempt-${Math.random().toString(36).slice(2)}`,
    conceptId: concept.id,
    activity: 'review',
    timestamp: NOW,
    elapsedSeconds: 24,
    visibleSeconds: 25,
    sourceRevision: concept.revision,
    correctCount,
    totalQuestions: 2,
    ...overrides,
  };
}

function challengeEvent(concept, correct, overrides = {}) {
  return {
    eventId: `challenge-${Math.random().toString(36).slice(2)}`,
    attemptId: `challenge-attempt-${Math.random().toString(36).slice(2)}`,
    conceptId: concept.id,
    activity: 'challenge',
    timestamp: NOW,
    elapsedSeconds: 30,
    visibleSeconds: 31,
    sourceRevision: concept.revision,
    correct,
    ...overrides,
  };
}

section('the content is ten concepts from P.1 and P.2');

check('ten concepts in teaching order, each with two four-option diagnostics', () => {
  assert.equal(MICRO_CONCEPTS.length, 10);
  assert.deepEqual(
    MICRO_CONCEPTS.map((concept) => concept.id),
    [
      'variables',
      'assignment-order',
      'int-float',
      'strings',
      'booleans',
      'mixed-types',
      'f-strings',
      'operators',
      'floor-division',
      'order-of-operations',
    ]
  );
  for (const concept of MICRO_CONCEPTS) {
    assert.equal(concept.diagnostics.length, 2, `${concept.id} must have two diagnostics`);
    for (const diagnostic of concept.diagnostics) {
      if (diagnostic.type === 'choice') {
        assert.ok(
          (diagnostic.options ?? []).length >= 4,
          `${diagnostic.id} must have at least four options; two options is a coin flip`
        );
      } else {
        assert.ok((diagnostic.acceptedAnswers ?? []).length > 0, `${diagnostic.id} needs accepted answers`);
      }
    }
  }
});

check('every concept belongs to a parent lesson whose path is the one it cites', () => {
  assert.equal(MICRO_PARENTS.length, 2, 'P.1 and P.2 both teach micro lessons');
  assert.deepEqual(
    MICRO_PARENTS.map((parent) => parent.parentLessonId),
    ['P.1', 'P.2']
  );
  for (const parent of MICRO_PARENTS) {
    assert.match(parent.parentPath, /^track-p\/P\.\d+-.+\.md$/, `${parent.parentLessonId} needs its markdown path`);
    assert.ok(parent.title, `${parent.parentLessonId} needs its own title`);
    assert.deepEqual(
      parent.conceptIds,
      MICRO_CONCEPTS.filter((concept) => concept.parentLessonId === parent.parentLessonId).map(
        (concept) => concept.id
      ),
      `${parent.parentLessonId} must carry exactly its own concepts, in order`
    );
    assert.ok(parent.conceptIds.length >= 3, `${parent.parentLessonId} needs at least three units`);
  }
  assert.equal(
    MICRO_PARENTS.reduce((total, parent) => total + parent.conceptIds.length, 0),
    MICRO_CONCEPTS.length,
    'every concept must appear under exactly one parent lesson'
  );
});

check('inline code keeps a variable, operator and value as separate colourful tokens', () => {
  const tokens = tokenizeInlineCode('x + 1');
  assert.deepEqual(
    tokens.map((token) => [token.kind, token.text]),
    [
      ['name', 'x'],
      ['space', ' '],
      ['operator', '+'],
      ['space', ' '],
      ['number', '1'],
    ]
  );
  assert.equal(tokenizeInlineCode('plant_height = 12.60')[0].kind, 'name');
  assert.equal(tokenizeInlineCode('"sunny"')[0].kind, 'string');
  assert.equal(tokenizeInlineCode('False')[0].kind, 'boolean');
});

check('every concept has a progressive walkthrough', () => {
  for (const concept of MICRO_CONCEPTS) {
    assert.ok(concept.walkthrough.length >= 2, `${concept.id} needs at least two walkthrough lines`);
    for (const step of concept.walkthrough) {
      assert.ok(step.code.trim(), `${concept.id} walkthrough line needs code`);
      assert.ok(step.note.trim(), `${concept.id} walkthrough line needs a note`);
    }
  }
});

check('walkthrough shortcuts are customizable, persisted and refused on a clash', () => {
  const storage = fakeStorage();
  const defaults = readWalkthroughKeys(storage);
  assert.deepEqual(defaults, DEFAULT_WALKTHROUGH_KEYS);
  assert.equal(formatWalkthroughChord(defaults.next), '→');
  assert.equal(formatWalkthroughChord(defaults.test), 'T');
  const migrated = normalizeWalkthroughKeys({
    next: defaults.next,
    previous: defaults.previous,
  });
  assert.equal(formatWalkthroughChord(migrated.test), 'T', 'an older two-key store gains the test key');
  const custom = updateWalkthroughKey(
    defaults,
    'next',
    { code: 'KeyN', mod: false, alt: false, shift: false },
    storage
  );
  assert.equal(custom.error, null);
  assert.equal(formatWalkthroughChord(custom.keys.next), 'N');
  assert.deepEqual(readWalkthroughKeys(storage), custom.keys);
  const clash = updateWalkthroughKey(custom.keys, 'previous', custom.keys.next, storage);
  assert.match(clash.error, /already the next key/);
  const previous = updateWalkthroughKey(
    custom.keys,
    'previous',
    { code: 'KeyP', mod: false, alt: false, shift: false },
    storage
  );
  assert.equal(previous.error, null);
  assert.deepEqual(readWalkthroughKeys(storage), previous.keys);
  const test = updateWalkthroughKey(
    previous.keys,
    'test',
    { code: 'KeyX', mod: false, alt: false, shift: false },
    storage
  );
  assert.equal(test.error, null);
  assert.equal(formatWalkthroughChord(test.keys.test), 'X');
  assert.deepEqual(readWalkthroughKeys(storage), test.keys);
  const testClash = updateWalkthroughKey(test.keys, 'test', test.keys.next, storage);
  assert.match(testClash.error, /already the next key/);
  const reserved = updateWalkthroughKey(
    defaults,
    'next',
    { code: 'Tab', mod: false, alt: false, shift: false },
    storage
  );
  assert.match(reserved.error, /Escape, Tab, Enter/);
});

check('the quiz comparison plugs known values into the equation', () => {
  const question = MICRO_CONCEPTS.find((concept) => concept.id === 'variables').diagnostics[0];
  const preview = comparisonPreview(question, 'b');
  assert.equal(questionTarget(question), 'sticker_count');
  assert.deepEqual(preview.lines, [
    { original: 'sticker_count = sticker_count + 25', plugged: 'sticker_count = 400 + 25' },
  ]);
  assert.equal(preview.selectedText, '425');
  assert.equal(preview.result, 'sticker_count = 425');
  assert.ok(preview.trace.some((step) => step.plugged === 'sticker_count = 400 + 25'));
  assert.equal(preview.trace.at(-1)?.result, 'sticker_count = 425');
});

check('the quiz comparison follows print and evaluates arithmetic', () => {
  const variables = MICRO_CONCEPTS.find((concept) => concept.id === 'variables');
  const printed = variables.reviewPool.find((question) => question.id === 'variables-r2');
  const preview = comparisonPreview(printed, 'c');
  assert.deepEqual(preview.lines, [{ original: 'print(steps)', plugged: 'print(150)' }]);
  assert.equal(preview.result, '150');
  assert.ok(preview.trace.some((step) => step.plugged === 'print(150)' && step.result === '150'));
  const order = MICRO_CONCEPTS.find((concept) => concept.id === 'assignment-order').diagnostics[0];
  const arithmetic = comparisonPreview(order, 'c');
  assert.deepEqual(arithmetic.lines, [{ original: 'x = x + 5', plugged: 'x = 10 + 5' }]);
  assert.equal(arithmetic.result, 'x = 15');
});

check('the quiz comparison handles comparisons, mixed types and f-strings', () => {
  const bool = MICRO_CONCEPTS.find((concept) => concept.id === 'booleans').practice;
  const comparison = comparisonPreview(bool, 'a');
  assert.deepEqual(comparison.lines, [
    { original: 'weather == "sunny"', plugged: '"sunny" == "sunny"' },
  ]);
  assert.equal(comparison.result, 'True');
  const mixed = MICRO_CONCEPTS.find((concept) => concept.id === 'mixed-types').diagnostics[0];
  const failure = comparisonPreview(mixed, 'c');
  assert.equal(failure.result, 'TypeError');
  assert.equal(failure.resultKind, 'error');
  const fstring = MICRO_CONCEPTS.find((concept) => concept.id === 'f-strings').diagnostics[0];
  const formatted = comparisonPreview(fstring, 'a');
  assert.equal(formatted.result, 'Plant: 12.15 cm');
  const conceptual = MICRO_CONCEPTS.find((concept) => concept.id === 'variables').diagnostics[1];
  const none = comparisonPreview(conceptual, 'a');
  assert.deepEqual(none.lines, []);
  assert.equal(none.result, null);
});

check('primitive data is sampled per visit and the quiz follows the sample', () => {
  const random = seeded(0x5eed);
  const first = samplePrimitiveData(random);
  const second = samplePrimitiveData(random, first);
  assert.notDeepEqual(
    [first.intValue, first.floatValue],
    [second.intValue, second.floatValue],
    'a revisit should draw a different primitive pair'
  );
  assert.match(first.floatText, /^\d+\.\d0$/, 'the coded float still ends in a zero');
  assert.match(first.floatShort, /^\d+\.\d$/, 'Python prints one decimal');

  const variables = MICRO_CONCEPTS.find((concept) => concept.id === 'variables');
  const fresh = randomizeConcept(variables, first, random);
  assert.match(fresh.walkthrough[0].code, new RegExp(`plant_height = ${first.floatText}`));
  assert.equal(variables.walkthrough[0].code, 'plant_height = 12.60', 'the authored catalogue is untouched');
  const diagnostic = fresh.diagnostics[0];
  const match = /sticker_count = (\d+)\nsticker_count = sticker_count \+ (\d+)/.exec(diagnostic.code);
  assert.ok(match, 'the diagnostic still shows two assignment lines');
  const total = Number(match[1]) + Number(match[2]);
  assert.equal(diagnostic.options.find((option) => option.id === diagnostic.answerId).text, String(total));
  const preview = comparisonPreview(diagnostic, diagnostic.answerId);
  assert.equal(preview.result, `sticker_count = ${total}`);
  assert.ok(preview.trace.some((step) => step.plugged === `sticker_count = ${match[1]} + ${match[2]}`));
  for (const option of fresh.practice.options) {
    assert.match(option.text, /^\d+\.\d{1,2}$/, `the practice option ${option.text} is a clean float`);
  }

  const intFloat = randomizeConcept(
    MICRO_CONCEPTS.find((concept) => concept.id === 'int-float'),
    first,
    random
  );
  assert.match(intFloat.walkthrough[0].code, new RegExp(`sticker_count = ${first.intText}`));
  assert.ok(intFloat.practice.prompt.includes(first.intText));
  assert.ok(intFloat.diagnostics[0].prompt.includes(first.floatText));
  assert.equal(gradeAnswer(intFloat.practice, intFloat.practice.answerId), true);
  const r4 = intFloat.reviewPool.find((question) => question.id === 'int-float-r4');
  const r4Preview = comparisonPreview(r4, r4.answerId);
  const expected = r4.options.find((option) => option.id === r4.answerId).text.split(',')[0];
  assert.ok(r4Preview.result.includes(expected), `${r4Preview.result} should include ${expected}`);
});

check('code-like quiz options get the lesson token treatment', () => {
  assert.equal(isCodeLikeText('weather = "sunny"'), true);
  assert.equal(isCodeLikeText('425'), true);
  assert.equal(isCodeLikeText('sticker_count'), true);
  assert.equal(isCodeLikeText('It produces "125"'), false);
  assert.equal(isCodeLikeText('Evaluates the right side, then stores it in the left name'), false);
});

check('every diagnostic is graded deterministically', () => {
  const first = MICRO_CONCEPTS[0].diagnostics[0];
  assert.equal(gradeAnswer(first, first.answerId), true);
  assert.equal(gradeAnswer(first, 'not-an-option'), false);
  for (const concept of MICRO_CONCEPTS) {
    for (const diagnostic of concept.diagnostics) {
      if (diagnostic.type === 'choice') {
        const wrong = diagnostic.options.find((option) => option.id !== diagnostic.answerId);
        assert.ok(wrong, `${diagnostic.id} has no wrong option`);
        assert.equal(gradeAnswer(diagnostic, wrong.id), false);
      }
    }
  }
});

check('short answers normalize case, whitespace and smart quotes', () => {
  assert.equal(normalizeShortAnswer('  Hello   WORLD  '), 'hello world');
  assert.equal(normalizeShortAnswer('“quoted”'), '"quoted"');
  assert.equal(normalizeShortAnswer('‘single’'), "'single'");
  const question = {
    id: 'short',
    prompt: 'name it',
    explanation: '',
    type: 'short',
    acceptedAnswers: ['TypeError', 'type error'],
  };
  assert.equal(gradeAnswer(question, '  TYPEERROR '), true);
  assert.equal(gradeAnswer(question, 'type  error'), true);
  assert.equal(gradeAnswer(question, 'ValueError'), false);
});

section('mastery and scheduling');

check('2/2 is provisional and skip-eligible, due tomorrow', () => {
  const concept = MICRO_CONCEPTS[0];
  const state = applyMicroEvent(
    undefined,
    learnEvent(concept, { diagnosticCorrect: 2, practiceCorrect: null }),
    concept,
    NOW
  );
  assert.equal(state.mastery, 'provisional');
  assert.equal(state.skipEligible, true);
  assert.equal(state.dueAt, NOW + PROVISIONAL_DUE_DAYS * MICRO_DAY_MS);
  assert.equal(state.diagnosticCorrect, 2);
  assert.equal(state.practiceCorrect, null);
});

check('1/2 or 0/2 with a correct practice is provisional but not skip-eligible', () => {
  const concept = MICRO_CONCEPTS[1];
  for (const score of [1, 0]) {
    const state = applyMicroEvent(
      undefined,
      learnEvent(concept, { diagnosticCorrect: score, practiceCorrect: true }),
      concept,
      NOW
    );
    assert.equal(state.mastery, 'provisional');
    assert.equal(state.skipEligible, false);
    assert.equal(state.diagnosticCorrect, score);
  }
});

check('a failed practice is still learning and never a lesson pass', () => {
  const concept = MICRO_CONCEPTS[2];
  const state = applyMicroEvent(
    undefined,
    learnEvent(concept, { diagnosticCorrect: 1, practiceCorrect: false }),
    concept,
    NOW
  );
  assert.equal(state.mastery, 'learning');
  assert.equal(state.skipEligible, false);
  assert.equal(state.practiceCorrect, false);
  assert.equal(state.dueAt, NOW + MICRO_DAY_MS);
});

check('a successful review consolidates and climbs the 3/7/14/30-day ladder', () => {
  const concept = MICRO_CONCEPTS[0];
  let state = applyMicroEvent(
    undefined,
    learnEvent(concept, { diagnosticCorrect: 1, practiceCorrect: true }),
    concept,
    NOW
  );
  assert.equal(state.mastery, 'provisional');
  for (let success = 1; success <= 5; success += 1) {
    const at = NOW + success * 1000;
    state = applyMicroEvent(state, reviewEvent(concept, 2, { timestamp: at }), concept, at);
    assert.equal(state.mastery, 'consolidated');
    assert.equal(state.skipEligible, true);
    assert.equal(state.successCount, success);
    assert.equal(state.dueAt, at + intervalDays(success) * MICRO_DAY_MS);
    assert.equal(intervalDays(success), REVIEW_INTERVALS_DAYS[Math.min(3, success - 1)]);
  }
  assert.equal(intervalDays(1), 3);
  assert.equal(intervalDays(2), 7);
  assert.equal(intervalDays(3), 14);
  assert.equal(intervalDays(4), 30);
  assert.equal(intervalDays(99), 30);
});

check('a successful challenge is consolidated for fourteen days', () => {
  const concept = MICRO_CONCEPTS[5];
  const state = applyMicroEvent(undefined, challengeEvent(concept, true), concept, NOW);
  assert.equal(state.mastery, 'consolidated');
  assert.equal(state.skipEligible, true);
  assert.equal(state.dueAt, NOW + CHALLENGE_SUCCESS_DAYS * MICRO_DAY_MS);
  assert.equal(state.successCount, 1);
});

check('a wrong review or challenge never erases mastery or skip eligibility', () => {
  const concept = MICRO_CONCEPTS[6];
  let state = applyMicroEvent(undefined, challengeEvent(concept, true), concept, NOW);
  const consolidated = state.mastery;
  const skip = state.skipEligible;
  state = applyMicroEvent(state, reviewEvent(concept, 1, { timestamp: NOW + 1000 }), concept, NOW + 1000);
  assert.equal(state.mastery, consolidated);
  assert.equal(state.skipEligible, skip);
  assert.equal(state.successCount, 0);
  assert.equal(state.dueAt, NOW + 1000 + FAILURE_RETRY_DAYS * MICRO_DAY_MS);

  state = applyMicroEvent(state, challengeEvent(concept, false, { timestamp: NOW + 2000 }), concept, NOW + 2000);
  assert.equal(state.mastery, consolidated);
  assert.equal(state.skipEligible, skip);
  assert.equal(state.dueAt, NOW + 2000 + MICRO_DAY_MS);
});

check('a revision mismatch marks stale and clears skip, but keeps mastery', () => {
  const concept = { ...MICRO_CONCEPTS[0], revision: 2 };
  const learned = applyMicroEvent(
    undefined,
    learnEvent(concept, { diagnosticCorrect: 2, practiceCorrect: null }, { sourceRevision: 1 }),
    concept,
    NOW
  );
  assert.equal(learned.stale, true);
  assert.equal(learned.skipEligible, false);
  assert.equal(isStale(learned, concept), true);
  assert.equal(statusLabel(learned, concept, NOW), 'Changed — review again');

  const current = applyMicroEvent(learned, learnEvent(concept, { diagnosticCorrect: 2 }), concept, NOW + 1);
  assert.equal(current.stale, false);
  assert.equal(current.mastery, 'provisional');
  assert.equal(current.skipEligible, true);
});

check('a stale state can consolidate again on a current-revision review', () => {
  const concept = { ...MICRO_CONCEPTS[2], revision: 4 };
  const stale = {
    ...emptyConceptState(concept.id, 3),
    mastery: 'consolidated',
    stale: true,
    skipEligible: false,
    successCount: 2,
  };
  const state = applyMicroEvent(stale, reviewEvent(concept, 2), concept, NOW);
  assert.equal(state.stale, false);
  assert.equal(state.mastery, 'consolidated');
  assert.equal(state.skipEligible, true);
  assert.equal(state.successCount, 3);
});

check('review is one concept at a time, size two, with every rotation covered', () => {
  for (const concept of MICRO_CONCEPTS) {
    const sets = new Set();
    for (let attempt = 0; attempt < concept.reviewPool.length; attempt += 1) {
      const set = reviewSet(concept, attempt);
      assert.equal(set.length, 2);
      assert.equal(new Set(set.map((question) => question.id)).size, 2);
      sets.add(set.map((question) => question.id).join('|'));
    }
    assert.equal(sets.size, concept.reviewPool.length, `${concept.id} rotation repeats a set`);
  }
});

check('due, suggested and status are derived from the store', () => {
  const concept = MICRO_CONCEPTS[0];
  const store = emptyStore(NOW);
  assert.equal(isDue(undefined, NOW), false);
  assert.equal(dueConceptIds(store, MICRO_CONCEPTS, NOW).length, 0);
  assert.equal(nextConceptId(store, MICRO_CONCEPTS, NOW), concept.id);

  const learned = applyMicroEvent(undefined, learnEvent(concept, { diagnosticCorrect: 2 }), concept, NOW);
  store.concepts[concept.id] = learned;
  assert.equal(isDue(learned, NOW), false);
  assert.equal(isDue(learned, NOW + MICRO_DAY_MS), true);
  assert.equal(dueConceptIds(store, MICRO_CONCEPTS, NOW + MICRO_DAY_MS).includes(concept.id), true);
  assert.equal(nextConceptId(store, MICRO_CONCEPTS, NOW), MICRO_CONCEPTS[1].id, 'the next unlearned concept, not the provisional one');
  assert.equal(statusLabel(learned, concept, NOW), 'Provisional');
});

section('bounded evidence');

check('pruning the event log leaves aggregates untouched', () => {
  const concept = MICRO_CONCEPTS[0];
  const state = applyMicroEvent(undefined, learnEvent(concept, { diagnosticCorrect: 2 }), concept, NOW);
  const events = Array.from({ length: MICRO_EVENT_LIMIT + 17 }, (_, index) => ({
    ...reviewEvent(concept, 2),
    eventId: `old-${index}`,
    timestamp: NOW - index,
  }));
  const pruned = pruneEvents(events);
  assert.equal(pruned.length, MICRO_EVENT_LIMIT);
  assert.equal(pruned[0].eventId, `old-${events.length - MICRO_EVENT_LIMIT}`);
  assert.equal(pruned.at(-1).eventId, `old-${events.length - 1}`);
  state.events = pruned;
  assert.equal(state.mastery, 'provisional');
  assert.equal(state.skipEligible, true);
});

check('a newer schema is read-only and never downgraded', () => {
  const raw = JSON.stringify({ version: MICRO_STORE_VERSION + 1, revision: 9, concepts: {}, events: [] });
  const parsed = parseStore(raw, NOW);
  assert.equal(parsed.readOnly, true);
  assert.equal(parsed.store.version, 1);
  assert.equal(parsed.store.revision, 0);
  assert.equal(MICRO_STORE_VERSION, 1);
});

check('a corrupt store is empty and flagged, not a crash', () => {
  const parsed = parseStore('{not json', NOW);
  assert.equal(parsed.corrupt, true);
  assert.equal(parsed.readOnly, false);
  assert.deepEqual(parsed.store, emptyStore(NOW));
});

section('the save path');

check('duplicate eventId is idempotent', async () => {
  const storage = fakeStorage();
  const progress = createMicroProgress({ storage, now: () => NOW });
  const concept = MICRO_CONCEPTS[0];
  const event = learnEvent(concept, { diagnosticCorrect: 2 });
  const first = await progress.save(event);
  assert.equal(first.saved, true);
  assert.equal(first.duplicate, false);
  const revision = first.store.revision;
  const second = await progress.save(event);
  assert.equal(second.saved, true);
  assert.equal(second.duplicate, true);
  assert.equal(second.store.revision, revision);
  assert.equal(first.store.events.length, 1);
});

check('a second tab writing between read and write is retried against its state', async () => {
  const base = fakeStorage();
  const concept = MICRO_CONCEPTS[0];
  const otherConcept = MICRO_CONCEPTS[1];
  const otherEvent = learnEvent(otherConcept, { diagnosticCorrect: 1, practiceCorrect: true });
  const external = emptyStore(NOW);
  external.revision = 40;
  external.concepts[otherConcept.id] = applyMicroEvent(undefined, otherEvent, otherConcept, NOW);
  external.events = [otherEvent];
  let writes = 0;
  const storage = {
    data: base.data,
    getItem: base.getItem,
    removeItem: base.removeItem,
    setItem(key, value) {
      writes += 1;
      if (writes === 1) {
        // The other tab won the race after our first write. Its state is now what the next read
        // sees, and the retry has to apply this event to that state, not to our stale copy.
        base.setItem(key, JSON.stringify(external));
        return;
      }
      base.setItem(key, value);
    },
  };
  const progress = createMicroProgress({ storage, now: () => NOW });
  const event = learnEvent(concept, { diagnosticCorrect: 2 });
  const result = await progress.save(event);
  assert.equal(result.saved, true);
  assert.equal(result.duplicate, false);
  assert.equal(result.store.revision, 41);
  assert.equal(result.store.concepts[concept.id].mastery, 'provisional');
  assert.equal(result.store.concepts[otherConcept.id].diagnosticCorrect, 1);
});

check('a full bucket falls back to memory with a persistent:false result', async () => {
  const storage = {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
    removeItem: () => {},
  };
  const progress = createMicroProgress({ storage, now: () => NOW });
  const concept = MICRO_CONCEPTS[0];
  const result = await progress.save(learnEvent(concept, { diagnosticCorrect: 2 }));
  assert.equal(result.saved, true);
  assert.equal(result.persistent, false);
  assert.equal(progress.persistent(), false);
  assert.equal(progress.read().concepts[concept.id].mastery, 'provisional');
});

check('a blocked read falls back to the in-memory copy', async () => {
  const storage = {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {},
    removeItem: () => {},
  };
  const progress = createMicroProgress({ storage, now: () => NOW });
  const concept = MICRO_CONCEPTS[0];
  const result = await progress.save(learnEvent(concept, { diagnosticCorrect: 2 }));
  assert.equal(result.saved, true);
  assert.equal(result.persistent, false);
  assert.equal(progress.read().concepts[concept.id].mastery, 'provisional');
});

check('a newer store refuses writes and resets', async () => {
  const storage = fakeStorage({
    [MICRO_STORAGE_KEY]: JSON.stringify({ version: 2, revision: 1, concepts: {}, events: [] }),
  });
  const progress = createMicroProgress({ storage, now: () => NOW });
  const concept = MICRO_CONCEPTS[0];
  const result = await progress.save(learnEvent(concept, { diagnosticCorrect: 2 }));
  assert.equal(result.saved, false);
  assert.equal(result.reason, 'read-only');
  assert.equal(progress.reset(), false);
  assert.equal(storage.data.has(MICRO_STORAGE_KEY), true);
});

check('a micro save never touches the parent lesson verified key', async () => {
  const storage = fakeStorage();
  const progress = createMicroProgress({ storage, now: () => NOW });
  const concept = MICRO_CONCEPTS[0];
  const result = await progress.save(learnEvent(concept, { diagnosticCorrect: 2 }));
  assert.equal(result.saved, true);
  assert.deepEqual([...storage.data.keys()], [MICRO_STORAGE_KEY]);
});

check('reset empties only the micro store and keeps other keys', () => {
  const storage = fakeStorage({ 'mechalab_pyodide_verified_v1': '{"P.1":true}' });
  const progress = createMicroProgress({ storage, now: () => NOW });
  assert.equal(progress.reset(), true);
  assert.equal(storage.data.has(MICRO_STORAGE_KEY), false);
  assert.equal(storage.data.get('mechalab_pyodide_verified_v1'), '{"P.1":true}');
});

check('the runtime switch hides the tab without touching progress', () => {
  const storage = fakeStorage({ [MICRO_STORAGE_KEY]: '{"version":1,"revision":2,"concepts":{},"events":[]}' });
  const window = new Window({ url: 'https://example.test/' });
  globalThis.window = window;
  globalThis.localStorage = storage;
  assert.equal(readMicroEnabled(), true);
  writeMicroEnabled(false);
  assert.equal(readMicroEnabled(), false);
  assert.equal(storage.data.get(MICRO_SETTINGS_KEY), '0');
  assert.equal(storage.data.get(MICRO_STORAGE_KEY), '{"version":1,"revision":2,"concepts":{},"events":[]}');
  writeMicroEnabled(true);
  assert.equal(readMicroEnabled(), true);
  delete globalThis.window;
  delete globalThis.localStorage;
});

section('the two clocks');

check('an inactivity gap is capped at ninety seconds', () => {
  assert.equal(clampGap(-1), 0);
  assert.equal(clampGap(0), 0);
  assert.equal(clampGap(30_000), 30_000);
  assert.equal(clampGap(90_000), 90_000);
  assert.equal(clampGap(300_000), 90_000);
  assert.equal(clampGap(Number.NaN), 0);
});

check('adjusted and visible clocks tell different stories', () => {
  const clock = new ActivityClock(NOW);
  const away = clock.tick(NOW + 300_000);
  assert.equal(away.visibleSeconds, 300);
  assert.equal(away.adjustedSeconds, 90);
  assert.equal(away.overTarget, false);
  assert.equal(away.visibleOverLimit, true);
  const near = new ActivityClock(NOW);
  // One gap is capped at 90 s, so reaching the 120 s target takes two ticks — exactly what a live
  // one-second timer does while a learner reads.
  near.tick(NOW + 90_000);
  const read = near.tick(NOW + MICRO_OVER_TARGET_SECONDS * 1000);
  assert.equal(read.adjustedSeconds, MICRO_OVER_TARGET_SECONDS);
  assert.equal(read.overTarget, true, `expected ${read.adjustedSeconds}s to reach the 120s target`);
  assert.equal(read.visibleOverLimit, false);
  assert.equal(MICRO_VISIBLE_ALERT_SECONDS, 180);
});

check('pause and resume never count the hidden stretch', () => {
  const clock = new ActivityClock(NOW);
  clock.pause(NOW + 10_000);
  const hidden = clock.tick(NOW + 100_000);
  assert.equal(hidden.visibleSeconds, 10);
  assert.equal(hidden.adjustedSeconds, 10);
  clock.resume(NOW + 100_000);
  const read = clock.tick(NOW + 110_000);
  assert.equal(read.visibleSeconds, 20);
  assert.equal(read.adjustedSeconds, 20);
});

check('a snapshot restores the session and a backwards clock clamps to zero', () => {
  const first = new ActivityClock(NOW);
  first.tick(NOW + 30_000);
  const restored = new ActivityClock(NOW + 90_000, first.snapshot());
  const read = restored.tick(NOW + 90_000);
  assert.equal(read.visibleSeconds, 90, 'the reload gap is visible but capped in the adjusted clock');
  assert.equal(read.adjustedSeconds, 90);
  const rollback = new ActivityClock(NOW, first.snapshot());
  const backwards = rollback.tick(NOW + 20_000);
  assert.equal(backwards.visibleSeconds, 30, 'a backwards clock cannot subtract the bank');
  assert.equal(backwards.adjustedSeconds, 30);
  assert.equal(formatClock(125), '2:05');
  assert.equal(formatClock(-1), '0:00');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
