/**
 * Left and right bracket the area; the trapezoid halves the gap (`app/src/bridges/accumulate.ts`).
 *
 * Lesson R.2's Bridge Notes names the two halves of an integrator: the sampling rule is a design
 * choice with a measurable error — left and right bracket the true area and the trapezoid replaces
 * `v * dt` with `dt/2 (v_k + v_{k-1})` — and the integrator has no opinion about the truth, so a bias
 * is added forever.
 *
 * The card prints all three sums from one ramp, so "halves the gap" is a number rather than a claim,
 * and the drift readout makes the second consequence just as concrete.
 */
import type { LabSpec, LabValues } from './bridgeLab.ts';
import { choiceAt, numberAt } from './bridgeLab.ts';

/** The page's bias example. */
export const BIAS = 0.05;

/** A ramp starts at this velocity and rises at 1 m/s². */
export const V_START = 1;
export const ACCEL = 1;

/** Left-rule area for one tick: `v · dt`. */
export function leftSum(v: number, dt: number): number {
  return v * dt;
}

/** Right-rule area: the velocity at the end of the tick. */
export function rightSum(v: number, dt: number, accel = ACCEL): number {
  return (v + accel * dt) * dt;
}

/** Tustin's sum: `dt/2 (v_k + v_{k-1})`. */
export function trapezoidSum(v: number, dt: number, accel = ACCEL): number {
  return (dt / 2) * (v + (v + accel * dt));
}

const dtOf = (values: LabValues) => numberAt(values, 'dt_s', 0.01);
const biasOf = (values: LabValues) => numberAt(values, 'bias', BIAS);

export const accumulateLab: LabSpec = {
  testid: 'bridge-accumulate',
  title: 'Three ways to add an area',
  prompt: 'Left and right differ by one tick; the trapezoid is the average of them.',
  controls: [
    { kind: 'range', id: 'dt_s', label: 'time step', unit: 's', min: 0.001, max: 0.02, step: 0.001, start: 0.01 },
    { kind: 'range', id: 'bias', label: 'sensor bias', unit: 'rad/s', min: 0, max: 0.1, step: 0.005, start: BIAS },
    {
      kind: 'choice',
      id: 'rule',
      label: 'rule',
      options: [
        { value: 'left', label: 'left' },
        { value: 'right', label: 'right' },
        { value: 'trapezoid', label: 'trapezoid' },
      ],
      start: 'trapezoid',
    },
  ],
  pair: { wrong: 'left', right: 'trapezoid', wrongLabel: 'left rule', rightLabel: 'Tustin' },
  readouts: [
    {
      id: 'left',
      label: 'Left',
      text: (values) => leftSum(V_START, dtOf(values)).toFixed(5),
      unit: 'm',
      note: () => 'v * dt',
    },
    {
      id: 'right',
      label: 'Right',
      text: (values) => rightSum(V_START, dtOf(values)).toFixed(5),
      unit: 'm',
      note: () => 'the velocity at the end of the tick',
    },
    {
      id: 'trapezoid',
      label: 'Trapezoid',
      text: (values) => trapezoidSum(V_START, dtOf(values)).toFixed(5),
      unit: 'm',
      note: () => '(dt / 2) × (v_k + v_k−1)',
    },
    {
      id: 'gap',
      label: 'Bracket width',
      text: (values) =>
        Math.abs(rightSum(V_START, dtOf(values)) - leftSum(V_START, dtOf(values))).toFixed(5),
      unit: 'm',
      note: () => 'right − left; the trapezoid sits in the middle',
    },
    {
      id: 'drift',
      label: 'Bias in 60 s',
      text: (values) => (biasOf(values) * 60).toFixed(2),
      unit: 'rad',
      note: () => 'the integrator adds it forever',
    },
  ],
  mark: {
    readout: 'drift',
    value: (values) => biasOf(values) * 60,
    ladder: [3, 0, 0.6, 1.2, 6],
    tolerance: 0.05,
    format: (target) => target.toFixed(2),
  },
  verdict: (values) => {
    const rule = choiceAt(values, 'rule', 'trapezoid');
    return `${rule} sums ${(
      rule === 'left'
        ? leftSum(V_START, dtOf(values))
        : rule === 'right'
          ? rightSum(V_START, dtOf(values))
          : trapezoidSum(V_START, dtOf(values))
    ).toFixed(5)} m this tick, and a ${biasOf(values).toFixed(3)} rad/s bias becomes ${(
      biasOf(values) * 60
    ).toFixed(2)} rad in a minute.`;
  },
};
