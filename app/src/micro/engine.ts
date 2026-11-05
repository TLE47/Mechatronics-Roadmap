/**
 * Micro-learning routing, mastery and scheduling (`app/src/micro/engine.ts`).
 *
 * Everything here is pure: an existing concept state plus one event becomes the next state. That is
 * what makes the reducer safe to re-apply to the latest stored state after a conflict, and what lets
 * the Node suite inject a clock instead of sleeping for a day.
 *
 * The rules, in one place:
 *
 * - 2/2 diagnostics: provisional, skip-eligible, review due tomorrow.
 * - 1/2 or 0/2 plus a correct practice: provisional, not skip-eligible until a Review or Challenge
 *   succeeds; due tomorrow.
 * - a failed practice: still learning, due tomorrow.
 * - successful Review: consolidated, skip-eligible, 3/7/14/30-day ladder.
 * - successful Challenge: consolidated, skip-eligible, due in 14 days.
 * - failed Review or Challenge: mastery and skip eligibility are kept, success resets, due tomorrow.
 * - a source revision mismatch marks mastery stale and clears skip eligibility; it never deletes it.
 */

import type { MicroConcept, MicroQuestion } from '../data/microLessons.ts';
import {
  MICRO_DAY_MS,
  MICRO_REVIEW_SIZE,
  type MicroConceptState,
  type MicroEvent,
  type MicroMastery,
  type MicroStore,
} from './types.ts';

export const REVIEW_INTERVALS_DAYS = [3, 7, 14, 30] as const;
export const CHALLENGE_SUCCESS_DAYS = 14;
export const FAILURE_RETRY_DAYS = 1;
export const PROVISIONAL_DUE_DAYS = 1;

export function emptyConceptState(conceptId: string, revision = 0): MicroConceptState {
  return {
    conceptId,
    revision,
    mastery: 'learning',
    stale: false,
    skipEligible: false,
    successCount: 0,
    dueAt: null,
    lastReviewedAt: null,
    learnCompletedAt: null,
    diagnosticCorrect: null,
    practiceCorrect: null,
  };
}

export function intervalDays(successCount: number): number {
  const index = Math.max(0, Math.min(REVIEW_INTERVALS_DAYS.length - 1, Math.round(successCount) - 1));
  return REVIEW_INTERVALS_DAYS[index] ?? REVIEW_INTERVALS_DAYS[0];
}

export function nextReviewAt(now: number, successCount: number): number {
  return now + intervalDays(successCount) * MICRO_DAY_MS;
}

export function isDue(state: MicroConceptState | undefined, now: number): boolean {
  return Boolean(state && state.dueAt !== null && state.dueAt <= now);
}

export function isStale(state: MicroConceptState | undefined, concept: MicroConcept): boolean {
  if (!state) return false;
  return state.revision !== concept.revision;
}

/** A concept is noteworthy when it has evidence or is stale; untouched states stay out of the list. */
export function hasEvidence(state: MicroConceptState | undefined): boolean {
  return Boolean(state && (state.learnCompletedAt !== null || state.lastReviewedAt !== null));
}

export function applyMicroEvent(
  previous: MicroConceptState | undefined,
  event: MicroEvent,
  concept: MicroConcept,
  now: number = event.timestamp
): MicroConceptState {
  const state: MicroConceptState = previous
    ? { ...previous }
    : emptyConceptState(concept.id, concept.revision);
  const revisionMismatch = event.sourceRevision !== concept.revision;
  if (revisionMismatch) {
    state.stale = true;
    state.skipEligible = false;
  }

  if (event.activity === 'learn') {
    const score = (event.diagnosticCorrect ?? 0) as 0 | 1 | 2;
    const practice = event.practiceCorrect ?? null;
    state.diagnosticCorrect = score;
    state.practiceCorrect = practice;
    state.learnCompletedAt = now;
    state.revision = event.sourceRevision;
    state.stale = revisionMismatch;
    state.dueAt = now + PROVISIONAL_DUE_DAYS * MICRO_DAY_MS;
    state.lastReviewedAt = null;
    if (score === 2) {
      state.mastery = 'provisional';
      state.skipEligible = !revisionMismatch;
      state.successCount = 0;
    } else if (practice === true && !revisionMismatch) {
      state.mastery = 'provisional';
      state.skipEligible = false;
      state.successCount = 0;
    } else {
      state.mastery = 'learning';
      state.skipEligible = false;
      state.successCount = 0;
    }
    return state;
  }

  if (event.activity === 'review') {
    const total = Math.max(1, event.totalQuestions ?? MICRO_REVIEW_SIZE);
    const correct = Math.max(0, Math.min(total, event.correctCount ?? 0));
    const success = correct === total;
    state.revision = event.sourceRevision;
    state.lastReviewedAt = now;
    if (success) {
      state.mastery = revisionMismatch ? state.mastery : 'consolidated';
      state.stale = revisionMismatch ? true : false;
      state.skipEligible = !revisionMismatch;
      state.successCount = Math.max(0, state.successCount) + 1;
      state.dueAt = nextReviewAt(now, state.successCount);
    } else {
      // A wrong answer is information, not erasure: the mastery and the skip stay, the ladder resets.
      state.successCount = 0;
      state.dueAt = now + FAILURE_RETRY_DAYS * MICRO_DAY_MS;
    }
    return state;
  }

  // Challenge.
  const success = event.correct === true;
  state.revision = event.sourceRevision;
  state.lastReviewedAt = now;
  if (success) {
    state.mastery = revisionMismatch ? state.mastery : 'consolidated';
    state.stale = revisionMismatch ? true : false;
    state.skipEligible = !revisionMismatch;
    state.successCount = Math.max(1, state.successCount);
    state.dueAt = now + CHALLENGE_SUCCESS_DAYS * MICRO_DAY_MS;
  } else {
    state.successCount = 0;
    state.dueAt = now + FAILURE_RETRY_DAYS * MICRO_DAY_MS;
  }
  return state;
}

export function reviewSet(concept: MicroConcept, attempt: number): MicroQuestion[] {
  const pool = concept.reviewPool;
  if (pool.length <= MICRO_REVIEW_SIZE) return pool.slice(0, MICRO_REVIEW_SIZE);
  const start = ((Math.trunc(attempt) % pool.length) + pool.length) % pool.length;
  return Array.from({ length: MICRO_REVIEW_SIZE }, (_, offset) => pool[(start + offset) % pool.length]);
}

export function allReviewSets(concept: MicroConcept): string[][] {
  return Array.from({ length: concept.reviewPool.length }, (_, attempt) =>
    reviewSet(concept, attempt).map((question) => question.id)
  );
}

export function normalizeShortAnswer(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ');
}

export function gradeAnswer(question: MicroQuestion, value: string): boolean {
  if (question.type === 'short') {
    const normalized = normalizeShortAnswer(value);
    return (question.acceptedAnswers ?? []).some((answer) => normalizeShortAnswer(answer) === normalized);
  }
  return Boolean(question.answerId) && question.answerId === value;
}

export function answerState(question: MicroQuestion, value: string): boolean {
  return gradeAnswer(question, value);
}

export function dueConceptIds(store: MicroStore, concepts: MicroConcept[], now: number): string[] {
  return concepts.filter((concept) => isDue(store.concepts[concept.id], now)).map((concept) => concept.id);
}

/**
 * The next Learn step: the first concept with no Learn evidence yet, then the first due review.
 *
 * A provisional concept is deliberately not offered again here: it already has a scheduled review,
 * and repeating its Learn page would hide the six concepts that have not been met. The list below
 * still lets a learner revisit any concept by hand.
 */
export function nextConceptId(store: MicroStore, concepts: MicroConcept[], now: number): string | null {
  for (const concept of concepts) {
    const state = store.concepts[concept.id];
    if (!state || state.learnCompletedAt === null) return concept.id;
  }
  return dueConceptIds(store, concepts, now)[0] ?? null;
}

export function statusLabel(state: MicroConceptState | undefined, concept: MicroConcept, now: number): string {
  if (!state) return 'Not started';
  if (isStale(state, concept)) return 'Changed — review again';
  if (isDue(state, now)) return 'Due now';
  if (state.mastery === 'consolidated') return 'Consolidated';
  if (state.mastery === 'provisional') return 'Provisional';
  return 'Learning';
}

export function masteryLabel(mastery: MicroMastery): string {
  if (mastery === 'consolidated') return 'Consolidated';
  if (mastery === 'provisional') return 'Provisional';
  return 'Learning';
}
