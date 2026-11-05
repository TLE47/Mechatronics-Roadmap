/**
 * Runtime types for the micro-learning store (`app/src/micro/types.ts`).
 *
 * The generated catalogue is data; these are the only shapes the store and engine exchange. Keeping
 * them separate is what lets `scripts/test_micro.mjs` exercise mastery, scheduling and migration
 * under Node without a browser or React.
 */

import type { MicroConcept, MicroQuestion } from '../data/microLessons.ts';

export type MicroActivity = 'learn' | 'review' | 'challenge';
export type MicroMastery = 'learning' | 'provisional' | 'consolidated';

export interface MicroConceptState {
  conceptId: string;
  /** The source revision the last evidence was filed against. */
  revision: number;
  mastery: MicroMastery;
  /** A meaningful objective changed: mastery is kept, skip eligibility is not. */
  stale: boolean;
  /** Explicit, so pruning the event log can never infer it away. */
  skipEligible: boolean;
  /** Successful reviews since the last failure; drives the 3/7/14/30-day ladder. */
  successCount: number;
  dueAt: number | null;
  lastReviewedAt: number | null;
  learnCompletedAt: number | null;
  diagnosticCorrect: 0 | 1 | 2 | null;
  practiceCorrect: boolean | null;
}

export interface MicroEvent {
  eventId: string;
  attemptId: string;
  conceptId: string;
  activity: MicroActivity;
  timestamp: number;
  /** Adjusted: each inactivity gap is capped at 90 s. */
  elapsedSeconds: number;
  /** Wall-clock while the activity was visible. */
  visibleSeconds: number;
  sourceRevision: number;
  diagnosticCorrect?: 0 | 1 | 2;
  diagnosticTotal?: 2;
  practiceCorrect?: boolean | null;
  correctCount?: number;
  totalQuestions?: number;
  correct?: boolean;
}

export interface MicroStore {
  version: 1;
  /** Compare-and-swap counter: every accepted write increments it. */
  revision: number;
  concepts: Record<string, MicroConceptState>;
  /** Bounded, newest last. Aggregates in `concepts` survive pruning. */
  events: MicroEvent[];
  updatedAt: number;
}

export interface MicroAnswer {
  question: MicroQuestion;
  value: string;
  correct: boolean;
}

export interface MicroCatalogLike {
  concepts: MicroConcept[];
}

export const MICRO_STORE_VERSION = 1;
export const MICRO_STORAGE_KEY = 'mechalab_micro_progress_v1';
export const MICRO_SETTINGS_KEY = 'mechalab_micro_enabled_v1';
export const MICRO_EVENT_LIMIT = 240;
export const MICRO_DAY_MS = 24 * 60 * 60 * 1000;
export const MICRO_INACTIVITY_CAP_MS = 90 * 1000;
export const MICRO_REVIEW_SIZE = 2;
