/**
 * When a card comes back: the FSRS-5 scheduler (`app/src/fsrs.ts`).
 *
 * A highlight is a good prompt only if it is asked again at the right moment — soon after it is
 * learned, later as it sticks, and again as soon as it is forgotten. That is what FSRS computes, and
 * this file is the published algorithm, not an approximation of it:
 *
 *   S₀(G) = w[G-1]
 *   D₀(G) = w₄ - e^(w₅·(G-1)) + 1
 *   ΔD(G) = -w₆·(G-3);  D′ = D + ΔD·(10-D)/9;  D″ = w₇·D₀(4) + (1-w₇)·D′
 *   R(t,S) = (1 + FACTOR·t/S)^DECAY,  DECAY = -0.5,  FACTOR = 19/81
 *   I(r,S) = S/FACTOR · (r^(1/DECAY) - 1)
 *   S′r = S·(1 + e^w₈·(11-D)·S^-w₉·(e^(w₁₀·(1-R))-1)·[w₁₅ if Hard]·[w₁₆ if Easy])
 *   S′f = w₁₁·D^-w₁₂·((S+1)^w₁₃ - 1)·e^(w₁₄·(1-R))
 *   S′same-day = S·e^(w₁₇·(G-3+w₁₈))
 *
 * Source: the FSRS algorithm wiki, <https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm>,
 * with the FSRS-5 default weights it publishes and the 90% retention the FSRS tutorial recommends for
 * most people (<https://github.com/open-spaced-repetition/fsrs4anki/blob/main/docs/tutorial.md>).
 *
 * Two deliberate departures, both stated where they happen: the weights are the published defaults
 * rather than a model fitted to this learner (there is no review history yet to fit), and the longest
 * interval is 365 days rather than the library's 36,500 — a course is measured in a term, and a card
 * promised back in 2060 is a card forgotten.
 *
 * Everything here is pure: a `CardSchedule` in, a new one out, `now` injected. No storage, no clock,
 * no `Date` in the logic - so `scripts/test_review.mjs` can pin the monotonicity that makes the
 * schedule trustworthy instead of printing four numbers and calling them plausible.
 */

/** Again, Hard, Good, Easy — the four answers a review offers, as FSRS numbers them. */
export type Grade = 1 | 2 | 3 | 4;

export interface CardSchedule {
  /** Days until retrievability falls to the desired retention, from the last review. */
  stability: number;
  /** 1..10: how hard this card has proved, moved by every answer and pulled toward the mean. */
  difficulty: number;
  /** When the card is next due, epoch milliseconds. */
  due: number;
  /** When it was last answered, or null for a card that has never been reviewed. */
  lastReview: number | null;
  reps: number;
  lapses: number;
  lastRating: Grade | null;
  /** The last interval that was scheduled, so the panel can say "back in 6 days" without maths. */
  intervalDays: number;
}

export const DAY_MS = 86_400_000;

/**
 * The FSRS-5 defaults, `w0`–`w18`, exactly as published. Not fitted: fitting needs a review history
 * this learner has not produced yet, and an invented weight would be worse than a published one.
 */
export const FSRS5_DEFAULT_WEIGHTS: readonly number[] = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395,
  0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
];

/** FSRS's forgetting curve constants: R(S, S) = 0.9 by construction. */
export const DECAY = -0.5;
export const FACTOR = 19 / 81;

/** 90% recall at review time, the value the FSRS tutorial calls fine for most people. */
export const DESIRED_RETENTION = 0.9;

/** A term, not a lifetime: an interval longer than this is a card nobody will see again. */
export const MAX_INTERVAL_DAYS = 365;

/** A card that has never been answered: due now, with no schedule behind it. */
export function newCard(now: number): CardSchedule {
  return {
    stability: 0,
    difficulty: 0,
    due: now,
    lastReview: null,
    reps: 0,
    lapses: 0,
    lastRating: null,
    intervalDays: 0,
  };
}

function clampDifficulty(value: number): number {
  return Math.min(10, Math.max(1, value));
}

/** S₀(G) = w[G-1]. */
export function initialStability(grade: Grade, weights: readonly number[] = FSRS5_DEFAULT_WEIGHTS): number {
  return Math.max(0.1, weights[grade - 1]);
}

/** D₀(G) = w₄ - e^(w₅·(G-1)) + 1, held in 1..10. */
export function initialDifficulty(grade: Grade, weights: readonly number[] = FSRS5_DEFAULT_WEIGHTS): number {
  return clampDifficulty(weights[4] - Math.exp(weights[5] * (grade - 1)) + 1);
}

/** The probability the card is still remembered after `elapsedDays`. */
export function retrievability(elapsedDays: number, stability: number): number {
  if (!(stability > 0)) return 0;
  return Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / stability, DECAY);
}

/**
 * The interval at which retrievability falls to `retention`.
 *
 * At the default 0.9 this is the stability itself, which is the check that the constants are right:
 * R(S, S) = (1 + 19/81)^-0.5 = 0.9.
 */
export function intervalDays(
  stability: number,
  retention: number = DESIRED_RETENTION
): number {
  if (!(stability > 0)) return 1;
  return (stability / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
}

/** D″: move by the answer, then pull toward the difficulty of an `Easy` first sighting. */
export function nextDifficulty(
  difficulty: number,
  grade: Grade,
  weights: readonly number[] = FSRS5_DEFAULT_WEIGHTS
): number {
  const delta = -weights[6] * (grade - 3);
  const moved = difficulty + delta * ((10 - difficulty) / 9);
  const reverted = weights[7] * initialDifficulty(4, weights) + (1 - weights[7]) * moved;
  return clampDifficulty(reverted);
}

/** S′r: stability after a successful recall, with the Hard penalty and the Easy bonus. */
export function stabilityAfterRecall(
  difficulty: number,
  stability: number,
  recall: number,
  grade: Grade,
  weights: readonly number[] = FSRS5_DEFAULT_WEIGHTS
): number {
  const hard = grade === 2 ? weights[15] : 1;
  const easy = grade === 4 ? weights[16] : 1;
  const growth =
    1 +
    Math.exp(weights[8]) *
      (11 - difficulty) *
      Math.pow(stability, -weights[9]) *
      (Math.exp(weights[10] * (1 - recall)) - 1) *
      hard *
      easy;
  return Math.max(0.1, stability * growth);
}

/** S′f: stability after a lapse — a new, short stability derived from the old one. */
export function stabilityAfterLapse(
  difficulty: number,
  stability: number,
  recall: number,
  weights: readonly number[] = FSRS5_DEFAULT_WEIGHTS
): number {
  const next =
    weights[11] *
    Math.pow(difficulty, -weights[12]) *
    (Math.pow(stability + 1, weights[13]) - 1) *
    Math.exp(weights[14] * (1 - recall));
  return Math.max(0.1, next);
}

/** S′ for a second review on the same day, where the forgetting curve has not moved yet. */
export function sameDayStability(
  stability: number,
  grade: Grade,
  weights: readonly number[] = FSRS5_DEFAULT_WEIGHTS
): number {
  return Math.max(0.1, stability * Math.exp(weights[17] * (grade - 3 + weights[18])));
}

/** Whole days between two instants, never negative. */
export function elapsedDays(from: number | null, now: number): number {
  if (from === null) return 0;
  return Math.max(0, (now - from) / DAY_MS);
}

/**
 * Answer a card.
 *
 * A card's first answer seeds stability and difficulty from the grade; every later one moves them by
 * the formulas above, using the retrievability at the moment of the answer — which is why an answer
 * given late (low R) grows stability more than the same answer given early.
 */
export function review(
  card: CardSchedule,
  grade: Grade,
  now: number,
  weights: readonly number[] = FSRS5_DEFAULT_WEIGHTS
): CardSchedule {
  let stability: number;
  let difficulty: number;
  if (card.reps === 0) {
    stability = initialStability(grade, weights);
    difficulty = initialDifficulty(grade, weights);
  } else {
    const recall = retrievability(elapsedDays(card.lastReview, now), card.stability);
    difficulty = nextDifficulty(card.difficulty, grade, weights);
    const sameDay = elapsedDays(card.lastReview, now) < 1;
    if (grade === 1) {
      stability = stabilityAfterLapse(card.difficulty, card.stability, recall, weights);
    } else if (sameDay) {
      stability = sameDayStability(card.stability, grade, weights);
    } else {
      stability = stabilityAfterRecall(card.difficulty, card.stability, recall, grade, weights);
    }
  }
  const days = Math.min(
    MAX_INTERVAL_DAYS,
    Math.max(1, Math.round(intervalDays(stability, DESIRED_RETENTION)))
  );
  return {
    stability,
    difficulty,
    due: now + days * DAY_MS,
    lastReview: now,
    reps: card.reps + 1,
    lapses: card.lapses + (grade === 1 ? 1 : 0),
    lastRating: grade,
    intervalDays: days,
  };
}

/** What a card looks like in a list: how long until it is due, and how well it is remembered now. */
export function cardStatus(card: CardSchedule, now: number): {
  dueInDays: number;
  recall: number;
  reviewed: boolean;
} {
  const elapsed = elapsedDays(card.lastReview, now);
  return {
    dueInDays: Math.max(0, Math.round((card.due - now) / DAY_MS)),
    recall: card.reps > 0 ? retrievability(elapsed, card.stability) : 0,
    reviewed: card.reps > 0,
  };
}
