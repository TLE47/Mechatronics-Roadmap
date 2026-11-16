/**
 * Whether a mark may score, as arithmetic (`app/src/bridges/markArmed.ts`).
 *
 * A landing is a claim about what the learner *did*, so it cannot be decided from the value alone.
 * The card paints a dial at some starting position; if that position happens to be the first rung —
 * P.9's answer dial sits on 63.2 % at one time constant, which is exactly its first mark — a rule
 * that only compared numbers would count the first paint as a landing, advance the ladder and
 * announce "landed 63.2" to a screen reader before anyone touched the card. That is the bug this
 * file exists to make impossible to reintroduce.
 *
 * The rule is a latch:
 *
 * - **armed** means the value has left the landing window since the last score, so arriving inside it
 *   is a move the learner made;
 * - a card opens **disarmed**, so a value that is already on the mark scores nothing;
 * - a landing disarms again, so a drag that rests on a mark scores once rather than every frame.
 *
 * Pure, so `scripts/test_bridge_visuals.mjs` can grade the sequence without a browser or a render,
 * and `useMarkChase` only wires it to state and sound.
 */

export interface MarkArmState {
  /** Whether the value has left the window, i.e. whether arriving inside it may score. */
  armed: boolean;
  /** True on the frame the value arrives inside the window while armed. */
  land: boolean;
}

/** The window is sympathetically wide on the way out: a landing must not flicker on a wobble. */
const LEAVE_FACTOR = 2.5;

export function nextMarkState(
  armed: boolean,
  value: number,
  target: number,
  tolerance: number
): MarkArmState {
  // A broken reading is not a landing, and it must not silently arm the latch either.
  if (!Number.isFinite(value) || !Number.isFinite(target) || !Number.isFinite(tolerance) || tolerance <= 0) {
    return { armed: false, land: false };
  }
  const distance = Math.abs(value - target);
  if (!armed) {
    return { armed: distance > tolerance * LEAVE_FACTOR, land: false };
  }
  if (distance <= tolerance) return { armed: false, land: true };
  return { armed: true, land: false };
}
