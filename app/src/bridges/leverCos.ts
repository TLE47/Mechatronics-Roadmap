/**
 * The lever arm is `L cos θ`, not `L` (`app/src/bridges/leverCos.ts`).
 *
 * Lesson P.12's Bridge Notes builds the torque used everywhere after it: `τ = m·g·L·cos θ`, maximum
 * at 0° and exactly zero at 90°, because the weight then pulls along the link. The learner who
 * forgets the cosine does not get a wrong-looking answer at 30° — 0.849 against 0.981 is 13 %, the
 * size of a rounding difference — which is why the card prints the lever arm beside the torque.
 *
 * The page's constants (m = 0.40 kg, L = 0.25 m, g = 9.81) are the start values, so the first
 * reading is its worked example: 0.981 N·m.
 *
 * Pure functions, no React.
 */
import type { LabSpec, LabValues } from './bridgeLab.ts';
import { numberAt } from './bridgeLab.ts';

/** The page's own numbers. */
export const MASS_KG = 0.4;
export const LENGTH_M = 0.25;
export const GRAVITY = 9.81;

/** The perpendicular lever arm: the horizontal distance from the pivot to the weight's line. */
export function leverArm(length: number, degrees: number): number {
  return length * Math.cos((degrees * Math.PI) / 180);
}

/** The weight force, `m·g`. */
export function weight(mass: number): number {
  return mass * GRAVITY;
}

/** `m·g·L·cos θ`, in newton-metres. */
export function gravityTorque(mass: number, length: number, degrees: number): number {
  return weight(mass) * leverArm(length, degrees);
}

const degOf = (values: LabValues) => numberAt(values, 'theta_deg', 0);
const lengthOf = (values: LabValues) => numberAt(values, 'L_m', LENGTH_M);
const massOf = (values: LabValues) => numberAt(values, 'm_kg', MASS_KG);

export const leverCosLab: LabSpec = {
  testid: 'bridge-lever-cos',
  title: 'The lever arm shrinks',
  prompt: 'At 0° gravity has the whole link to pull on. At 90° it has none of it.',
  controls: [
    {
      kind: 'range',
      id: 'theta_deg',
      label: 'arm angle',
      unit: '°',
      min: 0,
      max: 90,
      step: 1,
      start: 0,
    },
    {
      kind: 'range',
      id: 'L_m',
      label: 'link length',
      unit: 'm',
      min: 0.1,
      max: 0.5,
      step: 0.01,
      start: LENGTH_M,
    },
    {
      kind: 'range',
      id: 'm_kg',
      label: 'tip mass',
      unit: 'kg',
      min: 0.1,
      max: 1,
      step: 0.05,
      start: MASS_KG,
    },
  ],
  readouts: [
    {
      id: 'lever',
      label: 'Lever arm',
      text: (values) => leverArm(lengthOf(values), degOf(values)).toFixed(3),
      unit: 'm',
      note: (values) => `${lengthOf(values)} × cos(${degOf(values)}°)`,
    },
    {
      id: 'force',
      label: 'Weight',
      text: (values) => weight(massOf(values)).toFixed(3),
      unit: 'N',
      note: (values) => `${massOf(values)} × 9.81`,
    },
    {
      id: 'torque',
      label: 'Gravity torque',
      text: (values) => gravityTorque(massOf(values), lengthOf(values), degOf(values)).toFixed(3),
      unit: 'N·m',
      note: () => 'weight × lever arm',
    },
  ],
  mark: {
    readout: 'torque',
    value: (values) => gravityTorque(massOf(values), lengthOf(values), degOf(values)),
    ladder: [0.981, 0, 0.49, 0.694, 0.849],
    tolerance: 0.02,
    format: (target) => target.toFixed(3),
  },
  verdict: (values) => {
    const torque = gravityTorque(massOf(values), lengthOf(values), degOf(values));
    return degOf(values) === 90
      ? 'At 90° the lever arm is zero and gravity pulls along the link: 0.000 N·m.'
      : `At ${degOf(values)}° the lever arm is ${leverArm(lengthOf(values), degOf(values)).toFixed(
          3
        )} m, so gravity can only pull with ${torque.toFixed(3)} N·m.`;
  },
};
