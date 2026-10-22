#!/usr/bin/env node
/**
 * The review schedule, checked as arithmetic rather than vibes (`scripts/test_review.mjs`,
 * `npm run test:review`).
 *
 * Two modules. `app/src/fsrs.ts` is the published FSRS-5 algorithm, so the checks are the ones the
 * algorithm itself promises: retrievability is 0.9 exactly one stability after a review (which is the
 * proof the DECAY/FACTOR constants belong together), the interval at 0.9 retention *is* the stability,
 * Easy outlasts Good outlasts Hard, a late answer teaches more than an early one, a lapse shortens the
 * interval, and the interval never exceeds the term cap. Every one of those is a property a wrong sign
 * or a swapped weight breaks, and none of them needs a browser.
 *
 * `app/src/studyCards.ts` is the join between the notes store and those schedules, so its checks are
 * the joins that can go wrong: a highlight without a comment must not become a prompt nobody can
 * answer, re-pinning a passage must not reset its progress, deleting the highlight or clearing the
 * comment must retire the card and prune its schedule, and a restore must never send a card backwards.
 *
 * Run: node --experimental-strip-types scripts/test_review.mjs
 */

import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  DAY_MS,
  FSRS5_DEFAULT_WEIGHTS,
  MAX_INTERVAL_DAYS,
  cardStatus,
  initialDifficulty,
  initialStability,
  intervalDays,
  newCard,
  retrievability,
  review,
} from '../app/src/fsrs.ts';
import {
  cardId,
  cardsFromStudy,
  dueCards,
  mergeCards,
  nextDueAt,
  parseCards,
  readCardList,
  readCards,
  replaceCards,
  reviewCard,
  syncCards,
} from '../app/src/studyCards.ts';
import { addHighlight, readLessonStudy, removeHighlight, setComment } from '../app/src/studyNotes.ts';

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

/** A fresh browser: new storage with nothing in it. */
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

const DAY0 = 1_700_000_000_000;
const near = (actual, expected, tolerance = 1e-9) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${expected}, got ${actual}`
  );

/** A card that has been answered well a few times: stability 10, difficulty 5, reviewed at DAY0. */
const settled = (overrides = {}) => ({
  ...newCard(DAY0),
  stability: 10,
  difficulty: 5,
  reps: 3,
  lastReview: DAY0,
  due: DAY0 + 10 * DAY_MS,
  intervalDays: 10,
  lastRating: 3,
  ...overrides,
});

console.log('the forgetting curve');

check('retrievability is 0.9 exactly one stability after the review', () => {
  for (const stability of [0.4, 1, 3, 10, 100]) {
    near(retrievability(stability, stability), 0.9, 1e-12);
  }
  near(retrievability(0, 10), 1, 0, 'no time elapsed is perfect recall');
});

check('the default-retention interval is the stability itself', () => {
  for (const stability of [0.5, 1, 7, 42]) {
    near(intervalDays(stability), stability, 1e-9);
  }
});

check('a lower target retention asks for a longer interval', () => {
  assert.ok(intervalDays(10, 0.8) > intervalDays(10, 0.9));
  assert.ok(intervalDays(10, 0.9) > intervalDays(10, 0.97));
});

check('retrievability falls as time passes and never goes negative', () => {
  const values = [0, 1, 5, 20, 400].map((days) => retrievability(days, 8));
  for (let index = 1; index < values.length; index += 1) {
    assert.ok(values[index] < values[index - 1], 'later must be less remembered');
  }
  assert.ok(values.at(-1) > 0);
  near(retrievability(-5, 8), 1, 0, 'a clock that went backwards is not a negative curve');
});

console.log('the first answer');

check('the four grades seed stability in order, from the published weights', () => {
  const stabilities = [1, 2, 3, 4].map((grade) => initialStability(grade));
  assert.deepEqual(stabilities, FSRS5_DEFAULT_WEIGHTS.slice(0, 4));
  for (let index = 1; index < stabilities.length; index += 1) {
    assert.ok(stabilities[index] > stabilities[index - 1], 'a better answer starts stronger');
  }
});

check('initial difficulty is hardest for Again and easiest for Easy, always in 1..10', () => {
  const difficulties = [1, 2, 3, 4].map((grade) => initialDifficulty(grade));
  for (let index = 1; index < difficulties.length; index += 1) {
    assert.ok(difficulties[index] < difficulties[index - 1], 'a better answer starts easier');
  }
  for (const difficulty of difficulties) {
    assert.ok(difficulty >= 1 && difficulty <= 10, `difficulty ${difficulty} out of range`);
  }
});

check('a first answer schedules at least a day out and counts one rep', () => {
  const card = review(newCard(DAY0), 3, DAY0);
  assert.equal(card.reps, 1);
  assert.equal(card.lastReview, DAY0);
  assert.equal(card.intervalDays, 3);
  assert.equal(card.due, DAY0 + 3 * DAY_MS);
  assert.equal(card.lapses, 0);
  // The interval is a whole number of days, so the card comes back within half a day of the 90%
  // point rather than exactly on it: answered at the due date, recall is ~0.9, never below it.
  const recallAtDue = retrievability(card.intervalDays, card.stability);
  assert.ok(recallAtDue >= 0.895 && recallAtDue <= 1, `recall at the due date was ${recallAtDue}`);
});

check('Again on a brand-new card files a lapse and brings it back tomorrow', () => {
  const card = review(newCard(DAY0), 1, DAY0);
  assert.equal(card.lapses, 1);
  assert.equal(card.intervalDays, 1, 'a card that was never known comes back the next morning');
});

console.log('a card that has been learned');

check('difficulty stays inside 1..10 across every answer, from both extremes', () => {
  let easy = settled({ difficulty: 1 });
  let hard = settled({ difficulty: 10 });
  for (let index = 0; index < 40; index += 1) {
    easy = review(easy, index % 2 === 0 ? 4 : 1, DAY0 + (index + 1) * 5 * DAY_MS);
    hard = review(hard, index % 3 === 0 ? 1 : 2, DAY0 + (index + 1) * 5 * DAY_MS);
    assert.ok(easy.difficulty >= 1 && easy.difficulty <= 10, `easy drifted to ${easy.difficulty}`);
    assert.ok(hard.difficulty >= 1 && hard.difficulty <= 10, `hard drifted to ${hard.difficulty}`);
  }
});

check('Easy outlasts Good outlasts Hard from the same state', () => {
  const intervals = [2, 3, 4].map((grade) => review(settled(), grade, DAY0 + 10 * DAY_MS).intervalDays);
  assert.ok(intervals[2] > intervals[1], `Easy (${intervals[2]}) must beat Good (${intervals[1]})`);
  assert.ok(intervals[1] > intervals[0], `Good (${intervals[1]}) must beat Hard (${intervals[0]})`);
});

check('an answer given late teaches more than the same answer given early', () => {
  const early = review(settled(), 3, DAY0 + 2 * DAY_MS);
  const late = review(settled(), 3, DAY0 + 60 * DAY_MS);
  assert.ok(
    late.stability > early.stability,
    `a barely-remembered answer should grow stability more (${late.stability} vs ${early.stability})`
  );
});

check('a successful answer lengthens the interval, a lapse shortens it', () => {
  const again = review(settled(), 3, DAY0 + 10 * DAY_MS);
  assert.ok(again.intervalDays > 10, `expected a longer interval than 10, got ${again.intervalDays}`);
  assert.equal(again.lapses, 0);

  const lapsed = review(settled(), 1, DAY0 + 10 * DAY_MS);
  assert.ok(lapsed.intervalDays < 10, `expected a shorter interval than 10, got ${lapsed.intervalDays}`);
  assert.equal(lapsed.lapses, 1);
  assert.ok(lapsed.stability < 10, 'a lapse resets stability, it does not extend it');
});

check('a second answer inside the same day is a nudge, not a new lifetime', () => {
  const first = review(settled(), 3, DAY0 + 10 * DAY_MS);
  const again = review(first, 3, DAY0 + 10 * DAY_MS + 3_600_000);
  assert.ok(again.stability > first.stability, 'answering again must not be a no-op');
  assert.ok(again.stability < first.stability * 2, 'same-day repetition must not multiply stability');
});

check('the interval is capped at a term', () => {
  const card = review(settled({ stability: 1e6 }), 4, DAY0 + 10 * DAY_MS);
  assert.equal(card.intervalDays, MAX_INTERVAL_DAYS);
  assert.equal(card.due, DAY0 + 10 * DAY_MS + MAX_INTERVAL_DAYS * DAY_MS);
});

check('review never mutates the card it was handed', () => {
  const card = settled();
  const before = JSON.stringify(card);
  review(card, 4, DAY0 + 10 * DAY_MS);
  review(card, 1, DAY0 + 10 * DAY_MS);
  assert.equal(JSON.stringify(card), before);
});

check('a card never answered reports no recall and is due now', () => {
  const fresh = newCard(DAY0);
  assert.equal(fresh.due, DAY0);
  assert.deepEqual(cardStatus(fresh, DAY0), { dueInDays: 0, recall: 0, reviewed: false });
  const settledStatus = cardStatus(settled(), DAY0 + 5 * DAY_MS);
  assert.equal(settledStatus.reviewed, true);
  assert.equal(settledStatus.dueInDays, 5);
  assert.ok(settledStatus.recall > 0.9 && settledStatus.recall < 1);
});

console.log('a highlight becomes a card');

check('only a highlight with a comment is a card', () => {
  const study = {
    'P.1': {
      note: '',
      updatedAt: 1,
      highlights: [
        { quote: 'marked only', comment: '', at: 1 },
        { quote: 'explained', comment: 'because', at: 2 },
      ],
    },
  };
  const cards = cardsFromStudy(study, {}, 5);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].quote, 'explained');
  assert.equal(cards[0].comment, 'because');
  assert.equal(cards[0].id, cardId('P.1', 'explained'));
  assert.equal(cards[0].schedule.due, 5, 'a card with no schedule is new, not missing');
});

check('a new card is written to the store as soon as the deck is synced', () => {
  freshBrowser();
  addHighlight('P.1', 'tolerance is on the angle', 'that is why 5 mm passed', 1000);
  const cards = syncCards(DAY0);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].schedule.reps, 0);
  assert.deepEqual(Object.keys(readCards()), [cardId('P.1', 'tolerance is on the angle')]);
  assert.equal(dueCards(cards, DAY0).length, 1, 'a new card is due now');
});

check('answering a card stores the schedule and takes it out of today', () => {
  freshBrowser();
  addHighlight('P.1', 'a passage', 'why', 1000);
  const [card] = syncCards(DAY0);
  const next = reviewCard(card.id, 3, DAY0);
  assert.equal(next.reps, 1);
  assert.equal(next.due, DAY0 + 3 * DAY_MS);
  assert.deepEqual(dueCards(syncCards(DAY0), DAY0), []);
  assert.equal(readCardList(DAY0 + 3 * DAY_MS).length, 1);
  assert.equal(dueCards(syncCards(DAY0 + 3 * DAY_MS), DAY0 + 3 * DAY_MS).length, 1, 'three days later it is back');
});

check('re-pinning the same passage keeps its progress', () => {
  freshBrowser();
  const highlight = addHighlight('P.1', 'a passage', 'why', 1000);
  reviewCard(cardId('P.1', highlight.quote), 3, DAY0);
  addHighlight('P.1', 'a  passage', 'why, said again', 2000);
  const [card] = syncCards(DAY0 + 1000);
  assert.equal(card.schedule.reps, 1, 'the id is lesson plus quote, so the schedule follows the passage');
  assert.equal(card.comment, 'why, said again');
});

check('clearing the comment retires the card, and the next sync prunes the schedule', () => {
  freshBrowser();
  const highlight = addHighlight('P.1', 'a passage', 'why', 1000);
  syncCards(DAY0);
  reviewCard(cardId('P.1', highlight.quote), 3, DAY0);
  assert.equal(Object.keys(readCards()).length, 1);

  setComment('P.1', highlight.quote, '   ', 2000);
  assert.equal(readLessonStudy('P.1').highlights[0].comment, '', 'the box was cleared on purpose');
  assert.equal(syncCards(DAY0 + 1000).length, 0);
  assert.deepEqual(readCards(), {}, 'a schedule with no highlight is pruned, not kept forever');
});

check('deleting the highlight retires the card too', () => {
  freshBrowser();
  const highlight = addHighlight('P.1', 'a passage', 'why', 1000);
  syncCards(DAY0);
  removeHighlight('P.1', highlight.quote);
  assert.equal(syncCards(DAY0 + 1000).length, 0);
  assert.deepEqual(readCards(), {});
  assert.equal(reviewCard(cardId('P.1', highlight.quote), 3, DAY0), null);
});

check('the deck is ordered by when each card comes back', () => {
  freshBrowser();
  addHighlight('P.1', 'soon', 'a', 1000);
  addHighlight('P.2', 'later', 'b', 1001);
  const cards = syncCards(DAY0);
  reviewCard(cards.find((card) => card.quote === 'soon').id, 3, DAY0);
  reviewCard(cards.find((card) => card.quote === 'later').id, 1, DAY0);
  const sorted = readCardList(DAY0);
  assert.deepEqual(sorted.map((card) => card.quote), ['later', 'soon']);
  assert.equal(nextDueAt(sorted), DAY0 + DAY_MS);
  assert.equal(nextDueAt([]), null);
});

check('reviewing a card that is not there is a no-op, not a new card', () => {
  freshBrowser();
  assert.equal(reviewCard('P.9::nowhere', 3, DAY0), null);
  assert.deepEqual(readCards(), {});
});

console.log('a deck written somewhere else');

check('a store from another version reads as the part of itself that parses', () => {
  assert.deepEqual(parseCards('{not json'), {});
  assert.deepEqual(parseCards('null'), {});
  assert.deepEqual(parseCards('[1,2,3]'), {});
  assert.deepEqual(parseCards(JSON.stringify({ nokey: { stability: 1, due: 1, reps: 1 } })), {});
  const parsed = parseCards(
    JSON.stringify({
      'P.1::a': { stability: 2, difficulty: 40, due: 5, reps: 2, lastReview: 1, lapses: -3, lastRating: 9 },
      'P.1::b': { stability: 'x' },
    })
  );
  assert.deepEqual(Object.keys(parsed), ['P.1::a']);
  assert.equal(parsed['P.1::a'].difficulty, 10, 'difficulty is clamped into the algorithm range');
  assert.equal(parsed['P.1::a'].lapses, 0, 'a negative lapse count is not a count');
  assert.equal(parsed['P.1::a'].lastRating, null, 'a rating that is not 1..4 is not a rating');
});

check('a restore keeps the schedule that has been answered more', () => {
  const local = { 'P.1::a': settled({ reps: 1, lastReview: 900 }) };
  const incoming = { 'P.1::a': settled({ reps: 4, lastReview: 100 }) };
  const result = mergeCards(local, incoming);
  assert.equal(result.store['P.1::a'].reps, 4, 'more reviews is more knowledge, whatever the date');
  assert.equal(result.updated, 1);
  assert.equal(result.added, 0);
});

check('a tie falls to the later review, and neither side is mutated', () => {
  const local = { 'P.1::a': settled({ reps: 2, lastReview: 100, stability: 6 }) };
  const incoming = { 'P.1::a': settled({ reps: 2, lastReview: 500, stability: 9 }), 'P.2::b': settled() };
  const localCopy = JSON.stringify(local);
  const result = mergeCards(local, incoming);
  assert.equal(result.store['P.1::a'].lastReview, 500);
  assert.equal(JSON.stringify(local), localCopy);
  assert.equal(result.added, 1);
  assert.equal(result.updated, 1);
});

check('an older copy of the same file cannot send a card backwards', () => {
  freshBrowser();
  addHighlight('P.1', 'a passage', 'why', 1000);
  const [card] = syncCards(DAY0);
  reviewCard(card.id, 3, DAY0);
  reviewCard(card.id, 3, DAY0 + 3 * DAY_MS);
  const studied = readCards();
  replaceCards({ [card.id]: settled({ reps: 1, stability: 0.4 }) });
  const { store } = mergeCards(readCards(), studied);
  replaceCards(store);
  assert.equal(readCards()[card.id].reps, 2);
});

check('a blocked store leaves the deck empty instead of throwing', () => {
  const window = new Window({ url: 'https://example.test/' });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('SecurityError: localStorage is disabled');
    },
  });
  globalThis.window = window;
  globalThis.document = window.document;
  assert.deepEqual(readCards(), {});
  assert.doesNotThrow(() => syncCards(DAY0));
  assert.equal(reviewCard('P.1::a', 3, DAY0), null);
  assert.doesNotThrow(() => replaceCards({ 'P.1::a': settled() }));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
