/**
 * `>` is not `≥`, and the sign test is a product (`app/src/bridges/bringup.ts`).
 *
 * Lesson 07.1's Bridge Notes lists the pre-flight checks before any closed loop: the unpowered rail
 * must be `> 100 Ω`, the current limit `≤ 0.15 A`, and a positive test pulse must move the encoder
 * the same way (`Δθ · u > 0`). Then two tones give `b̂ = A / |ω(f₁)|`.
 *
 * The card prints the margin against the floor rather than a pass/fail badge, because the one input
 * a beginner gets wrong is 100 Ω exactly — a value that *looks* like the threshold and fails it.
 */
import type { LabSpec, LabValues } from './bridgeLab.ts';
import { numberAt, toggleAt } from './bridgeLab.ts';

/** The page's thresholds. */
export const RAIL_FLOOR_OHM = 100;
export const CURRENT_CEILING_A = 0.15;

/** The excitation used for the first tone. */
export const TORQUE_A = 0.5;
export const TONE_HZ = 1;

/** `Rrail − 100`: positive means the check passes. */
export function railMargin(ohms: number): number {
  return ohms - RAIL_FLOOR_OHM;
}

/** `A / |ω|` at `ω = 2πf`: the damping estimate the first tone gives. */
export function bHat(amplitude: number, hertz: number): number {
  const omega = 2 * Math.PI * hertz;
  if (!Number.isFinite(omega) || omega === 0) return 0;
  return amplitude / Math.abs(omega);
}

const railOf = (values: LabValues) => numberAt(values, 'r_rail', 120);
const limitOf = (values: LabValues) => numberAt(values, 'i_limit', CURRENT_CEILING_A);
const signOf = (values: LabValues) => toggleAt(values, 'sign_ok');

export const bringupLab: LabSpec = {
  testid: 'bridge-bringup',
  title: 'Pre-flight before the loop',
  prompt: '100 Ω is the floor, not a pass: the check is `>`, and the sign test is a product.',
  controls: [
    { kind: 'range', id: 'r_rail', label: 'unpowered rail', unit: 'Ω', min: 10, max: 500, step: 1, start: 120 },
    { kind: 'range', id: 'i_limit', label: 'current limit', unit: 'A', min: 0.01, max: 0.5, step: 0.01, start: CURRENT_CEILING_A },
    { kind: 'toggle', id: 'sign_ok', label: 'encoder sign agrees', start: true },
  ],
  readouts: [
    {
      id: 'margin',
      label: 'Rail margin',
      text: (values) => railMargin(railOf(values)).toFixed(1),
      unit: 'Ω',
      note: () => 'must be positive: 100.0 exactly fails',
    },
    {
      id: 'rail_gate',
      label: 'R > 100 Ω',
      text: (values) => (railMargin(railOf(values)) > 0 ? 'pass' : 'fail'),
      note: () => 'at exactly 100 Ω this reads fail, and that is the lesson',
    },
    {
      id: 'amp_gate',
      label: 'I ≤ 0.15 A',
      text: (values) => (limitOf(values) <= CURRENT_CEILING_A ? 'pass' : 'fail'),
      note: () => 'this one is inclusive',
    },
    {
      id: 'sign_product',
      label: 'Δθ · u',
      text: (values) => (signOf(values) ? '+1.2' : '−1.2'),
      note: () => 'positive means the encoder and the motor agree',
    },
    {
      id: 'b_hat',
      label: 'b̂ at the first tone',
      text: () => bHat(TORQUE_A, TONE_HZ).toFixed(4),
      note: () => 'A / |ω(f₁)|, with A = 0.5 N·m at 1 Hz',
    },
  ],
  mark: {
    readout: 'margin',
    value: (values) => railMargin(railOf(values)),
    ladder: [20, 0, 50, 100, -10],
    tolerance: 1,
    format: (target) => target.toFixed(1),
  },
  verdict: (values) => {
    if (railMargin(railOf(values)) <= 0) {
      return `${railOf(values).toFixed(1)} Ω is not > 100 Ω: a dead short and a healthy rail can both read like this, which is why the check is strict.`;
    }
    if (limitOf(values) > CURRENT_CEILING_A) {
      return `The rail passes, the limit does not: ${limitOf(values).toFixed(2)} A is over the 0.15 A logic limit.`;
    }
    return signOf(values)
      ? `Rail ${railOf(values).toFixed(1)} Ω, limit ${limitOf(values).toFixed(2)} A, sign agrees: the loop may close.`
      : 'The rail and the limit pass, but Δθ · u is negative: swap two motor phases or flip the encoder DIR pin.';
  },
};
