/**
 * The review cards, and what each one's schedule is (`app/src/studyCards.ts`).
 *
 * A card is a highlight the learner explained: the quote asks "why did you keep this?", and the
 * comment answers. A highlight with no comment is a passage marked, not a question set, so it does
 * not become a card — that is the one rule that decides what is reviewable, and it keeps the deck
 * honest rather than padding it with prompts nobody can answer.
 *
 * The card's *existence* is derived, its *schedule* is stored. Every read builds the list from the
 * notes store and joins it to the schedules here, which means:
 *
 * - deleting a highlight deletes its card (the join finds nothing), and clearing a comment retires
 *   it, with no second delete path to keep in step;
 * - re-pinning the same passage keeps its schedule, because the id is the lesson and the quote;
 * - a schedule left behind by a highlight that is gone is pruned on the next sync, so the store
 *   cannot grow by forgetting.
 *
 * The scheduling itself is [`app/src/fsrs.ts`](fsrs.ts); this file only stores what it returns.
 * Never throws: blocked or full storage leaves the deck unreadable for this session, not the lesson
 * broken.
 */

import { bulkStorage } from './bulkStorage.ts';
import { newCard, review, type CardSchedule, type Grade } from './fsrs.ts';
import { readStudy, type StudyStore } from './studyNotes.ts';

export const STORAGE_KEY_CARDS = 'mechalab_study_cards_v1';
/** 25 lessons x 20 highlights is the notes cap; the deck can never be larger than its sources. */
export const MAX_CARDS = 500;

/** Lesson id and quote, with the quote escaped: an id that cannot collide with another card's. */
export function cardId(lessonId: string, quote: string): string {
  return `${lessonId}::${quote}`;
}

export interface StudyCard {
  id: string;
  lesson: string;
  quote: string;
  /** What the learner said about it: the answer side. Cards always have one. */
  comment: string;
  schedule: CardSchedule;
}

/** Card id -> schedule. The only thing persisted here. */
export type CardStore = Record<string, CardSchedule>;

function storage(): Storage | null {
  // IndexedDB when the browser has it (`bulkStorage.ts`), the bucket otherwise.
  return bulkStorage();
}

function asSchedule(value: unknown): CardSchedule | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Record<string, unknown>;
  const number = (key: string) => {
    const raw = Number(entry[key]);
    return Number.isFinite(raw) && raw >= 0 ? raw : null;
  };
  const stability = number('stability');
  const due = number('due');
  const reps = number('reps');
  if (stability === null || due === null || reps === null) return null;
  const lastReview = number('lastReview');
  const lastRating = Number(entry.lastRating);
  return {
    stability,
    difficulty: Math.min(10, Math.max(1, Number(entry.difficulty) || 1)),
    due,
    lastReview,
    reps: Math.round(reps),
    lapses: Math.round(number('lapses') ?? 0),
    lastRating: lastRating === 1 || lastRating === 2 || lastRating === 3 || lastRating === 4 ? lastRating : null,
    intervalDays: Math.round(number('intervalDays') ?? 0),
  };
}

/** A store written by another version reads as the part of itself that still parses. */
export function parseCards(raw: string | null): CardStore {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const store: CardStore = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      const schedule = asSchedule(value);
      if (schedule && id.includes('::')) store[id] = schedule;
    }
    return store;
  } catch {
    return {};
  }
}

export function readCards(): CardStore {
  const store = storage();
  if (!store) return {};
  try {
    return parseCards(store.getItem(STORAGE_KEY_CARDS));
  } catch {
    return {};
  }
}

function writeCards(store: Storage, cards: CardStore): void {
  const ids = Object.keys(cards);
  if (ids.length > MAX_CARDS) {
    // Drop the cards that have not been reviewed in longest, so a deck that outgrows its cap loses
    // the schedule of the card nobody answers rather than the one being worked through.
    ids
      .sort((a, b) => (cards[a].lastReview ?? 0) - (cards[b].lastReview ?? 0))
      .slice(0, ids.length - MAX_CARDS)
      .forEach((id) => delete cards[id]);
  }
  try {
    store.setItem(STORAGE_KEY_CARDS, JSON.stringify(cards));
  } catch {
    // Blocked or full: the panel shows the cards from the notes store and the schedule is lost.
  }
}

/**
 * The cards a set of notes currently implies.
 *
 * Pure, so the join is testable: only highlights with a comment are cards, and a card with no stored
 * schedule is new (due now) rather than absent.
 */
export function cardsFromStudy(study: StudyStore, schedules: CardStore, now: number): StudyCard[] {
  const cards: StudyCard[] = [];
  for (const [lesson, entry] of Object.entries(study)) {
    for (const highlight of entry.highlights) {
      if (!highlight.comment) continue;
      const id = cardId(lesson, highlight.quote);
      cards.push({
        id,
        lesson,
        quote: highlight.quote,
        comment: highlight.comment,
        schedule: schedules[id] ?? newCard(now),
      });
    }
  }
  return cards.sort((a, b) => a.schedule.due - b.schedule.due || a.id.localeCompare(b.id));
}

/**
 * Write a whole deck back, after a restore merged one in.
 *
 * The cap and the eviction order live in `writeCards`, so a restored deck goes through the same door a
 * studied one does.
 */
export function replaceCards(cards: CardStore): void {
  const store = storage();
  if (store) writeCards(store, { ...cards });
}

/** Every card, soonest due first. */
export function readCardList(now: number = Date.now()): StudyCard[] {
  return cardsFromStudy(readStudy(), readCards(), now);
}

/**
 * Add schedules for new cards and prune schedules whose highlight is gone.
 *
 * Called when the deck is opened rather than on every keystroke: the notes store changes far more
 * often than the deck is read, and a write per keystroke would spend the bucket on bookkeeping.
 */
export function syncCards(now: number = Date.now()): StudyCard[] {
  const store = storage();
  const study = readStudy();
  const schedules = readCards();
  const cards = cardsFromStudy(study, schedules, now);
  const live = new Set(cards.map((card) => card.id));
  let changed = false;
  for (const card of cards) {
    if (!schedules[card.id]) {
      schedules[card.id] = newCard(now);
      changed = true;
    }
  }
  for (const id of Object.keys(schedules)) {
    if (!live.has(id)) {
      delete schedules[id];
      changed = true;
    }
  }
  if (store && changed) writeCards(store, schedules);
  return cards;
}

/** The cards due at `now`: the ones the panel offers to review. */
export function dueCards(cards: StudyCard[], now: number = Date.now()): StudyCard[] {
  return cards.filter((card) => card.schedule.due <= now);
}

/** When the next card comes back, if any card is scheduled ahead. */
export function nextDueAt(cards: StudyCard[]): number | null {
  if (cards.length === 0) return null;
  return cards.reduce((soonest, card) => Math.min(soonest, card.schedule.due), Number.POSITIVE_INFINITY);
}

/** Answer one card and store its new schedule. Returns it, or null when the card is not a card. */
export function reviewCard(id: string, grade: Grade, now: number = Date.now()): CardSchedule | null {
  const store = storage();
  if (!store) return null;
  const cards = cardsFromStudy(readStudy(), readCards(), now);
  const card = cards.find((entry) => entry.id === id);
  if (!card) return null;
  const next = review(card.schedule, grade, now);
  const schedules = readCards();
  schedules[id] = next;
  writeCards(store, schedules);
  return next;
}

/**
 * Merge a restored deck into this one: the more-reviewed schedule wins.
 *
 * `reps` is the honest measure of which machine knows more about a card — a schedule that has been
 * answered five times is worth more than one answered once, whatever their dates say. A tie falls
 * back to the later review, so two copies of the same file cannot flip a card backwards.
 */
export function mergeCards(
  local: CardStore,
  incoming: CardStore
): { store: CardStore; added: number; updated: number } {
  const store: CardStore = { ...local };
  let added = 0;
  let updated = 0;
  for (const [id, schedule] of Object.entries(incoming)) {
    const here = store[id];
    if (!here) {
      store[id] = schedule;
      added += 1;
      continue;
    }
    if (
      schedule.reps > here.reps ||
      (schedule.reps === here.reps && (schedule.lastReview ?? 0) > (here.lastReview ?? 0))
    ) {
      store[id] = schedule;
      updated += 1;
    }
  }
  return { store, added, updated };
}
