/**
 * Two slots, two lines, one matrix (`app/src/bridges/stateSlots.ts`).
 *
 * Lesson R.3's Bridge Notes reads `x = [q, qd]` aloud: the first line says `q` changes at the rate
 * `qd`, the second says `qd` changes at the rate `(τ − B·qd)/J`. The mistake the page names is
 * swapping which coefficient belongs to which slot — the arithmetic still produces a number, which
 * is why a matrix transcription error needs a printed comparison.
 *
 * The card prints the right row and the swapped row from the same four values.
 */
import type { LabSpec, LabValues } from './bridgeLab.ts';
import { numberAt } from './bridgeLab.ts';

/** Starting values inside the lesson's arm range. */
export const TAU = 0.6;
export const DAMPING_B = 0.1;
export const INERTIA_J = 0.05;

/** `qdot = qd`: the first row is the second slot, read directly. */
export function slotOne(velocity: number): number {
  return velocity;
}

/** `qddot = (τ − B·qd) / J`. */
export function slotTwo(tau: number, b: number, j: number, velocity: number): number {
  if (!Number.isFinite(j) || j <= 0) return 0;
  return (tau - b * velocity) / j;
}

/** The same shape with the coefficients swapped: a number, and not the right one. */
export function swappedRow(tau: number, b: number, j: number, velocity: number): number {
  if (!Number.isFinite(b) || b <= 0) return 0;
  return (tau - j * velocity) / b;
}

const tauOf = (values: LabValues) => numberAt(values, 'tau', TAU);
const bOf = (values: LabValues) => numberAt(values, 'B', DAMPING_B);
const jOf = (values: LabValues) => numberAt(values, 'J', INERTIA_J);
const qdOf = (values: LabValues) => numberAt(values, 'qd', 1);

export const stateSlotsLab: LabSpec = {
  testid: 'bridge-state-slots',
  title: 'Which slot is this',
  prompt: 'x[0] is q and x[1] is qd: one row reads a slot, the other reads two of them.',
  controls: [
    { kind: 'range', id: 'tau', label: 'torque τ', unit: 'N·m', min: 0, max: 2, step: 0.01, start: TAU },
    { kind: 'range', id: 'B', label: 'damping B', unit: '', min: 0.01, max: 1, step: 0.01, start: DAMPING_B },
    { kind: 'range', id: 'J', label: 'inertia J', unit: '', min: 0.01, max: 0.2, step: 0.01, start: INERTIA_J },
    { kind: 'range', id: 'qd', label: 'velocity qd', unit: 'rad/s', min: 0, max: 5, step: 0.1, start: 1 },
  ],
  pair: { wrong: 'swapped', right: 'qddot', wrongLabel: 'J and B swapped', rightLabel: 'the row' },
  readouts: [
    {
      id: 'qddot',
      label: 'x[1] rate',
      text: (values) => slotTwo(tauOf(values), bOf(values), jOf(values), qdOf(values)).toFixed(2),
      unit: 'rad/s²',
      note: () => '(τ − B·qd) / J',
    },
    {
      id: 'swapped',
      label: 'Swapped',
      text: (values) => swappedRow(tauOf(values), bOf(values), jOf(values), qdOf(values)).toFixed(2),
      unit: 'rad/s²',
      note: () => '(τ − J·qd) / B — the same shape, the wrong slot',
    },
    {
      id: 'qdot',
      label: 'x[0] rate',
      text: (values) => slotOne(qdOf(values)).toFixed(2),
      unit: 'rad/s',
      note: () => 'qdot = qd: row one is the second slot',
    },
    {
      id: 'shape',
      label: 'The tick',
      text: () => 'q += qd·dt, qd += qddot·dt',
      note: () => 'two lines, and the matrix is the same two lines stored',
    },
  ],
  mark: {
    readout: 'qddot',
    value: (values) => slotTwo(tauOf(values), bOf(values), jOf(values), qdOf(values)),
    ladder: [10, 2, 4, 8, 12],
    tolerance: 0.2,
    format: (target) => target.toFixed(2),
  },
  verdict: (values) => {
    const qddot = slotTwo(tauOf(values), bOf(values), jOf(values), qdOf(values));
    const swapped = swappedRow(tauOf(values), bOf(values), jOf(values), qdOf(values));
    return `Slot 1 reads ${qdOf(values).toFixed(1)} rad/s; slot 2 changes at ${qddot.toFixed(
      2
    )} rad/s². The swapped row would say ${swapped.toFixed(2)} and look perfectly plausible.`;
  },
};
