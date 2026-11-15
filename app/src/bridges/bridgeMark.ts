/**
 * The mark ladder every Bridge lab can draw (`app/src/bridges/bridgeMark.ts`).
 *
 * P.9's card proved the loop: a target is drawn, sweeping onto it flashes the card and advances a
 * five-mark chase, and the fifth landing is a small arpeggio. All of that was true of *that* card
 * only because the ladder lived inside it. Every lesson whose claim is a number wants the same
 * loop — land the sag on 0.150 rad, land the framing on 86.8 %, land the torque on 0.981 N·m — so
 * the ladder, its tightening tolerance and its storage move here and the shell draws them once.
 *
 * The numbers are the page's own, in the order the page prints them (`LabMark.ladder`): the first
 * landing is a worked example the learner has just read, and the fifth is the same claim at a
 * tolerance that has to be aimed. Tolerances tighten linearly to a fifth by the fifth hit, which is
 * why a ladder is a game rather than a checklist.
 *
 * Storage is P.9's format under a new key, and a store that refuses costs the reader nothing. The
 * old P.9 key is still read once, so a visitor who landed three marks before this file existed keeps
 * them.
 *
 * Pure functions over a `Storage`-shaped object, so `scripts/test_bridge_visuals.mjs` can grade the
 * ladder, the tolerance and the migration without a browser.
 */

import { landed, store, type Chase, type Store } from './bridgeChase.ts';

/** The key the shared ladder is remembered under. */
export const MARK_KEY = 'mechalab_bridge_chase_v1';

/** P.9's original key: read once, so progress made before the ladder was shared is not lost. */
export const LEGACY_MARK_KEY = 'mechalab_bridge_p9_v1';

/** How much of the first tolerance survives to the fifth mark. */
const TIGHTEN = 0.2;

/** The clamp the chase uses, the same shape as `bridgeChase`'s: progress, not a high score table. */
const CAP = 100;

const count = (value: unknown): number => {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? Math.min(CAP, Math.max(0, number)) : 0;
};

function parse(raw: string | null): Chase {
  try {
    const record = JSON.parse(raw ?? 'null') as Partial<Chase> | null;
    return { marks: count(record?.marks), best: count(record?.best) };
  } catch {
    return { marks: 0, best: 0 };
  }
}

/** Which rung of the ladder this many landings is on. The ladder repeats after its last number. */
export function stepAt(ladder: readonly number[], marks: number): number {
  if (ladder.length === 0) return 0;
  return Math.max(0, Math.floor(marks)) % ladder.length;
}

/** The number this rung asks for. Throws on an empty ladder: a mark with no target is a bug. */
export function targetAt(ladder: readonly number[], marks: number): number {
  if (ladder.length === 0) throw new Error('a mark ladder needs at least one target');
  return ladder[stepAt(ladder, marks)];
}

/**
 * The tolerance this rung is judged at: the first is the caller's, the fifth is a fifth of it.
 *
 * Linear rather than exponential because the difficulty should be legible: 1 %, 0.8 %, 0.6 %,
 * 0.4 %, 0.2 % of the readout's range is a story a learner can feel, and a test can pin.
 */
export function toleranceAt(tolerance: number, step: number): number {
  const rung = Math.min(4, Math.max(0, Math.floor(step)));
  return tolerance * (1 - TIGHTEN * rung);
}

/** Whether a value is on the mark, inclusive at the edge so a step that lands exactly counts. */
export function onMark(value: number, target: number, tolerance: number): boolean {
  return Number.isFinite(value) && Number.isFinite(target) && Math.abs(value - target) <= tolerance;
}

/** How far along the ladder, and the best run reached. A corrupt or blocked store reads as zeros. */
export function readMark(to: Store | null = store()): Chase {
  if (!to) return { marks: 0, best: 0 };
  try {
    const current = to.getItem(MARK_KEY);
    if (current !== null) return parse(current);
    return parse(to.getItem(LEGACY_MARK_KEY));
  } catch {
    return { marks: 0, best: 0 };
  }
}

/** Remember progress. A store that refuses is not an error: the card still works this visit. */
export function writeMark(chase: Chase, to: Store | null = store()): void {
  try {
    to?.setItem(MARK_KEY, JSON.stringify({ marks: count(chase.marks), best: count(chase.best) }));
  } catch {
    // Quota, private mode, a blocked context: all of them mean "keep it for this visit".
  }
}

/** Forget the ladder, for the card's own reset. Removes the old key too, so reset means reset. */
export function clearMark(to: Store | null = store()): void {
  try {
    to?.removeItem(MARK_KEY);
    to?.removeItem(LEGACY_MARK_KEY);
  } catch {
    // Same as write: a blocked store keeps nothing and hides nothing.
  }
}

/** One landing: the count advances and the best run remembers it (`bridgeChase.landed`). */
export function advanceMark(chase: Chase): Chase {
  return landed(chase);
}
