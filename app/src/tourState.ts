/**
 * Where the first-run tour remembers itself (`app/src/tourState.ts`).
 *
 * Three questions, and each one has a wrong answer that costs a learner:
 *
 * - **Does the tour open on its own?** Only for someone with nothing saved. A returning learner is
 *   interrupted by a tour of the first lesson they already finished, so progress — any verified or
 *   completed lesson, or a draft — counts as "been here".
 * - **A deep link into a later lesson?** No tour: the six steps describe *this* lesson and the
 *   reader chose another one. A chip offers it instead, and it is the learner's call.
 * - **Closed partway, or reloaded mid-tour?** A chip that names the step it would resume at, drawn
 *   once. Never a card that reappears over the editor.
 *
 * The record is deliberately small (`version`, `status`, `stepIndex`, `chipShown`): it is carried in
 * a backup archive and, one day, an account, so every field has to survive a round trip and an
 * older build. A store that cannot be read is treated as "never taken", which offers the tour again
 * rather than showing half of it.
 */

import {
  FIRST_LESSON_TOUR,
  TOUR_STEP_COUNT,
  TOUR_VERSION,
  initialTourState,
  type FirstRunStep,
  type TourState,
  type TourStatus,
} from './tour.ts';

export const STORAGE_KEY_TOUR = 'mechalab_tour_v1';

const STATUSES: readonly TourStatus[] = ['not-started', 'active', 'dismissed', 'completed'];

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    // A browser that throws on access (third-party iframe, hardened privacy mode) still gets the
    // tour this visit; it just cannot remember it.
    return null;
  }
}

/** A stored record, or the initial one. Every field is validated, because a store is not trusted. */
export function readTour(): TourState {
  const store = storage();
  if (!store) return initialTourState();
  try {
    const raw = store.getItem(STORAGE_KEY_TOUR);
    if (!raw) return initialTourState();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return initialTourState();
    const value = parsed as Partial<TourState>;
    // A different version is a tour this build cannot finish for the reader: start it again rather
    // than resume a step index that now means a different step.
    if (value.version !== TOUR_VERSION) return initialTourState();
    const status = STATUSES.includes(value.status as TourStatus)
      ? (value.status as TourStatus)
      : 'not-started';
    const index = Number.isInteger(value.stepIndex) ? Number(value.stepIndex) : 0;
    return {
      version: TOUR_VERSION,
      status,
      stepIndex: index >= 0 && index < TOUR_STEP_COUNT ? index : 0,
      chipShown: value.chipShown === true,
      updatedAt: Number.isFinite(value.updatedAt) ? Number(value.updatedAt) : Date.now(),
    };
  } catch {
    return initialTourState();
  }
}

/**
 * Remember a record and return what to render.
 *
 * The argument comes back rather than the stored value, for the same reason the layout preset does:
 * with storage blocked there is nothing stored, and this visit still has to work.
 */
export function writeTour(state: TourState): TourState {
  const store = storage();
  if (store) {
    try {
      store.setItem(STORAGE_KEY_TOUR, JSON.stringify(state));
    } catch {
      // Blocked or full: the tour lasts this visit only.
    }
  }
  return state;
}

/** What to offer on this visit, given what the browser already holds. */
export type TourOffer = 'tour' | 'chip' | 'none';

export interface TourContext {
  /** The lesson on screen is the first entry in the runner. */
  onFirstLesson: boolean;
  /** Anything saved that means this is not someone's first visit. */
  hasProgress: boolean;
}

export function tourOffer(state: TourState, context: TourContext): TourOffer {
  if (state.status === 'active') {
    // The first step is the welcome, which nobody closed on purpose: an `active` record still on step
    // 1 is a page that was reloaded before the tour began, so it opens rather than chipping.
    if (state.stepIndex === 0) return 'tour';
    // Mid-tour and the page was left: a chip naming the step, once.
    return state.chipShown ? 'none' : 'chip';
  }
  if (state.status !== 'not-started') return 'none';
  if (context.hasProgress) return 'none';
  return context.onFirstLesson ? 'tour' : 'chip';
}

/** `Resume tour (step 3 of 6)` — said in the learner's words, not as an index. */
export function resumeLabel(state: TourState): string {
  const index = Math.min(Math.max(state.stepIndex, 0), TOUR_STEP_COUNT - 1);
  return `Resume tour (step ${index + 1} of ${TOUR_STEP_COUNT})`;
}

/** The step the chip's link opens at. */
export function stepForResume(state: TourState): FirstRunStep {
  return FIRST_LESSON_TOUR[Math.min(Math.max(state.stepIndex, 0), TOUR_STEP_COUNT - 1)];
}

/**
 * A restore merges two records without ever moving a learner backwards.
 *
 * Completed beats dismissed beats active beats never-taken: a backup taken after the tour was
 * finished must not reopen it on the machine it is restored to, and a backup from before must not
 * undo the "seen it" flag this browser already has. Between two active records the further step
 * wins, because that is the one that resumes nearer the end.
 */
export function mergeTourStates(stored: TourState, incoming: TourState): TourState {
  const rank: Record<TourStatus, number> = { 'not-started': 0, active: 1, dismissed: 2, completed: 3 };
  if (incoming.version !== TOUR_VERSION) return stored;
  if (rank[incoming.status] > rank[stored.status]) return incoming;
  if (rank[incoming.status] < rank[stored.status]) return stored;
  if (incoming.status !== 'active') return stored;
  return incoming.stepIndex > stored.stepIndex
    ? { ...incoming, chipShown: stored.chipShown && incoming.chipShown }
    : stored;
}
