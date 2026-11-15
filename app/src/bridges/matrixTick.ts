/**
 * `dt` lives in the tick, never in the table (`app/src/bridges/matrixTick.ts`).
 *
 * Lesson R.4's Bridge Notes gives the habit that survives every later state-space page: `A` holds
 * rates per second, and the tick converts them to changes, which is why the same `A` works at 1 kHz
 * and 100 Hz. Fold `dt` into a coefficient and the table is only true at the rate it was typed at —
 * the page's "so a length mismatch is a table error, not a maths mystery" is the same lesson in
 * shapes.
 *
 * The card prints the clean tick beside the baked-in one, so the 10× error at 100 Hz is visible
 * without the learner having to derive it.
 */
import type { LabSpec, LabValues } from './bridgeLab.ts';
import { numberAt } from './bridgeLab.ts';

/** The reference rate the page names. */
export const FAST_HZ = 1000;
export const SLOW_HZ = 100;

/** `Δq = qd · dt`: the tick's only job. */
export function deltaQ(velocity: number, dt: number): number {
  return velocity * dt;
}

/** `Δqd = −(B/J) · qd · dt`. */
export function deltaQd(velocity: number, dt: number, bOverJ: number): number {
  return -bOverJ * velocity * dt;
}

/** A table with the 1 kHz `dt` baked in: the coefficient is `rad per tick`, so it never moves again. */
export function bakedDelta(velocity: number): number {
  return velocity / FAST_HZ;
}

const dtOf = (values: LabValues) => numberAt(values, 'dt_ms', 1) / 1000;
const bjOf = (values: LabValues) => numberAt(values, 'b_over_j', 2);
const qdOf = (values: LabValues) => numberAt(values, 'qd', 1);

export const matrixTickLab: LabSpec = {
  testid: 'bridge-matrix-tick',
  title: 'The coefficient has no clock in it',
  prompt: 'The same A works at 1 kHz and 100 Hz because dt is multiplied in the tick.',
  controls: [
    { kind: 'range', id: 'dt_ms', label: 'tick', unit: 'ms', min: 1, max: 20, step: 1, start: 1 },
    { kind: 'range', id: 'b_over_j', label: 'B / J', unit: '1/s', min: 0, max: 10, step: 0.5, start: 2 },
    { kind: 'range', id: 'qd', label: 'velocity', unit: 'rad/s', min: 0, max: 5, step: 0.1, start: 1 },
  ],
  pair: { wrong: 'baked', right: 'dq', wrongLabel: 'dt baked in', rightLabel: 'clean tick' },
  readouts: [
    {
      id: 'dq',
      label: 'Δq',
      text: (values) => deltaQ(qdOf(values), dtOf(values)).toFixed(5),
      unit: 'rad',
      note: (values) => `${qdOf(values)} × ${dtOf(values).toFixed(3)}`,
    },
    {
      id: 'baked',
      label: 'Δq, baked',
      text: (values) => bakedDelta(qdOf(values)).toFixed(5),
      unit: 'rad',
      note: () => 'A carrying the 1 ms step: the same Δq at every tick',
    },
    {
      id: 'dqd',
      label: 'Δqd',
      text: (values) => deltaQd(qdOf(values), dtOf(values), bjOf(values)).toFixed(5),
      unit: 'rad/s',
      note: () => '−(B/J) · qd · dt',
    },
    {
      id: 'shape',
      label: 'Shapes',
      text: () => '2 × 2 A, 2 × 1 B, 2-slot x',
      note: () => 'checked before the arithmetic is trusted',
    },
    {
      id: 'rates',
      label: 'Rates this A fits',
      text: () => `${FAST_HZ} Hz and ${SLOW_HZ} Hz`,
      note: () => 'dt is the tick, so both are the same table',
    },
  ],
  mark: {
    readout: 'dq',
    value: (values) => deltaQ(qdOf(values), dtOf(values)),
    ladder: [0.001, 0.002, 0.01, 0.02, 0.1],
    tolerance: 0.0005,
    format: (target) => target.toFixed(3),
  },
  verdict: (values) =>
    `At ${(dtOf(values) * 1000).toFixed(0)} ms, Δq is ${deltaQ(qdOf(values), dtOf(values)).toFixed(
      5
    )} rad. The baked table gives ${bakedDelta(qdOf(values)).toFixed(
      5
    )} — same table, wrong clock.`,
};
